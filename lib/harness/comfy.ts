import chatgpt from './workflows/chatgpt.json' with { type: 'json' };
import sdxl from './workflows/sdxl.json' with { type: 'json' };
import { checked, delay, endpoint } from './types';
import type { Fetcher, HarnessAdapter, ImageRequest, ImageResult, Detection } from './types';
type Graph = Record<string, { class_type: string; inputs: Record<string, unknown> }>;
type NodeInfo = Record<string, {input?: {required?: Record<string, unknown[]>}}>;
export class ComfyAdapter implements HarnessAdapter {
  id = 'comfy'; label = 'ComfyUI';
  capabilities = {generate: true, edit: true, promptHelp: false};
  private base: string;
  private fetcher: Fetcher;
  private pollMs: number;
  private timeoutMs: number;
  private busy = false;
  constructor(url = 'http://127.0.0.1:8188', options: {fetcher?: Fetcher; pollMs?: number; timeoutMs?: number} = {}) {
    this.base = endpoint(url); this.fetcher = options.fetcher ?? fetch;
    this.pollMs = options.pollMs ?? 1000; this.timeoutMs = options.timeoutMs ?? 600_000;
  }
  private async info(signal?: AbortSignal): Promise<NodeInfo> {
    // Large installations have multi-megabyte inventories: probe small node schemas first.
    const nodes = await Promise.all(['CodexChatGPTImage','SaveImage'].map(async name =>
      (await checked(this.fetcher, `${this.base}/object_info/${name}`, {signal}, 2000)).json() as Promise<NodeInfo>));
    const preferred: NodeInfo = Object.assign({}, ...nodes);
    if (preferred.CodexChatGPTImage && preferred.SaveImage) return preferred;
    return (await checked(this.fetcher, `${this.base}/object_info`, {signal}, 5000)).json();
  }
  private choose(info: NodeInfo): {backend: 'chatgpt'|'sdxl'; checkpoint?: string} {
    if (info.CodexChatGPTImage && info.SaveImage) return {backend:'chatgpt'};
    const checkpoints = info.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
    const checkpoint = Array.isArray(checkpoints) ? checkpoints.find((s: unknown) => typeof s === 'string' && /sd.?xl/i.test(s)) : undefined;
    if (checkpoint && ['KSampler','CLIPTextEncode','EmptyLatentImage','VAEDecode','SaveImage'].every(k => info[k])) return {backend:'sdxl',checkpoint};
    throw new Error('No supported image workflow. Install CodexChatGPTImage, or an SDXL checkpoint and standard sampler nodes.');
  }
  async detect(): Promise<Detection> {
    try { const {backend} = this.choose(await this.info()); return {available:true,detail:`Connected: ${backend === 'chatgpt' ? 'ChatGPT subscription' : 'SDXL local fallback'}`}; }
    catch (e) {return {available:false, detail:`${e instanceof Error ? e.message : e}. Check URL, CORS and Local Network Access permission.`};}
  }
  editImage(request: ImageRequest): Promise<ImageResult> {
    if (!request.refs.length) return Promise.reject(new Error('Restyle requires a source image.'));
    return this.generateImage(request);
  }
  async generateImage(request: ImageRequest): Promise<ImageResult> {
    if (this.busy) throw new Error('A generation is already running on this connection.');
    if (!request.prompt.trim()) throw new Error('Enter a prompt.');
    if (request.refs.length > 2) throw new Error('At most two reference images are supported.');
    this.busy = true;
    const started = performance.now();
    const signal = request.signal ? AbortSignal.any([request.signal, AbortSignal.timeout(this.timeoutMs)]) : AbortSignal.timeout(this.timeoutMs);
    try {
      const info = await this.info(signal);
      const {backend,checkpoint} = this.choose(info);
      if (backend === 'sdxl' && request.refs.length > 1 && !request.mask) throw new Error('SDXL accepts one reference image.');
      const controls = info.ControlNetLoader?.input?.required?.control_net_name?.[0];
      const control = Array.isArray(controls) ? controls.find((name: unknown) => typeof name === 'string' && /canny/i.test(name) && /xl/i.test(name)) : undefined;
      if (backend === 'sdxl' && request.mask && (!control || !['VAEEncodeForInpaint','ImageToMask','ControlNetApplyAdvanced','Canny'].every(k => info[k]))) {
        throw new Error('Masked SDXL editing requires VAEEncodeForInpaint, Canny and a canny SDXL ControlNet model. No unmasked fallback was submitted.');
      }
      const graph: Graph = structuredClone(backend === 'chatgpt' ? chatgpt : sdxl);
      const seed = Math.floor(Math.random() * 2147483647);
      if (backend === 'chatgpt') Object.assign(graph['1'].inputs,{prompt:request.prompt,size:request.size,seed});
      else {
        graph['1'].inputs.ckpt_name = checkpoint;
        graph['2'].inputs.text = request.prompt;
        const [width,height] = request.size.split('x').map(Number);
        Object.assign(graph['4'].inputs,{width,height});
        graph['5'].inputs.seed = seed;
      }
      const refs = backend === 'sdxl' && request.mask ? request.refs.slice(0,1) : request.refs;
      for (const [i,blob] of refs.entries()) {
        if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 20_000_000) throw new Error('References must be PNG/JPEG/WebP under 20 MB.');
        const form = new FormData(); form.append('image',blob,`studio-${crypto.randomUUID()}.${blob.type === 'image/jpeg' ? 'jpg' : blob.type.split('/')[1]}`);
        form.append('type','input'); form.append('overwrite','false');
        const upload = await (await checked(this.fetcher,`${this.base}/upload/image`,{method:'POST',body:form,signal},30_000)).json();
        if (typeof upload.name !== 'string') throw new Error('Upload returned no image name.');
        const id = backend === 'chatgpt' ? String(3+i) : '8';
        graph[id] = {class_type:'LoadImage',inputs:{image:upload.subfolder ? `${upload.subfolder}/${upload.name}` : upload.name}};
        if (backend === 'chatgpt') graph['1'].inputs[i ? 'image2' : 'image'] = [id,0];
        else {
          graph['9'] = {class_type:'VAEEncode',inputs:{pixels:[id,0],vae:['1',2]}};
          graph['5'].inputs.latent_image = ['9',0]; graph['5'].inputs.denoise = 0.55;
        }
      }
      if (backend === 'sdxl' && request.mask) {
        if (request.mask.type !== 'image/png' || request.mask.size > 20_000_000) throw new Error('Mask must be a PNG under 20 MB.');
        const form = new FormData(); form.append('image', request.mask, `part-mask-${crypto.randomUUID()}.png`); form.append('type','input'); form.append('overwrite','false');
        const uploaded = await (await checked(this.fetcher,`${this.base}/upload/image`,{method:'POST',body:form,signal},30_000)).json();
        if (typeof uploaded.name !== 'string') throw new Error('Mask upload returned no image name.');
        graph['10'] = {class_type:'LoadImage',inputs:{image:uploaded.subfolder ? `${uploaded.subfolder}/${uploaded.name}` : uploaded.name}};
        graph['11'] = {class_type:'ImageToMask',inputs:{image:['10',0],channel:'red'}};
        graph['9'] = {class_type:'VAEEncodeForInpaint',inputs:{pixels:['8',0],vae:['1',2],mask:['11',0],grow_mask_by:0}};
        graph['12'] = {class_type:'ControlNetLoader',inputs:{control_net_name:control}};
        graph['14'] = {class_type:'Canny',inputs:{image:['8',0],low_threshold:0.2,high_threshold:0.6}};
        graph['13'] = {class_type:'ControlNetApplyAdvanced',inputs:{positive:['2',0],negative:['3',0],control_net:['12',0],image:['14',0],strength:0.7,start_percent:0,end_percent:1}};
        graph['5'].inputs.positive = ['13',0]; graph['5'].inputs.negative = ['13',1];
      }
      const queued = await (await checked(this.fetcher,`${this.base}/prompt`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:graph,client_id:crypto.randomUUID()}),signal},30_000)).json();
      if (!queued.prompt_id || queued.error || Object.keys(queued.node_errors ?? {}).length) throw new Error(`Workflow rejected: ${JSON.stringify(queued)}`);
      // Never retry /prompt or silently switch provider after submission: that can spend twice.
      for (;;) {
        signal.throwIfAborted();
        const history = await (await checked(this.fetcher,`${this.base}/history/${encodeURIComponent(queued.prompt_id)}`,{signal},10_000)).json();
        const entry = history[queued.prompt_id];
        if (entry?.status?.status_str === 'error') throw new Error(`Generation failed: ${JSON.stringify(entry.status.messages)}`);
        const images = Object.values(entry?.outputs ?? {}).flatMap(v => (v as {images?: {filename:string;subfolder?:string;type?:string}[]}).images ?? []);
        if (images.length) {
          const image = images[0];
          const query = new URLSearchParams({filename:image.filename,subfolder:image.subfolder ?? '',type:image.type ?? 'output'});
          const blob = await (await checked(this.fetcher,`${this.base}/view?${query}`,{signal},30_000)).blob();
          if (!blob.type.startsWith('image/')) throw new Error('Harness returned a non-image result.');
          return {blob,backend,promptId:queued.prompt_id,seconds:(performance.now()-started)/1000};
        }
        if (entry?.status?.completed) throw new Error('Workflow completed without an image.');
        await delay(this.pollMs,signal);
      }
    } finally { this.busy = false; }
  }
}
