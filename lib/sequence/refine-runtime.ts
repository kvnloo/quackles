import type { FrameCacheOptions } from "./cache";
import { isTileUrl } from "./refine-mode";
import { LAYERS, type FromWorker, type LayerId, type ToWorker } from "./refine-protocol";
import { RemoteSurface } from "./remote-surface";

/**
 * RFC-002 spike (#45): the main-thread side of the refinement Worker. Per layer it adds two placeholder canvases after the
 * React one (which steps aside: renamed `-idle`, display none) and hands their control to the Worker. Tile decodes go to the
 * Worker through the FrameCache decoder hook; the cache keeps its budget/pin/evict bookkeeping on a size-only handle.
 * Returns null when anything fails (the caller stays on the main-thread path).
 */
export type RefineRuntime = {
  surfaces: Record<LayerId, RemoteSurface>;
  elements: Record<LayerId, [HTMLCanvasElement, HTMLCanvasElement]>;
  /** Lock-fade target: a wrapper around both detail buffers (the visible buffer changes at every flip). */
  fade: HTMLElement;
  decoder: NonNullable<FrameCacheOptions["decoder"]>;
  stats(): { flips: number; publishes: number; stalePublishes: number; staleDecodes: number; decodes: number; errors: number };
  dispose(): void;
};
const CLASS: Record<LayerId, string> = { detail: "sequence-detail", underlay: "sequence-underlay", floor: "sequence-floor" };

export function createRefineRuntime(react: Record<LayerId, HTMLCanvasElement>, onPublish: (layer: LayerId) => void): RefineRuntime | null {
  const added: HTMLElement[] = [];
  let worker: Worker | null = null;
  const restore = () => {
    worker?.terminate();
    for (const element of added) element.remove();
    for (const id of LAYERS) { react[id].className = CLASS[id]; react[id].style.removeProperty("display"); }
  };
  try {
    worker = new Worker(new URL("./refine.worker.ts", import.meta.url));
    const live = worker;
    const counts = { flips: 0, publishes: 0, stalePublishes: 0, staleDecodes: 0, decodes: 0, errors: 0 };
    const post = (message: ToWorker, transfer: Transferable[] = []) => live.postMessage(message, transfer);
    const elements = {} as RefineRuntime["elements"], surfaces = {} as RefineRuntime["surfaces"], offscreens = {} as Record<LayerId, [OffscreenCanvas, OffscreenCanvas]>;
    const fade = document.createElement("div");
    fade.className = "sequence-detail-fade";
    for (const id of LAYERS) {
      const pair = [document.createElement("canvas"), document.createElement("canvas")] as [HTMLCanvasElement, HTMLCanvasElement];
      pair[0].className = CLASS[id]; pair[1].className = `${CLASS[id]}-back`;
      for (const canvas of pair) canvas.setAttribute("aria-hidden", "true");
      if (id === "detail") { fade.append(...pair); react[id].after(fade); added.push(fade); }
      else { react[id].after(...pair); added.push(...pair); }
      react[id].className = `${CLASS[id]}-idle`; react[id].style.display = "none";
      offscreens[id] = [pair[0].transferControlToOffscreen(), pair[1].transferControlToOffscreen()];
      elements[id] = pair;
      surfaces[id] = new RemoteSurface(id, pair, [CLASS[id], `${CLASS[id]}-back`], post, undefined, () => onPublish(id));
    }
    post({ t: "init", layers: offscreens } as unknown as ToWorker, LAYERS.flatMap((id) => offscreens[id]));

    let job = 0;
    const waiting = new Map<number, { resolve: (bitmap: ImageBitmap) => void; reject: (error: Error) => void }>();
    live.onmessage = (event: MessageEvent<FromWorker>) => {
      const message = event.data;
      if (message.t === "publish") {
        counts.publishes++;
        if (!surfaces[message.layer].receive(message)) counts.stalePublishes++;
        else if (message.flip) counts.flips++;
        return;
      }
      const pending = waiting.get(message.job);
      if (!pending) return;
      waiting.delete(message.job);
      if (message.t === "decoded") {
        counts.decodes++;
        const key = message.key, id = message.job;
        // Size-only handle: the pixels stay in the Worker. close() releases them there (only this job's bitmap).
        pending.resolve({ width: message.width, height: message.height, close: () => post({ t: "close", key, job: id }) } as unknown as ImageBitmap);
      } else if (message.t === "stale") { counts.staleDecodes++; pending.reject(new DOMException("Decode superseded (dropped in the worker)", "AbortError") as unknown as Error); }
      else pending.reject(new Error(message.message));
    };
    live.onerror = () => { counts.errors++; };
    const decoder: RefineRuntime["decoder"] = (asset, blob, signal) => {
      if (!isTileUrl(asset.url)) return undefined;
      const id = ++job;
      return new Promise<ImageBitmap>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
        signal.addEventListener("abort", () => { if (waiting.has(id)) post({ t: "cancel", key: asset.url, job: id }); }, { once: true });
        post({ t: "decode", key: asset.url, job: id, blob });
      });
    };
    return {
      surfaces, elements, fade, decoder,
      stats: () => ({ ...counts }),
      dispose: () => {
        for (const pending of waiting.values()) pending.reject(new DOMException("Player disposed", "AbortError") as unknown as Error);
        waiting.clear(); restore();
      },
    };
  } catch {
    restore();
    return null;
  }
}
