import type { Preview } from "../preview";

/** RFC-002 spike (#45): where tile decode and tile compositing run. */
export type RefineMode = "main" | "worker";
export type RefineCaps = { offscreen: boolean; worker: boolean };

/** What this browser can do: a canvas that hands its control to an OffscreenCanvas, and a dedicated Worker. */
export function refineCaps(): RefineCaps {
  return {
    offscreen: typeof OffscreenCanvas !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "transferControlToOffscreen" in HTMLCanvasElement.prototype,
    worker: typeof Worker !== "undefined",
  };
}

/**
 * A preview without `refine` (production) always stays on the main-thread path, whatever the URL says. A preview that opts
 * in may be flipped in-process with `?refine=main|worker` (A/B on one build). The worker path needs OffscreenCanvas + Worker
 * and a single scene (the two-theme crossfade still paints on the main thread), else it falls back to main.
 */
export function refineMode(preview: Preview, search: string, caps: RefineCaps): RefineMode {
  if (!preview.refine) return "main";
  const single = preview.scenes === "mushroom" || preview.scenes.length === 1;
  const asked = new URLSearchParams(search).get("refine");
  const want = asked === "main" || asked === "worker" ? asked : preview.refine;
  return want === "worker" && single && caps.offscreen && caps.worker ? "worker" : "main";
}

/** A pyramid tile (`.../{x}_{y}.ext`), decoded off-thread on the worker path; plates and the egg stay main-thread images. */
export function isTileUrl(url: string) {
  return /\/\d+_\d+\.(webp|avif|png|jpe?g)(\?|#|$)/.test(url);
}
