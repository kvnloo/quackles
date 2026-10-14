'use client';

import dynamic from 'next/dynamic';
import Image from 'next/image';
import {useCallback, useEffect, useRef, useState} from 'react';
import {ComfyAdapter} from '@/lib/harness/comfy';
import {OpenAIAdapter, OllamaAdapter, probeHarnesses} from '@/lib/harness/other';
import type {HarnessAdapter} from '@/lib/harness/types';
import {PRESETS, SLOTS, STORAGE_KEY, parseTheme, serializeTheme} from '@/lib/studio/theme';
import type {Slot, StudioTheme} from '@/lib/studio/theme';
import type {Capture} from './StudioScene';
import styles from './Studio.module.css';
const Scene = dynamic(()=>import('./StudioScene'),{ssr:false,loading:()=> <p>Loading 3D editor…</p>});
const LABELS: Record<Slot,string> = {shell:'Robot shell',stone:'Stone',print:'Print panel',poster:'Poster',background:'Background'};
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function dataURL(blob: Blob): Promise<string> {
  return new Promise((resolve,reject)=>{const reader = new FileReader(); reader.onload=()=>resolve(String(reader.result)); reader.onerror=()=>reject(new Error('Could not read image.')); reader.readAsDataURL(blob);});
}
async function portableTexture(blob: Blob): Promise<string> {
  if (!['image/png','image/jpeg','image/webp'].includes(blob.type) || blob.size > 20_000_000) throw new Error('Choose PNG, JPEG or WebP under 20 MB.');
  const image = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas'); const scale = Math.min(1,2048/Math.max(image.width,image.height));
    canvas.width = Math.round(image.width*scale); canvas.height = Math.round(image.height*scale);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Image conversion unavailable.');
    ctx.drawImage(image,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/webp',0.9);
  } finally {image.close();}
}
export default function Studio() {
  const [theme,setTheme] = useState<StudioTheme>(()=>structuredClone(PRESETS[0]));
  const [slot,setSlot] = useState<Slot>('shell');
  const [ready,setReady] = useState(false);
  const [status,setStatus] = useState('Choose a preset, then make it yours.');
  const [error,setError] = useState('');
  const [kind,setKind] = useState('comfy');
  const [url,setUrl] = useState('http://127.0.0.1:8188');
  const [model,setModel] = useState('gpt-image-1');
  const [adapter,setAdapter] = useState<HarnessAdapter|null>(null);
  const [connection,setConnection] = useState('Not connected. Local ports are only probed when you ask.');
  const [consent,setConsent] = useState(false);
  const [busy,setBusy] = useState(false);
  const [source,setSource] = useState('');
  const [result,setResult] = useState('');
  const resultBlob = useRef<Blob|null>(null);
  const capture = useRef<Capture|null>(null);
  const controller = useRef<AbortController|null>(null);
  const running = useRef(false);
  const connectionEpoch = useRef(0);
  const onCapture = useCallback((fn: Capture)=>{capture.current=fn;},[]);
  const onError = useCallback((message: string)=>setError(message),[]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const task = async (fn:()=>void|Promise<void>) => {setError(''); try {await fn();} catch(e) {setError(e instanceof Error ? e.message : String(e));}};
  const disconnect = () => {connectionEpoch.current++;setAdapter(null); setConsent(false); setConnection('Settings changed. Connect again.');};
  const makeAdapter = (): HarnessAdapter => kind==='comfy' ? new ComfyAdapter(url) : kind==='ollama' ? new OllamaAdapter(url) : new OpenAIAdapter(url,model);
  async function connect() {
    const epoch = ++connectionEpoch.current;
    const next = makeAdapter(); const detection = await next.detect();
    if (epoch !== connectionEpoch.current) return;
    setConnection(detection.detail); setAdapter(detection.available ? next : null);
  }
  async function probe() {
    const adapters = [new ComfyAdapter(),new OpenAIAdapter(),new OllamaAdapter()];
    const found = await probeHarnesses(adapters);
    setConnection(found.map(d=>`${adapters.find(a=>a.id===d.id)?.label}: ${d.available ? d.detail : 'not available (URL/CORS/permission)'}`).join(' • '));
  }
  async function exportPNG() {
    if (!ready || !capture.current) throw new Error('Wait for the 3D scene and textures to load.');
    download(await capture.current(),'quackles-hero.png'); setStatus('Exported 1024 × 1536 PNG.');
  }
  async function generate(restyle: boolean) {
    if (!adapter || !consent) throw new Error('Connect a harness and allow image transfer first.');
    if (running.current) return;
    running.current=true; setBusy(true); controller.current=new AbortController();
    const signal = controller.current.signal;
    try {
      setStatus(restyle ? 'Capturing hero, then sending one restyle request…' : 'Sending one texture request…');
      let refs: Blob[]=[];
      if (restyle) {
        if (!capture.current || !ready) throw new Error('Wait for the 3D scene.');
        const hero = await capture.current(); refs=[hero]; setSource(await dataURL(hero));
      } else setSource('');
      setResult(''); resultBlob.current=null;
      const request = {prompt:theme.prompt,refs,size:restyle ? '1024x1536' as const : '1024x1024' as const,signal};
      const output = await (restyle ? adapter.editImage(request) : adapter.generateImage(request));
      signal.throwIfAborted();
      resultBlob.current=output.blob; setResult(await dataURL(output.blob));
      setStatus(`${restyle ? 'Restyle' : 'Texture'} ready in ${output.seconds.toFixed(1)}s via ${output.backend}. Nothing applied automatically.`);
    } finally {running.current=false;setBusy(false);controller.current=null;}
  }
  return <main className={styles.studio}>
    <header className={styles.header}>
      <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/`}>Quackles / Microduck</a>
      <span>Local-first design tools</span>
    </header>
    <div className={styles.heading}><h1>Robot theme studio</h1><p>Your robot. Your materials. Your own image harness.</p></div>
    <div className={styles.workspace}>
      <section className={styles.preview} aria-label="Locked hero preview">
        <div className={styles.previewBar}><span>Day set / locked hero camera</span><button disabled={!ready || busy} onClick={()=>task(exportPNG)}>Export PNG</button></div>
        <div className={styles.stage}><div className={styles.canvas} data-scene-ready={ready}>
          <Scene theme={theme} onReady={setReady} onCapture={onCapture} onError={onError} />
          {!ready && <span className={styles.loading}>Preparing geometry and materials…</span>}
        </div></div>
        <p className={styles.note}>Real 3D geometry from the locked Day scene. Web PBR preview; not a Cycles render. Export is 1024 × 1536.</p>
      </section>
      <aside className={styles.controls}>
        <section><h2>Theme & materials</h2>
          <div className={styles.presets}>{PRESETS.map(p=><button key={p.id} aria-pressed={theme.id===p.id} disabled={busy} onClick={()=>{setTheme(structuredClone(p));setStatus(`${p.name} starting palette loaded.`);}}><span style={{background:p.colors.background}}/>{p.name}</button>)}</div>
          <label>Theme name<input value={theme.name} maxLength={200} onChange={e=>setTheme({...theme,name:e.target.value})}/></label>
          <div className={styles.pair}>
            <label>Texture slot<select value={slot} onChange={e=>setSlot(e.target.value as Slot)}>{SLOTS.map(s=><option key={s} value={s}>{LABELS[s]}</option>)}</select></label>
            <label>Base tint<input type="color" value={theme.colors[slot]} onChange={e=>setTheme({...theme,colors:{...theme.colors,[slot]:e.target.value}})}/></label>
          </div>
          <label>Upload texture<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f) task(async()=>{const texture=await portableTexture(f);setTheme(t=>({...t,textures:{...t.textures,[slot]:texture}}));setStatus(`Applied texture to ${LABELS[slot]}.`);});e.target.value='';}}/></label>
          {theme.textures[slot] && <button onClick={()=>setTheme(t=>{const textures={...t.textures};delete textures[slot];return {...t,textures};})}>Clear texture</button>}
          <p className={styles.note}>Uploads stay in your browser. Textures are embedded at up to 2K. New textures use their own colors.</p>
          <div className={styles.pair}>
            <label>Key light<input type="range" min="0" max="8" step="0.1" value={theme.lighting.intensity} onChange={e=>setTheme({...theme,lighting:{...theme.lighting,intensity:Number(e.target.value)}})}/></label>
            <label>Exposure<input type="range" min="0.1" max="3" step="0.05" value={theme.lighting.exposure} onChange={e=>setTheme({...theme,lighting:{...theme.lighting,exposure:Number(e.target.value)}})}/></label>
          </div>
          <label>Light color<input type="color" value={theme.lighting.warmth} onChange={e=>setTheme({...theme,lighting:{...theme.lighting,warmth:e.target.value}})}/></label>
          <div className={styles.actions}>
            <button onClick={()=>task(()=>{localStorage.setItem(STORAGE_KEY,serializeTheme(theme));setStatus('Saved in this browser. Export JSON for a durable copy.');})}>Save locally</button>
            <button onClick={()=>task(()=>{const value=localStorage.getItem(STORAGE_KEY);if(!value) throw new Error('No saved theme in this browser.');setTheme(parseTheme(value));setStatus('Saved theme loaded.');})}>Load saved</button>
            <button onClick={()=>task(()=>download(new Blob([serializeTheme(theme)],{type:'application/json'}),'quackles-theme.json'))}>Export JSON</button>
          </div>
          <label>Import theme JSON<input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f) task(async()=>{if(f.size>24_000_000) throw new Error('Theme exceeds 24 MB.');setTheme(parseTheme(await f.text()));setStatus('Theme imported.');});e.target.value='';}}/></label>
        </section>
        <section><h2>Connect your harness</h2>
          <p className={styles.note}>No Quackles account or hosted proxy. Requests go directly to the URL below. ChatGPT uses the login already held by your ComfyUI node.</p>
          <fieldset disabled={busy}>
            <label>Harness<select value={kind} onChange={e=>{const k=e.target.value;setKind(k);setUrl(k==='comfy'?'http://127.0.0.1:8188':k==='ollama'?'http://127.0.0.1:11434':'http://127.0.0.1:8642/v1');disconnect();}}><option value="comfy">ComfyUI (ChatGPT first)</option><option value="openai">OpenAI-compatible / Hermes</option><option value="ollama">Ollama (prompt help only)</option></select></label>
            <label>Harness URL<input type="url" value={url} onChange={e=>{setUrl(e.target.value);disconnect();}}/></label>
            {kind==='openai' && <label>Image model<input value={model} onChange={e=>{setModel(e.target.value);disconnect();}}/></label>}
            <div className={styles.actions}><button onClick={()=>task(connect)}>Connect</button><button onClick={()=>task(probe)}>Probe local ports</button></div>
          </fieldset>
          <p className={styles.connection} role="status">{connection}</p>
          <details><summary>Connection & CORS help</summary><p>Allow Local Network Access if your browser asks. On HTTPS, remote HTTP servers may be blocked as mixed content. Prefer loopback or HTTPS.</p><p>Start ComfyUI with your studio origin (restart required):</p><code>python main.py --listen 127.0.0.1 --port 8188 --enable-cors-header &quot;{typeof window==='undefined' ? 'http://localhost:43217' : window.location.origin}&quot;</code><p>Ollama: set OLLAMA_ORIGINS to this origin before starting ollama serve. Compatible servers need CORS and /v1/images endpoints; /models alone does not prove image support.</p><p>ChatGPT is preferred when its node is installed; otherwise an installed SDXL checkpoint is used. Failed jobs are never automatically resubmitted. Stop waiting does not cancel a queued server job: inspect the harness before retrying.</p></details>
        </section>
      </aside>
    </div>
    <section className={styles.restyle}>
      <div><h2>AI restyle</h2><p>Keep the composition. Change the finish.</p><label>Theme prompt<textarea rows={4} maxLength={8000} value={theme.prompt} onChange={e=>setTheme({...theme,prompt:e.target.value})}/></label>
        <label className={styles.consent}><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>Allow this harness to receive my prompt and exported hero. Its provider may process them remotely and use my subscription allowance.</label>
        <div className={styles.actions}>
          <button className={styles.primary} disabled={!ready || !adapter?.capabilities.edit || !consent || busy} onClick={()=>task(()=>generate(true))}>Restyle hero</button>
          <button disabled={!adapter?.capabilities.generate || !consent || busy} onClick={()=>task(()=>generate(false))}>Generate texture</button>
          {adapter?.capabilities.promptHelp && <button disabled={!consent || busy} onClick={()=>task(async()=>{setBusy(true);try {const prompt=await adapter.helpPrompt!(theme.prompt);setTheme(t=>({...t,prompt}));}finally{setBusy(false);}})}>Improve prompt</button>}
          {busy && <button onClick={()=>{controller.current?.abort();setStatus('Stopped waiting. The harness job may still run; check it before retrying.');}}>Stop waiting</button>}
        </div>
      </div>
      <div className={styles.results}>
        <figure>{source ? <Image unoptimized width={1024} height={1536} src={source} alt="Source 3D hero"/> : <div className={styles.empty}>Your exported hero appears here.</div>}<figcaption>3D source</figcaption></figure>
        <figure>{result ? <Image unoptimized width={1024} height={1536} src={result} alt="Harness generated result"/> : <div className={styles.empty}>Connect a harness to create a restyle or texture.</div>}<figcaption>AI result</figcaption></figure>
        {result && <div className={styles.actions}><button onClick={()=>resultBlob.current && download(resultBlob.current,'quackles-restyle.png')}>Download result</button><button onClick={()=>task(async()=>{if(resultBlob.current){const texture=await portableTexture(resultBlob.current);setTheme(t=>({...t,textures:{...t.textures,[slot]:texture}}));setStatus(`Generated image applied to ${LABELS[slot]}.`);}})}>Apply to {LABELS[slot]}</button></div>}
      </div>
    </section>
    <footer className={styles.feedback}><p role="status">{status}</p>{error && <p role="alert">{error}</p>}</footer>
  </main>;
}
