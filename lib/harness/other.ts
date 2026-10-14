import {checked, endpoint} from './types';
import type {HarnessAdapter, ImageRequest, ImageResult, Fetcher, Detection} from './types';
export class OpenAIAdapter implements HarnessAdapter {
  id = 'openai'; label = 'OpenAI-compatible';
  capabilities = {generate:true,edit:true,promptHelp:false};
  private base: string; private model: string; private fetcher: Fetcher;
  constructor(url = 'http://127.0.0.1:8642/v1', model = 'gpt-image-1', options: {fetcher?: Fetcher} = {}) {
    this.base = endpoint(url); this.model = model; this.fetcher = options.fetcher ?? fetch;
  }
  async detect(): Promise<Detection> {
    try {
      const data = await (await checked(this.fetcher,`${this.base}/models`,{},2000)).json();
      if (!Array.isArray(data.data)) throw new Error('Expected OpenAI /models response.');
      return {available:true,detail:'API reachable. Image generation/edit support depends on the configured model and server.'};
    } catch(e) {return {available:false,detail:String(e)};}
  }
  editImage(request: ImageRequest): Promise<ImageResult> {
    if (!request.refs.length) return Promise.reject(new Error('Restyle requires a source image.'));
    return this.generateImage(request);
  }
  async generateImage(request: ImageRequest): Promise<ImageResult> {
    if (!request.prompt.trim()) throw new Error('Enter a prompt.');
    if (request.refs.length > 1) throw new Error('This compatible adapter supports one reference.');
    const start = performance.now();
    let body: BodyInit; let headers: HeadersInit | undefined;
    if (request.refs.length) {
      const form = new FormData();
      form.append('model',this.model); form.append('prompt',request.prompt); form.append('size',request.size); form.append('n','1');
      form.append('image',request.refs[0],'hero.png'); body = form;
    } else {
      headers = {'Content-Type':'application/json'};
      body = JSON.stringify({model:this.model,prompt:request.prompt,size:request.size,n:1,response_format:'b64_json'});
    }
    const data = await (await checked(this.fetcher,`${this.base}/images/${request.refs.length ? 'edits' : 'generations'}`,{method:'POST',headers,body,signal:request.signal},600_000)).json();
    const image = data.data?.[0];
    let blob: Blob;
    if (typeof image?.b64_json === 'string') blob = new Blob([Uint8Array.from(atob(image.b64_json), c => c.charCodeAt(0))],{type:'image/png'});
    else if (typeof image?.url === 'string') {
      const url = new URL(image.url, this.base);
      if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Unsafe output image URL.');
      blob = await (await checked(this.fetcher,url.href,{signal:request.signal},30_000)).blob();
      if (!blob.type.startsWith('image/')) throw new Error('Output URL did not return an image.');
    } else throw new Error('API did not return an image. Check model and /images support.');
    return {blob,backend:'openai-compatible',seconds:(performance.now()-start)/1000};
  }
}
export class OllamaAdapter implements HarnessAdapter {
  id = 'ollama'; label = 'Ollama';
  capabilities = {generate:false,edit:false,promptHelp:true};
  private base: string; private fetcher: Fetcher; private model = '';
  constructor(url = 'http://127.0.0.1:11434', options: {fetcher?: Fetcher} = {}) {this.base = endpoint(url); this.fetcher = options.fetcher ?? fetch;}
  async detect(): Promise<Detection> {
    try {
      const data = await (await checked(this.fetcher,`${this.base}/api/tags`,{},2000)).json();
      this.model = data.models?.[0]?.name ?? '';
      return {available:!!this.model,detail:this.model ? `${this.model}: prompt help only` : 'No models installed. Run ollama pull <model>.'};
    } catch(e) {return {available:false,detail:String(e)};}
  }
  async helpPrompt(prompt: string, signal?: AbortSignal): Promise<string> {
    if (!this.model && !(await this.detect()).available) throw new Error('Connect Ollama with an installed model first.');
    const data = await (await checked(this.fetcher,`${this.base}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:this.model,stream:false,prompt:`Rewrite as a concise image restyling prompt. Preserve the robot geometry and camera. Return only the prompt.\n${prompt}`}),signal},120_000)).json();
    if (typeof data.response !== 'string' || !data.response.trim()) throw new Error('Ollama returned no prompt.');
    return data.response;
  }
  async generateImage(): Promise<ImageResult> {throw new Error('Ollama provides prompt help only.');}
  async editImage(): Promise<ImageResult> {throw new Error('Ollama provides prompt help only.');}
}
export async function probeHarnesses(adapters: HarnessAdapter[]): Promise<(Detection & {id:string})[]> {
  return Promise.all(adapters.map(async adapter => {
    try {return {id:adapter.id,...await adapter.detect()};}
    catch(e) {return {id:adapter.id,available:false,detail:String(e)};}
  }));
}
