import type { FrameCacheOptions } from "./cache";
import { isTileUrl } from "./refine-mode";
import { LAYERS, type FromWorker, type LayerId, type ToWorker, type WorkerStats } from "./refine-protocol";
import { RemoteSurface } from "./remote-surface";

/**
 * RFC-002 spike (#45): the main-thread side of the refinement Worker. Per layer it adds two placeholder canvases after the
 * React one (which steps aside: renamed `-idle`, display none) and hands their control to the Worker. Tile decodes go to the
 * Worker through the FrameCache decoder hook; the cache keeps its budget/pin/evict bookkeeping on a size-only handle.
 * A Worker that errors is replaced (new Worker, new buffers; pending decodes fail and retry; `onRestart` lets the player
 * forget decoded tiles), up to MAX_RESTARTS; after that tile decodes run locally and the tile layers stay hidden (the plate
 * shows). Returns null when the first start fails (the caller stays on the main-thread path).
 */
export type RefineRuntime = {
  surfaces: Record<LayerId, RemoteSurface>;
  /** Current buffers per layer (replaced on a restart). */
  elements: Record<LayerId, [HTMLCanvasElement, HTMLCanvasElement]>;
  /** Lock-fade target: a wrapper around both detail buffers (the visible buffer changes at every flip). */
  fade: HTMLElement;
  decoder: NonNullable<FrameCacheOptions["decoder"]>;
  stats(): { flips: number; publishes: number; stalePublishes: number; staleDecodes: number; decodes: number; errors: number; restarts: number; dead: boolean };
  /** Debug/e2e hooks (window.__QUACKLES_REFINE__): raw post, the Worker's counters, every applied flip, a forced crash. */
  debug: { post(message: ToWorker): void; workerStats(): Promise<{ stats: WorkerStats; keys: string[] }>; flips: { t: number; layer: LayerId; front: 0 | 1; crop: string }[] };
  dispose(): void;
};
export type RefineHooks = { onPublish(layer: LayerId): void; onReveal(layer: LayerId): void; onRestart(): void };
const CLASS: Record<LayerId, string> = { detail: "sequence-detail", underlay: "sequence-underlay", floor: "sequence-floor" };
const MAX_RESTARTS = 3;
const abort = (why: string) => new DOMException(why, "AbortError") as unknown as Error;

export function createRefineRuntime(react: Record<LayerId, HTMLCanvasElement>, hooks: RefineHooks): RefineRuntime | null {
  let added: HTMLElement[] = [];
  let worker: Worker | null = null, dead = false, disposed = false;
  const counts = { flips: 0, publishes: 0, stalePublishes: 0, staleDecodes: 0, decodes: 0, errors: 0, restarts: 0 };
  const elements = {} as RefineRuntime["elements"], surfaces = {} as RefineRuntime["surfaces"];
  const fade = document.createElement("div");
  fade.className = "sequence-detail-fade";
  let job = 0, statsId = 0;
  const statsWaiting = new Map<number, (reply: { stats: WorkerStats; keys: string[] }) => void>();
  const flips: RefineRuntime["debug"]["flips"] = [];
  const waiting = new Map<number, { resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void }>();
  const post = (message: ToWorker, transfer: Transferable[] = []) => { if (!dead && worker) worker.postMessage(message, transfer); };
  const failPending = (error: () => Error) => { for (const pending of waiting.values()) pending.reject(error()); waiting.clear(); };
  const removeBuffers = () => { for (const element of added) if (element !== fade) element.remove(); fade.replaceChildren(); added = []; };
  const restore = () => {
    worker?.terminate(); worker = null;
    removeBuffers(); fade.remove();
    for (const id of LAYERS) { react[id].className = CLASS[id]; react[id].style.removeProperty("display"); }
  };

  const onMessage = (event: MessageEvent<FromWorker>) => {
    const message = event.data;
    if (message.t === "stats") { statsWaiting.get(message.id)?.({ stats: message.stats, keys: message.keys }); statsWaiting.delete(message.id); return; }
    if (message.t === "publish") {
      counts.publishes++;
      if (!surfaces[message.layer].receive(message)) counts.stalePublishes++;
      else if (message.flip) {
        counts.flips++;
        flips.push({ t: performance.now(), layer: message.layer, front: message.front, crop: elements[message.layer][message.front].dataset.crop ?? "" });
        if (flips.length > 4000) flips.shift();
      }
      return;
    }
    if (message.t === "stale") counts.staleDecodes++;
    const pending = waiting.get(message.job);
    if (!pending) return; // already rejected on abort
    waiting.delete(message.job);
    if (message.t === "decoded") {
      counts.decodes++;
      const key = message.key, id = message.job, owner = worker;
      // Size-only handle: the pixels stay in the Worker. close() releases them there (only this job's bitmap, same Worker).
      pending.resolve({ width: message.width, height: message.height, close: () => { if (worker === owner) post({ t: "close", key, job: id }); } } as unknown as ImageBitmap);
    } else if (message.t === "stale") pending.reject(abort("Decode superseded (dropped in the worker)"));
    else pending.reject(new Error(message.message));
  };

  /** New Worker + new buffers for every layer. Throws if the browser refuses (first start: caller falls back). */
  const start = () => {
    const next = new Worker(new URL("./refine.worker.ts", import.meta.url));
    worker = next;
    const offscreens = {} as Record<LayerId, [OffscreenCanvas, OffscreenCanvas]>;
    for (const id of LAYERS) {
      const pair = [document.createElement("canvas"), document.createElement("canvas")] as [HTMLCanvasElement, HTMLCanvasElement];
      pair[0].className = CLASS[id]; pair[1].className = `${CLASS[id]}-back`;
      for (const canvas of pair) { canvas.setAttribute("aria-hidden", "true"); canvas.style.visibility = "hidden"; }
      if (id === "detail") { fade.append(...pair); if (!fade.isConnected) react[id].after(fade); added.push(fade); }
      else { react[id].after(...pair); added.push(...pair); }
      react[id].className = `${CLASS[id]}-idle`; react[id].style.display = "none";
      offscreens[id] = [pair[0].transferControlToOffscreen(), pair[1].transferControlToOffscreen()];
      elements[id] = pair;
      if (surfaces[id]) surfaces[id].rebind(pair, post);
      else surfaces[id] = new RemoteSurface(id, pair, [CLASS[id], `${CLASS[id]}-back`], post, undefined, () => hooks.onPublish(id), () => hooks.onReveal(id));
    }
    next.onmessage = onMessage;
    next.onerror = (event) => { event.preventDefault(); if (worker === next) restart(); };
    next.onmessageerror = () => { if (worker === next) restart(); };
    post({ t: "init", layers: offscreens } as unknown as ToWorker, LAYERS.flatMap((id) => offscreens[id]));
  };
  /** The Worker errored: its pixels and bitmaps are gone. Replace it (bounded), fail pending decodes so their slots free. */
  const restart = () => {
    if (disposed) return;
    counts.errors++;
    worker?.terminate(); worker = null;
    failPending(() => new Error("Refinement worker restarted"));
    removeBuffers();
    if (counts.restarts >= MAX_RESTARTS) {
      dead = true;
      for (const id of LAYERS) surfaces[id].setVisible(false);
    } else {
      counts.restarts++;
      try { start(); } catch { dead = true; }
    }
    hooks.onRestart();
  };

  try { start(); } catch { restore(); return null; }

  const decoder: RefineRuntime["decoder"] = (asset, blob, signal) => {
    if (dead || !isTileUrl(asset.url)) return undefined;
    const id = ++job;
    return new Promise<ImageBitmap>((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      // Reject at once (the cache slot frees even if the Worker never answers); the Worker still drops the bitmap.
      signal.addEventListener("abort", () => { if (!waiting.delete(id)) return; post({ t: "cancel", key: asset.url, job: id }); reject(abort("Decode cancelled")); }, { once: true });
      post({ t: "decode", key: asset.url, job: id, blob });
    });
  };
  return {
    surfaces, elements, fade, decoder,
    debug: {
      post: (message) => post(message), flips,
      workerStats: () => new Promise((resolve) => { const id = ++statsId; statsWaiting.set(id, resolve); post({ t: "stats", id }); }),
    },
    stats: () => ({ ...counts, dead }),
    dispose: () => { disposed = true; failPending(() => abort("Player disposed")); restore(); },
  };
}
