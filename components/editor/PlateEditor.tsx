'use client';

import {useEffect, useRef, useState, useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {ComfyAdapter} from '@/lib/harness/comfy';
import {snapshot, subscribe} from '@/lib/sequence/store';
import {THEME_IDS, type ThemeId} from '@/lib/sequence/manifest';
import {inspectionSnapshot} from '@/lib/sequence/inspection';
import {inspectionCrop} from '@/lib/sequence/render';
import {bboxTarget, partAt, type Part} from '@/lib/editor/mask';
import {editInputs, highlight, loadSurface, maskedPatch, paintEdits, type Surface} from '@/lib/editor/surface';
import {loadTheme, saveTheme} from '@/lib/editor/storage';
import {PRESETS, type StudioTheme, type PartEdit} from '@/lib/studio/theme';
import './editor.css';

const EMPTY: PartEdit = {color:'#c9dbcb', amount:0, tone:0, prompt:''};

export function PlateEditor() {
  const presented = useSyncExternalStore(subscribe, () => snapshot().presented, () => 2);
  const theme = THEME_IDS[Math.round(presented)];
  return <ThemeEditor key={theme} themeId={theme} transitioning={Math.abs(presented-Math.round(presented))>.001} />;
}
function ThemeEditor({themeId, transitioning}: {themeId: ThemeId; transitioning: boolean}) {
  const [active, setActive] = useState(false);
  const [surface, setSurface] = useState<Surface | null>(null);
  const [theme, setTheme] = useState<StudioTheme>(() => structuredClone(PRESETS.find(t=>t.id===themeId)!));
  const [selected, setSelected] = useState<Part | null>(null);
  const [before, setBefore] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connection, setConnection] = useState('Not checked');
  const [url, setUrl] = useState('http://127.0.0.1:8188');
  const [details, setDetails] = useState(false);
  const [texture, setTexture] = useState<File>();
  const [candidate, setCandidate] = useState<{blob: Blob; bbox: [number,number,number,number]; promptId?: string} | null>(null);
  const hint = useRef<HTMLParagraphElement>(null);
  const generation = useRef<AbortController | null>(null);
  const surfaceRef = useRef<Surface | null>(null);
  const adapter = useRef(new ComfyAdapter());
  const connectionVersion = useRef(0);
  const serial = useRef(Promise.resolve());
  const edit = selected ? theme.partEdits?.[selected.id] ?? EMPTY : EMPTY;

  useEffect(() => {
    const controller = new AbortController();
    void loadTheme(themeId).then(async saved => {
      if (!saved || controller.signal.aborted) return;
      setTheme(saved);
      if (Object.keys(saved.partEdits ?? {}).length) {
        const loaded = await loadSurface(themeId,controller.signal);
        if (controller.signal.aborted) return;
        surfaceRef.current = loaded; setSurface(loaded);
      }
    }).catch(e => {if (!controller.signal.aborted) setMessage(String(e));});
    return () => { controller.abort(); generation.current?.abort(); };
  }, [themeId]);

  useEffect(() => {
    if (!surface) return;
    const camera=document.querySelector('.sequence-camera');
    camera?.append(surface.overlay,surface.highlight);
    return () => {surface.overlay.remove();surface.highlight.remove();};
  }, [surface]);

  useEffect(() => {
    if (!surface) return;
    const controller=new AbortController();
    void paintEdits(surface,theme,controller.signal).catch(e=>{if(!controller.signal.aborted)setMessage(String(e));});
    return ()=>controller.abort();
  }, [surface,theme]);

  useEffect(() => {
    if (surface) {
      surface.overlay.style.visibility=before || transitioning?'hidden':'visible';
      surface.highlight.style.visibility=active && !transitioning?'visible':'hidden';
    }
  }, [surface,before,active,transitioning]);

  useEffect(() => {
    const frame=document.querySelector<HTMLElement>('.poster-frame');
    if (!frame || !active || !surface) return;
    frame.dataset.editing='true';
    let hovered=0;
    highlight(surface,selected?.id ?? 0);
    const isChrome=(target: EventTarget | null) => target instanceof Element && !!target.closest('a,button,input,select,textarea,.editor-panel,.site-nav');
    const lookup=(event: MouseEvent) => {
      const rect=frame.getBoundingClientRect(), state=inspectionSnapshot(), crop=inspectionCrop(state.zoom,state.focusX,state.focusY);
      return partAt(surface.ids,surface.manifest.width,surface.manifest.height,crop.x+(event.clientX-rect.left)/rect.width*crop.width,crop.y+(event.clientY-rect.top)/rect.height*crop.height);
    };
    const move=(event: PointerEvent) => {
      const id=isChrome(event.target)?0:lookup(event);
      if(id===hovered) return; hovered=id;
      highlight(surface,id || selected?.id || 0);
      if(hint.current) hint.current.textContent=surface.manifest.parts.find(p=>p.id===id)?.label ?? 'Select a part of the scene';
    };
    const click=(event: MouseEvent) => {
      if(isChrome(event.target)) return;
      event.preventDefault(); event.stopPropagation();
      choose(surface.manifest.parts.find(p=>p.id===lookup(event)) ?? null);
    };
    const escape=(event: KeyboardEvent) => {if(event.key==='Escape') close();};
    frame.addEventListener('pointermove',move); frame.addEventListener('click',click,true); window.addEventListener('keydown',escape);
    return ()=>{delete frame.dataset.editing;frame.removeEventListener('pointermove',move);frame.removeEventListener('click',click,true);window.removeEventListener('keydown',escape);highlight(surface,0);};
    // Event handlers intentionally close over this selected part and surface.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[active,surface,selected]);

  async function connect() {
    const version=++connectionVersion.current;
    setConnection('Checking local connection'); setConnected(false);
    try {
      const next=new ComfyAdapter(url), detection=await next.detect();
      if(version!==connectionVersion.current) return;
      adapter.current=next;setConnected(detection.available);setConnection(detection.detail);
    } catch(e) {if(version===connectionVersion.current)setConnection(String(e));}
  }
  async function enter() {
    setActive(true);setMessage('Loading part masks');
    window.__QUACKLES_INSPECTION__?.reset();
    try {
      if(!surfaceRef.current) {
        const loaded=await loadSurface(themeId,new AbortController().signal);
        surfaceRef.current=loaded;setSurface(loaded);
      }
      setMessage('');void connect();
    } catch(e) {setMessage(String(e));}
  }
  function close() {
    generation.current?.abort();setActive(false);setSelected(null);setCandidate(null);setBefore(false);
    window.__QUACKLES_INSPECTION__?.reset();
    document.querySelector<HTMLButtonElement>('.editor-toggle')?.focus();
  }
  function choose(part: Part | null) {
    if(!part?.bbox || !surface || busy) return;
    setSelected(part);setCandidate(null);setTexture(undefined);setMessage('');setBefore(false);
    highlight(surface,part.id);
    const target=bboxTarget(part.bbox,surface.manifest.width,surface.manifest.height,inspectionSnapshot().maxZoom);
    window.__QUACKLES_INSPECTION__?.setTarget(target.zoom,target.x,target.y);
  }
  function persist(next: StudioTheme, patch?: {key: string; blob: Blob}) {
    if (!patch) setTheme(next);
    // Serialize rapid slider commits so an older write cannot win a race.
    serial.current=serial.current.catch(()=>{}).then(()=>saveTheme(next,patch));
    void serial.current.then(()=>{if(patch)setTheme(next);setMessage('Saved on this device');}).catch(e=>setMessage(`Not saved: ${String(e)}`));
  }
  function update(values: Partial<PartEdit>) {
    if(!selected) return;
    const next={...theme,partEdits:{...theme.partEdits,[selected.id]:{...edit,...values}}};
    persist(next);
  }
  async function generate() {
    if(!surface || !selected?.bbox || !edit.prompt.trim() || busy) return;
    const controller=new AbortController();generation.current=controller;setBusy(true);setMessage('Preparing masked image edit');setCandidate(null);
    try {
      const inputs=await editInputs(surface,selected.id,selected.bbox,texture);
      const prompt=`Edit image 1, a crop of a finished Blender photograph. Preserve the camera, silhouette, geometry, lighting, shadows and fine detail. Change ONLY the ${selected.label}. Image 2 ${texture?'has a white-on-black selection mask in its TOP half and the material reference in its BOTTOM half':'is a white-on-black selection mask'}. White is editable, black must remain unchanged. Return only the edited image 1 crop, with exactly the same framing and aspect ratio, no borders or mask. Requested change: ${edit.prompt}`;
      setMessage('Generating with local ComfyUI');
      const result=await adapter.current.editImage({prompt,refs:[inputs.source,inputs.guide],mask:inputs.mask,size:inputs.crop[2]===inputs.crop[3]?'1024x1024':inputs.crop[2]>inputs.crop[3]?'1536x1024':'1024x1536',signal:controller.signal});
      const blob=await maskedPatch(surface,selected.id,inputs.crop,result.blob);
      if(controller.signal.aborted) return;
      setCandidate({blob,bbox:inputs.crop,promptId:result.promptId});
      setMessage('Image ready. Apply to this part.');
    } catch(e) {if(!controller.signal.aborted)setMessage(`Edit failed: ${String(e)}`);}
    finally {setBusy(false);}
  }
  function apply() {
    if(!candidate || !selected) return;
    const key=`${themeId}:${selected.id}:${crypto.randomUUID()}`;
    persist({...theme,partEdits:{...theme.partEdits,[selected.id]:{...edit,amount:0,tone:0,patchKey:key,bbox:candidate.bbox}}},{key,blob:candidate.blob});
    setCandidate(null);
  }
  function revert() {
    if(!selected) return;
    const edits={...theme.partEdits};delete edits[selected.id];persist({...theme,partEdits:edits});setCandidate(null);setBefore(false);
  }
  return <>
    <button type="button" className="editor-toggle" aria-pressed={active} onClick={()=>active?close():void enter()}>{active?'Done':'Edit'}</button>
    {active && <>
      <p ref={hint} className="editor-hint" aria-live="polite">{surface?'Select a part of the scene':'Loading part masks'}</p>
      {createPortal(<aside className="editor-panel" aria-label="Part editor" aria-busy={busy}>
        <header><span>{selected?'Customize':'Edit scene'}</span><button type="button" onClick={close} aria-label="Close editor">Close</button></header>
        <label className="editor-part-label" htmlFor="editor-part">Part</label>
        <select id="editor-part" value={selected?.id ?? ''} disabled={!surface || busy} onChange={e=>choose(surface?.manifest.parts.find(p=>p.id===Number(e.target.value)) ?? null)}>
          <option value="">Select on the image</option>
          {surface?.manifest.parts.filter(p=>p.bbox).map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {selected ? <>
          <fieldset disabled={busy}>
            <legend>Colour & tone</legend>
            <label className="editor-color">Tint<input aria-label="Tint colour" type="color" value={edit.color} onChange={e=>update({color:e.target.value,amount:edit.amount || .35})}/></label>
            <label>Amount<input type="range" min="0" max="1" step="0.01" value={edit.amount} onChange={e=>update({amount:Number(e.target.value)})}/></label>
            <label>Tone<input type="range" min="-1" max="1" step="0.01" value={edit.tone} onChange={e=>update({tone:Number(e.target.value)})}/></label>
          </fieldset>
          <fieldset disabled={busy}>
            <legend>Material & texture</legend>
            <label className="editor-upload">{texture?texture.name:'Upload a reference'}<input aria-label="Material reference" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f && f.size>20_000_000){setMessage('Use an image smaller than 20 MB.');return;}setTexture(f);}}/></label>
            <label htmlFor="editor-prompt">Describe this part</label>
            <textarea id="editor-prompt" rows={3} maxLength={7000} value={edit.prompt} placeholder="Satin ceramic, a soft sage tint…" onChange={e=>update({prompt:e.target.value})}/>
            <button className="editor-generate" type="button" disabled={!connected || !edit.prompt.trim()} onClick={()=>void generate()}>Generate image edit</button>
          </fieldset>
          {busy && <button type="button" onClick={()=>{generation.current?.abort();setMessage('Stopped waiting. The queued job may still finish.');}}>Stop waiting</button>}
          {candidate && <button className="editor-generate" type="button" onClick={apply}>Apply to {selected.label.toLowerCase()}</button>}
          <div className="editor-actions"><button type="button" aria-pressed={before} onClick={()=>setBefore(!before)}>{before?'Show after':'Show before'}</button><button type="button" disabled={busy} onClick={revert}>Revert part</button></div>
        </> : <p className="editor-intro">Select an object to frame it. The rendered scene stays intact.</p>}
        <p className="editor-message" role="status">{message}</p>
        <button type="button" className="editor-connection" onClick={()=>setDetails(!details)} aria-expanded={details}><i data-connected={connected} aria-hidden/>{connected?`ComfyUI connected · ${connection.includes('ChatGPT')?'ChatGPT':'SDXL'}`:'ComfyUI not connected'}</button>
        {details && <div className="editor-connection-details"><label>Local endpoint<input type="url" value={url} disabled={busy} onChange={e=>{connectionVersion.current++;setUrl(e.target.value);setConnected(false);setConnection('Endpoint changed. Connect to verify.');}}/></label><button type="button" disabled={busy} onClick={()=>void connect()}>Connect</button><p>{connection}</p></div>}
      </aside>, document.body)}
    </>}
  </>;
}
