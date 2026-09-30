import type { ImageAsset, TileAsset, Variant } from "./manifest";

/**
 * Predictive warm-up policy (#43). Runs only after the base hero is painted and
 * the app is idle; the caller passes variants already restricted to the selected
 * source family. It never warms the top tier and stays inside a tile budget.
 */
export const WARM_MAX_WIDTH = 2896;
export const WARM_MAX_TILES = 12;
export const WARM_SETTLE_MS = 1200;
export const WARM_CROP = { x: 0.22, y: 0.18, width: 0.56, height: 0.5, scale: 1 };
type Crop = typeof WARM_CROP;
type TilesFor = (variant: TileAsset, crop: Crop) => { asset: ImageAsset }[];

export function warmPlan(variants: Variant[], tilesFor: TilesFor) {
  const tiled = variants.filter((v): v is TileAsset => !("url" in v)).sort((a, b) => a.width - b.width);
  const top = tiled[tiled.length - 1];
  const candidates = tiled.filter((v) => v !== top && v.width <= WARM_MAX_WIDTH);
  const pick = candidates[candidates.length - 1];
  if (!pick) return [];
  return tilesFor(pick, WARM_CROP).slice(0, WARM_MAX_TILES);
}

export function mayWarm(s: { painted: boolean; inspecting: boolean; moving: boolean; sinceFirstPaintMs: number }) {
  return s.painted && !s.inspecting && !s.moving && s.sinceFirstPaintMs >= WARM_SETTLE_MS;
}
