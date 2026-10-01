import { TileSurface, type SurfaceCanvas, type SurfaceStamp } from "./tile-surface";
import { LAYERS, type FromWorker, type LayerId, type ToWorker, type WireStamp } from "./refine-protocol";

/**
 * RFC-002 spike (#45): the refinement Worker's logic, free of Worker globals so it runs under node.
 *  - decode: createImageBitmap in the Worker; each job carries a tag, and a job cancelled before it finishes is closed here
 *    (never stored, never drawn).
 *  - compositing: one TileSurface per layer over two OffscreenCanvas buffers. Messages only queue work; every draw happens in
 *    a Worker animation frame, and its publish is posted on the NEXT frame, after that frame's commit.
 *  - atomic publication: content that moved (new coverage/backing) is drawn into the buffer NOT on screen and published as a
 *    flip. The main thread places that buffer and swaps visibility in one task, then acks. Until the ack, the layer's later
 *    work waits, so the buffer on screen is never drawn into at a stale placement.
 */
export type CoreEnv = {
  post(message: FromWorker): void;
  decode(blob: Blob): Promise<ImageBitmap>;
  requestFrame(callback: () => void): void;
  now(): number;
};
type Op = Extract<ToWorker, { t: "place" | "queue" | "clear" }>;
type Layer = { id: LayerId; buffers: [SurfaceCanvas, SurfaceCanvas]; shown: 0 | 1; surface: TileSurface; gen: number; inbox: Op[]; awaiting: boolean; dirty: boolean };
/** Per-frame draw budget (ms since the frame started) per layer: the sharp layer first. */
const BUDGET: Record<LayerId, number> = { detail: 8, underlay: 10, floor: 12 };

export class RefineCore {
  private env: CoreEnv;
  private bitmaps = new Map<string, { bitmap: ImageBitmap; job: number }>();
  private jobs = new Map<number, { key: string; cancelled: boolean }>();
  private layers = new Map<LayerId, Layer>();
  private outbox: FromWorker[] = [];
  private frameQueued = false;
  private counters = { decoded: 0, staleDrops: 0, staleQueues: 0, failures: 0, drawn: 0, flips: 0, publishes: 0 };
  constructor(env: CoreEnv) { this.env = env; }

  has(key: string) { return this.bitmaps.has(key); }
  stats() { return { ...this.counters, bitmaps: this.bitmaps.size, jobs: this.jobs.size }; }

  handle(message: ToWorker<SurfaceCanvas>) {
    switch (message.t) {
      case "init":
        for (const id of LAYERS) {
          const buffers = message.layers[id];
          const layer: Layer = { id, buffers, shown: 0, gen: 0, inbox: [], awaiting: false, dirty: false, surface: undefined as unknown as TileSurface };
          // Moved content goes to the buffer the main thread is not showing; once it shows it, later moves go to the other.
          layer.surface = new TileSurface(buffers[0], { place: () => {}, swap: () => buffers[1 - layer.shown] });
          this.layers.set(id, layer);
        }
        return;
      case "decode": return this.decode(message.key, message.job, message.blob);
      case "cancel": { const job = this.jobs.get(message.job); if (job) job.cancelled = true; return; }
      case "close": {
        const held = this.bitmaps.get(message.key);
        if (held && held.job === message.job) { held.bitmap.close(); this.bitmaps.delete(message.key); }
        return;
      }
      case "ack": {
        const layer = this.layers.get(message.layer);
        if (!layer) return;
        layer.shown = message.shown; layer.awaiting = false; this.requestFrame();
        return;
      }
      default: {
        const layer = this.layers.get(message.layer);
        if (!layer) return;
        layer.inbox.push(message); this.requestFrame();
      }
    }
  }

  private decode(key: string, job: number, blob: Blob) {
    this.jobs.set(job, { key, cancelled: false });
    this.env.decode(blob).then((bitmap) => {
      const entry = this.jobs.get(job); this.jobs.delete(job);
      if (!entry || entry.cancelled) { bitmap.close(); this.counters.staleDrops++; this.env.post({ t: "stale", key, job }); return; }
      this.bitmaps.get(key)?.bitmap.close();
      this.bitmaps.set(key, { bitmap, job }); this.counters.decoded++;
      this.env.post({ t: "decoded", key, job, width: bitmap.width, height: bitmap.height });
    }, (error: unknown) => {
      const entry = this.jobs.get(job); this.jobs.delete(job);
      if (entry?.cancelled) { this.counters.staleDrops++; this.env.post({ t: "stale", key, job }); return; }
      this.counters.failures++;
      this.env.post({ t: "decodeFailed", key, job, message: error instanceof Error ? error.message : String(error) });
    });
  }

  private requestFrame() {
    if (this.frameQueued) return;
    this.frameQueued = true;
    this.env.requestFrame(() => { this.frameQueued = false; this.frame(); });
  }

  private stamp = (wire: WireStamp): SurfaceStamp => ({ ...wire, bitmap: () => this.bitmaps.get(wire.key)?.bitmap });

  /** One Worker animation frame: post what the previous frame committed, then draw this frame's work. */
  private frame() {
    for (const message of this.outbox.splice(0)) this.env.post(message);
    const start = this.env.now();
    let more = false;
    for (const layer of this.layers.values()) {
      if (layer.awaiting) continue;
      for (const op of layer.inbox.splice(0)) {
        if (op.t === "place") { layer.gen = op.gen; layer.surface.place(0, 0, op.coverage, op.backing); layer.dirty = true; }
        else if (op.t === "clear") { layer.gen = op.gen; layer.surface.clear(); layer.dirty = true; }
        else if (op.gen !== layer.gen) this.counters.staleQueues++;
        else layer.surface.setQueue(op.stamps.map(this.stamp));
      }
      const drawn = layer.surface.drain(start + BUDGET[layer.id], this.env.now);
      this.counters.drawn += drawn;
      if (drawn || layer.dirty) {
        const front = layer.surface.canvas === layer.buffers[1] ? 1 : 0, flip = front !== layer.shown;
        this.outbox.push({ t: "publish", layer: layer.id, gen: layer.gen, front, flip, coverage: layer.surface.coverage, rects: layer.surface.entries() });
        this.counters.publishes++;
        if (flip) { layer.awaiting = true; this.counters.flips++; }
        layer.dirty = false;
      }
      if (layer.surface.pending) more = true;
    }
    if (more || this.outbox.length) this.requestFrame();
  }
}
