export type BBox = [number, number, number, number]; // x, y, width, height in plate pixels
export interface Part { id: number; label: string; bbox: BBox | null; objects: string[]; pixels: number }
export interface PartsManifest { version: 1; theme: string; width: number; height: number; mask: string; plate: string; parts: Part[] }
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Invert inspectionCrop: focus is the crop's travel fraction, not its centre. */
export function bboxTarget([x, y, w, h]: BBox, width: number, height: number, maxZoom: number) {
  const zoom = clamp(Math.min(width / (w * 1.7), height / (h * 1.7)), 1, maxZoom);
  if (zoom === 1) return { zoom, x: 0.5, y: 0.5 };
  const span = 1 / zoom;
  return { zoom, x: clamp(((x + w / 2) / width - span / 2) / (1 - span), 0, 1), y: clamp(((y + h / 2) / height - span / 2) / (1 - span), 0, 1) };
}
export function partAt(ids: Uint8Array, width: number, height: number, x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= 1 || y >= 1) return 0;
  return ids[Math.floor(y * height) * width + Math.floor(x * width)] ?? 0;
}
