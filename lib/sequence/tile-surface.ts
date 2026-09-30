import { placeDetail, tileDest, type Crop } from "./render";

/** One decoded tile to draw. `bitmap` may be a getter so a tile evicted after queueing is skipped, not drawn closed. */
export type SurfaceStamp = {
  key: string;
  bitmap: CanvasImageSource | (() => CanvasImageSource | undefined);
  variantWidth: number;
  variantHeight: number;
  sourceX: number;
  sourceY: number;
  width: number;
  height: number;
};
/** A painted tile in source space (0..1): x0, y0, x1, y1 and its effective resolution (source px per image width). */
export type PaintedRect = [number, number, number, number, number];
type Canvas = Pick<HTMLCanvasElement, "width" | "height" | "style" | "dataset"> & { getContext(kind: "2d"): CanvasRenderingContext2D | null };

const same = (a: Crop, b: Crop) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.width - b.width) < 1e-9 && Math.abs(a.height - b.height) < 1e-9;

/**
 * A canvas painted tile by tile, a few tiles per frame (drain), instead of one synchronous full repaint.
 * Re-placing it at a new coverage with the same backing size keeps what is already painted: the pixels are copied to
 * their new place (one GPU blit, no reallocation) and only newly exposed or sharper tiles are queued. The canvas is
 * transparent where nothing is painted yet, so the layer underneath shows through (never a blank).
 */
export class TileSurface {
  coverage: Crop | null = null;
  private painted = new Map<string, PaintedRect>();
  private queue: SurfaceStamp[] = [];
  private canvas: Canvas;
  constructor(canvas: Canvas) { this.canvas = canvas; }
  get pending() { return this.queue.length; }
  get density() { return this.coverage ? this.canvas.width / this.coverage.width : 0; }
  private context() { return this.canvas.getContext("2d"); }

  place(cssWidth: number, cssHeight: number, coverage: Crop, backing: { width: number; height: number }) {
    const old = this.coverage, sized = this.canvas.width === backing.width && this.canvas.height === backing.height;
    if (old && sized && same(old, coverage)) { placeDetail(this.canvas as HTMLCanvasElement, cssWidth, cssHeight, coverage); return; }
    if (!sized || !old) {
      if (!sized) { this.canvas.width = backing.width; this.canvas.height = backing.height; }
      else this.context()?.clearRect(0, 0, backing.width, backing.height);
      this.painted.clear();
    } else {
      const context = this.context();
      if (context && this.painted.size) {
        const w = this.canvas.width, h = this.canvas.height;
        context.save();
        context.globalCompositeOperation = "copy";
        context.drawImage(this.canvas as HTMLCanvasElement, 0, 0, w, h,
          ((old.x - coverage.x) / coverage.width) * w, ((old.y - coverage.y) / coverage.height) * h,
          (old.width / coverage.width) * w, (old.height / coverage.height) * h);
        context.restore();
      } else context?.clearRect(0, 0, this.canvas.width, this.canvas.height);
      const density = backing.width / coverage.width, x1 = coverage.x + coverage.width, y1 = coverage.y + coverage.height;
      for (const [key, [a, b, c, d, res]] of [...this.painted]) {
        const clipped: PaintedRect = [Math.max(a, coverage.x), Math.max(b, coverage.y), Math.min(c, x1), Math.min(d, y1), Math.min(res, density)];
        if (clipped[2] <= clipped[0] || clipped[3] <= clipped[1]) this.painted.delete(key);
        else this.painted.set(key, clipped);
      }
    }
    this.coverage = coverage;
    this.queue = [];
    placeDetail(this.canvas as HTMLCanvasElement, cssWidth, cssHeight, coverage);
  }

  /** Replace the queue (already in paint order), leaving out tiles already painted here, over their whole extent inside
   * the current coverage, at their full resolution. A tile clipped by an earlier coverage is drawn again. */
  setQueue(stamps: SurfaceStamp[]) {
    const density = this.density, c = this.coverage, eps = 1e-7;
    this.queue = stamps.filter((stamp) => {
      const done = this.painted.get(stamp.key);
      if (!done || !c || done[4] < Math.min(stamp.variantWidth, density) * 0.98) return true;
      const x0 = Math.max(c.x, stamp.sourceX / stamp.variantWidth), y0 = Math.max(c.y, stamp.sourceY / stamp.variantHeight);
      const x1 = Math.min(c.x + c.width, (stamp.sourceX + stamp.width) / stamp.variantWidth), y1 = Math.min(c.y + c.height, (stamp.sourceY + stamp.height) / stamp.variantHeight);
      return done[0] > x0 + eps || done[1] > y0 + eps || done[2] < x1 - eps || done[3] < y1 - eps;
    });
  }

  /** Draw queued tiles until `deadline` (at least one). Returns how many were drawn. */
  drain(deadline: number, now: () => number = () => performance.now()) {
    const coverage = this.coverage, context = this.context();
    if (!coverage || !context || !this.queue.length) return 0;
    const w = this.canvas.width, h = this.canvas.height, density = w / coverage.width;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    let drawn = 0;
    while (this.queue.length) {
      const stamp = this.queue.shift()!;
      const image = typeof stamp.bitmap === "function" ? stamp.bitmap() : stamp.bitmap;
      if (!image) continue;
      const dest = tileDest(stamp.sourceX, stamp.sourceY, stamp.width, stamp.height,
        coverage.x * stamp.variantWidth, coverage.y * stamp.variantHeight,
        w / (coverage.width * stamp.variantWidth), h / (coverage.height * stamp.variantHeight));
      try { context.drawImage(image, dest.x, dest.y, dest.w, dest.h); } catch { continue; } // closed between queue and draw
      const rect: PaintedRect = [
        Math.max(coverage.x, stamp.sourceX / stamp.variantWidth), Math.max(coverage.y, stamp.sourceY / stamp.variantHeight),
        Math.min(coverage.x + coverage.width, (stamp.sourceX + stamp.width) / stamp.variantWidth),
        Math.min(coverage.y + coverage.height, (stamp.sourceY + stamp.height) / stamp.variantHeight),
        Math.min(stamp.variantWidth, density),
      ];
      this.painted.delete(stamp.key); this.painted.set(stamp.key, rect);
      drawn++;
      if (now() >= deadline) break;
    }
    return drawn;
  }

  has(key: string) { return this.painted.has(key); }

  /** Painted rects in draw order (last = top-most). */
  rects(): PaintedRect[] { return [...this.painted.values()]; }

  clear() {
    this.queue = []; this.painted.clear(); this.coverage = null;
    if (this.canvas.width !== 1 || this.canvas.height !== 1) { this.canvas.width = 1; this.canvas.height = 1; }
  }
}
