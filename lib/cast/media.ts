/**
 * Basic cast mode (no App ID): what the Default Media Receiver shows. Pure.
 * The still is the plate the phone shows (same story-frame rule as SequencePlayer, theme rounded to the nearest
 * scene) at the best available resolution: the largest image variant (1024x1536 WebP today; the receiver scales
 * images to fit 720p). Loads are debounced so a swipe or a scroll does not spam the TV.
 */
import { isImage, spanAt, THEME_IDS, type ImageAsset, type SequenceManifest } from "../sequence/manifest";
import { THEME_MAX, type CastView } from "./protocol";

export const MEDIA_DEBOUNCE_MS = 300;
export type CastMedia = { key: string; url: string; contentType: string; title: string; subtitle: string; width: number; height: number };

const TYPES: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp" };
export function contentTypeFor(url: string): string {
  const ext = new URL(url, "https://x.invalid/").pathname.split(".").pop()?.toLowerCase() ?? "";
  return TYPES[ext] ?? "image/webp";
}

export function castMedia(manifest: SequenceManifest, view: Pick<CastView, "progress" | "theme" | "reducedMotion">): CastMedia {
  const span = spanAt(manifest, view.progress, view.reducedMotion === true);
  const frame = span.mix < 0.5 ? span.before : span.after;
  const index = Math.round(Math.max(0, Math.min(THEME_MAX, Number.isFinite(view.theme) ? view.theme : 2)));
  const id = THEME_IDS[index];
  const best = frame.assets[id].filter(isImage).reduce<ImageAsset | null>((top, image) => (!top || image.width > top.width ? image : top), null);
  if (!best) throw new Error(`no still for ${frame.id}/${id}`);
  const label = manifest.themes.find((theme) => theme.id === id)?.label ?? id;
  return {
    key: `${frame.id}/${id}`,
    url: best.url,
    contentType: contentTypeFor(best.url),
    title: `Microduck · ${label}`,
    subtitle: `Quackles · ${Math.round(frame.progress * 100)}% through the story`,
    width: best.width,
    height: best.height,
  };
}

/**
 * offer(key) on every change; force=true (connect/resync) loads now. A change loads once the key has been stable for
 * MEDIA_DEBOUNCE_MS; returning to what the TV already shows cancels the pending load. Clock-driven for tests.
 */
export class MediaDebounce {
  private loaded: string | null = null;
  private pending: string | null = null;
  private since = 0;
  private readonly quietMs: number;
  constructor(quietMs = MEDIA_DEBOUNCE_MS) { this.quietMs = quietMs; }
  offer(key: string, now: number, force = false): string | null {
    if (force) { this.loaded = key; this.pending = null; return key; }
    if (key === this.loaded) { this.pending = null; return null; }
    if (key !== this.pending) { this.pending = key; this.since = now; }
    return null;
  }
  due(now: number): string | null {
    if (this.pending === null || now - this.since < this.quietMs) return null;
    this.loaded = this.pending; this.pending = null;
    return this.loaded;
  }
  nextDueAt(): number | null { return this.pending === null ? null : this.since + this.quietMs; }
}
