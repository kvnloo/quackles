import {assetPath} from '../paths';
import {featherMask} from './composite';
import {loadPatch} from './storage';
import type {BBox, PartsManifest} from './mask';
import type {PartEdit, StudioTheme} from '../studio/theme';

export function canvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
export function png(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(new Error('Could not encode image.')), 'image/png'));
}
export async function image(blob: Blob): Promise<ImageBitmap> { return createImageBitmap(blob); }
async function fetchImage(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(assetPath(url), {signal});
  if (!response.ok) throw new Error(`Plate asset unavailable (${response.status}).`);
  return image(await response.blob());
}
export interface Surface { manifest: PartsManifest; ids: Uint8Array; plate: HTMLCanvasElement; overlay: HTMLCanvasElement; highlight: HTMLCanvasElement; alphas: Map<number, Float32Array> }
export async function loadSurface(theme: string, signal: AbortSignal): Promise<Surface> {
  const response = await fetch(assetPath(`/editor/${theme}/parts.json`), {signal});
  if (!response.ok) throw new Error(`Part masks unavailable (${response.status}).`);
  const manifest: PartsManifest = await response.json();
  const [mask, plateImage] = await Promise.all([fetchImage(`/editor/${theme}/${manifest.mask}`, signal), fetchImage(manifest.plate, signal)]);
  const {width, height} = manifest;
  if (mask.width !== width || mask.height !== height || plateImage.width !== width || plateImage.height !== height) throw new Error('Plate and mask dimensions differ.');
  const plate = canvas(width, height), scratch = canvas(width, height);
  scratch.getContext('2d')!.drawImage(mask, 0, 0);
  const rgba = scratch.getContext('2d')!.getImageData(0, 0, width, height).data;
  const ids = new Uint8Array(width * height); for (let i = 0; i < ids.length; i++) ids[i] = rgba[i * 4];
  plate.getContext('2d')!.drawImage(plateImage, 0, 0); mask.close(); plateImage.close();
  const overlay = canvas(width, height), highlight = canvas(width, height);
  overlay.className = 'editor-plate-edits'; highlight.className = 'editor-part-outline';
  overlay.setAttribute('aria-hidden', 'true'); highlight.setAttribute('aria-hidden', 'true');
  return {manifest, ids, plate, overlay, highlight, alphas: new Map()};
}
export function alphaFor(s: Surface, id: number): Float32Array {
  let alpha = s.alphas.get(id);
  if (!alpha) { alpha = featherMask(s.ids, s.manifest.width, s.manifest.height, id, 2); s.alphas.set(id, alpha); }
  return alpha;
}
export function highlight(s: Surface, id: number): void {
  const {width, height} = s.manifest, context = s.highlight.getContext('2d')!;
  context.clearRect(0, 0, width, height);
  if (!id) return;
  const output = context.createImageData(width, height), alpha = alphaFor(s, id);
  for (let i = 0; i < alpha.length; i++) if (alpha[i]) {
    output.data[i * 4] = output.data[i * 4 + 1] = output.data[i * 4 + 2] = 245;
    output.data[i * 4 + 3] = alpha[i] < 1 ? 185 : 14;
  }
  context.putImageData(output, 0, 0);
}
/** Crop stays in plate pixel coordinates. The render mask, never the bbox, limits writes. */
export function cropBox(bbox: BBox, width: number, height: number): BBox {
  const [x,y,w,h] = bbox, margin = Math.ceil(Math.max(w,h) * 0.12);
  const left = Math.max(0,x-margin), top = Math.max(0,y-margin);
  return [left,top,Math.min(width,x+w+margin)-left,Math.min(height,y+h+margin)-top];
}
export async function editInputs(s: Surface, id: number, bbox: BBox, texture?: Blob) {
  const crop = cropBox(bbox, s.manifest.width, s.manifest.height), [x,y,w,h] = crop;
  const source = canvas(w,h), mask = canvas(w,h);
  source.getContext('2d')!.drawImage(s.plate,x,y,w,h,0,0,w,h);
  source.getContext('2d')!.drawImage(s.overlay,x,y,w,h,0,0,w,h);
  const ctx = mask.getContext('2d')!, pixels = ctx.createImageData(w,h);
  for(let cy=0;cy<h;cy++) for(let cx=0;cx<w;cx++) {
    const i=(cy*w+cx)*4, value=s.ids[(y+cy)*s.manifest.width+x+cx]===id?255:0;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=value; pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  const guide = canvas(w,texture ? h*2 : h); guide.getContext('2d')!.drawImage(mask,0,0);
  if(texture) { const ref=await image(texture); guide.getContext('2d')!.drawImage(ref,0,h,w,h); ref.close(); }
  return {crop,source:await png(source),mask:await png(mask),guide:await png(guide)};
}
export async function maskedPatch(s: Surface, id: number, crop: BBox, blob: Blob): Promise<Blob> {
  const [x,y,w,h]=crop, decoded=await image(blob), result=canvas(w,h), ctx=result.getContext('2d')!;
  ctx.drawImage(decoded,0,0,w,h); decoded.close();
  const pixels=ctx.getImageData(0,0,w,h), alpha=alphaFor(s,id);
  for(let cy=0;cy<h;cy++) for(let cx=0;cx<w;cx++) pixels.data[(cy*w+cx)*4+3]=Math.round(255*alpha[(y+cy)*s.manifest.width+x+cx]);
  ctx.putImageData(pixels,0,0); return png(result);
}
export async function paintEdits(s: Surface, theme: StudioTheme, signal?: AbortSignal): Promise<void> {
  const {width,height}=s.manifest, result=canvas(width,height), ctx=result.getContext('2d')!;
  for(const [key,edit] of Object.entries(theme.partEdits ?? {})) {
    const id=Number(key), alpha=alphaFor(s,id);
    if(edit.patchKey && edit.bbox) {
      const blob=await loadPatch(edit.patchKey);
      if (!blob) throw new Error('A saved patch is missing. Revert the part or restore its theme.');
      const bitmap=await image(blob); ctx.drawImage(bitmap,...edit.bbox); bitmap.close();
    }
    if(edit.amount || edit.tone) paintTone(s,ctx,id,edit,alpha);
  }
  if(signal?.aborted) return;
  s.overlay.getContext('2d')!.clearRect(0,0,width,height);
  s.overlay.getContext('2d')!.drawImage(result,0,0);
}
function paintTone(s: Surface, target: CanvasRenderingContext2D, id: number, edit: PartEdit, alpha: Float32Array) {
  const {width,height}=s.manifest, base=canvas(width,height), ctx=base.getContext('2d')!;
  ctx.drawImage(s.plate,0,0); ctx.drawImage(target.canvas,0,0);
  const data=ctx.getImageData(0,0,width,height), rgb=[1,3,5].map(i=>parseInt(edit.color.slice(i,i+2),16));
  for(let i=0;i<alpha.length;i++) {
    if(s.ids[i]!==id) {data.data[i*4+3]=0;continue;}
    const luminance=(data.data[i*4]*.2126+data.data[i*4+1]*.7152+data.data[i*4+2]*.0722)/255;
    for(let c=0;c<3;c++) data.data[i*4+c]=(data.data[i*4+c]*(1-edit.amount)+rgb[c]*luminance*edit.amount)*Math.pow(2,edit.tone);
    data.data[i*4+3]=Math.round(alpha[i]*255);
  }
  ctx.putImageData(data,0,0); target.drawImage(base,0,0);
}
