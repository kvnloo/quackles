import { RefineCore } from "./refine-core";
import type { ToWorker } from "./refine-protocol";
import type { SurfaceCanvas } from "./tile-surface";

/** RFC-002 spike (#45): the refinement Worker. All logic is in refine-core.ts (node-tested); this binds Worker globals. */
type Scope = {
  postMessage(message: unknown): void;
  onmessage: ((event: MessageEvent<ToWorker<SurfaceCanvas>>) => void) | null;
  requestAnimationFrame?: (callback: () => void) => number;
};
const scope = globalThis as unknown as Scope;
const core = new RefineCore({
  post: (message) => scope.postMessage(message),
  decode: (blob) => createImageBitmap(blob),
  // Worker animation frames commit OffscreenCanvas content in step with the display; setTimeout only where they are missing.
  requestFrame: (callback) => { if (typeof scope.requestAnimationFrame === "function") scope.requestAnimationFrame(callback); else setTimeout(callback, 16); },
  now: () => performance.now(),
});
scope.onmessage = (event) => {
  if ((event.data as { t: string }).t === "crash") throw new Error("refine worker: crash requested (e2e)");
  core.handle(event.data);
};
