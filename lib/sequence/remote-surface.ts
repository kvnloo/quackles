import { placeDetail, type Crop } from "./render";
import type { PaintedRect, SurfaceStamp } from "./tile-surface";
import type { Backing, FromWorker, LayerId, ToWorker, WireStamp } from "./refine-protocol";

type Element = { className: string; style: { visibility?: string } };
type Publish = Extract<FromWorker, { t: "publish" }>;
const same = (a: Crop | null, b: Crop | null) => !!a && !!b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.width - b.width) < 1e-9 && Math.abs(a.height - b.height) < 1e-9;

/**
 * RFC-002 spike (#45): the main thread's stand-in for a TileSurface whose pixels live in the refinement Worker. Same calls
 * as TileSurface (place / setQueue / drain / has / rects / clear), but drawing is the Worker's: `drain` hands the queue off.
 * What it reports (`rects`, `has`) is only what the Worker has PUBLISHED, i.e. what is on screen, never what was requested.
 * Two placeholder canvases per layer; the one on screen carries the layer's class (`.sequence-detail`), the other the
 * `-back` class, so `querySelector(".sequence-detail")` always finds the visible buffer.
 */
export class RemoteSurface<E extends Element = HTMLCanvasElement> {
  coverage: Crop | null = null;
  private backing: Backing | null = null;
  private gen = 0;
  private shown: 0 | 1 = 0;
  private shownCoverage: Crop | null = null;
  private painted = new Map<string, PaintedRect>();
  private outgoing: WireStamp[] = [];
  private visible = false;
  private css = { width: 0, height: 0 };
  private layer: LayerId;
  private elements: [E, E];
  private classes: [string, string];
  private post: (message: ToWorker) => void;
  private placer: (element: E, cssWidth: number, cssHeight: number, coverage: Crop) => void;
  private onPublish: () => void;
  constructor(
    layer: LayerId, elements: [E, E], classes: [string, string], post: (message: ToWorker) => void,
    placer: (element: E, cssWidth: number, cssHeight: number, coverage: Crop) => void = (element, w, h, c) => placeDetail(element as unknown as HTMLCanvasElement, w, h, c),
    onPublish: () => void = () => {},
  ) {
    this.layer = layer; this.elements = elements; this.classes = classes; this.post = post; this.placer = placer; this.onPublish = onPublish;
  }
  get pending() { return this.outgoing.length; }
  get density() { return this.coverage && this.backing ? this.backing.width / this.coverage.width : 0; }
  /** The buffer on screen. */
  front() { return this.elements[this.shown]; }

  place(cssWidth: number, cssHeight: number, coverage: Crop, backing: Backing) {
    this.css = { width: cssWidth, height: cssHeight };
    if (same(this.coverage, coverage) && this.backing?.width === backing.width && this.backing.height === backing.height) {
      if (this.shownCoverage) this.placer(this.front(), cssWidth, cssHeight, this.shownCoverage);
      return;
    }
    this.coverage = coverage; this.backing = backing; this.outgoing = [];
    this.post({ t: "place", layer: this.layer, gen: ++this.gen, coverage, backing });
  }

  /** Same filter as TileSurface.setQueue, against what is published at this very coverage (else everything is sent). */
  setQueue(stamps: SurfaceStamp[]) {
    const c = this.coverage, density = this.density, eps = 1e-7, current = same(c, this.shownCoverage);
    this.outgoing = stamps.filter((stamp) => {
      const done = current ? this.painted.get(stamp.key) : undefined;
      if (!done || !c || done[4] < Math.min(stamp.variantWidth, density) * 0.98) return true;
      const x0 = Math.max(c.x, stamp.sourceX / stamp.variantWidth), y0 = Math.max(c.y, stamp.sourceY / stamp.variantHeight);
      const x1 = Math.min(c.x + c.width, (stamp.sourceX + stamp.width) / stamp.variantWidth), y1 = Math.min(c.y + c.height, (stamp.sourceY + stamp.height) / stamp.variantHeight);
      return done[0] > x0 + eps || done[1] > y0 + eps || done[2] < x1 - eps || done[3] < y1 - eps;
    }).map(({ key, variantWidth, variantHeight, sourceX, sourceY, width, height }) => ({ key, variantWidth, variantHeight, sourceX, sourceY, width, height }));
  }

  /** Hands the whole queue to the Worker (it paints in its own frames). Returns how many tiles were handed off. */
  drain(_deadline?: number) {
    const count = this.outgoing.length;
    if (count) this.post({ t: "queue", layer: this.layer, gen: this.gen, stamps: this.outgoing });
    this.outgoing = [];
    return count;
  }

  has(key: string) { return this.painted.has(key); }
  rects(): PaintedRect[] { return [...this.painted.values()]; }

  clear() {
    this.outgoing = []; this.painted.clear(); this.coverage = null; this.backing = null; this.shownCoverage = null;
    this.post({ t: "clear", layer: this.layer, gen: ++this.gen });
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.front().style.visibility = visible ? "visible" : "hidden";
  }

  /** Container resized: re-place the shown buffer at its published coverage. */
  relayout(cssWidth: number, cssHeight: number) {
    this.css = { width: cssWidth, height: cssHeight };
    if (this.shownCoverage) this.placer(this.front(), cssWidth, cssHeight, this.shownCoverage);
  }

  /** A Worker publish. A flip places the new buffer and swaps both buffers' class + visibility in this one task. */
  receive(message: Publish) {
    if (message.gen !== this.gen) {
      if (message.flip) this.post({ t: "ack", layer: this.layer, shown: this.shown });
      return;
    }
    if (message.flip) {
      const next = this.elements[message.front], previous = this.front();
      if (message.coverage) this.placer(next, this.css.width, this.css.height, message.coverage);
      next.className = this.classes[0]; previous.className = this.classes[1];
      next.style.visibility = this.visible ? "visible" : "hidden"; previous.style.visibility = "hidden";
      this.shown = message.front;
      this.post({ t: "ack", layer: this.layer, shown: this.shown });
    }
    this.shownCoverage = message.coverage;
    this.painted = new Map(message.rects);
    this.onPublish();
  }
}
