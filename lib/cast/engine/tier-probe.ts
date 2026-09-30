// Cast builds only: next.config.ts routes the engine's `@/lib/sequence/tier-probe` import here.
// On the receiver, 1GP tiers wider than RECEIVER_MAX_TIER_WIDTH report "missing", so the engine never plans or
// warms the 25820 px level on Chromecast hardware (not measured on a device yet: docs/CAST.md). The 201 MP family
// (max 11584 px) is not probed and is unaffected. Other pages get the unchanged probe.
import { probeTier as siteProbeTier, tierKnown as siteTierKnown, tierProbeUrl } from "../../sequence/tier-probe";
import type { TileAsset } from "../../sequence/manifest";
import { isReceiverPath } from "../config";

export { tierProbeUrl };
export const RECEIVER_MAX_TIER_WIDTH = 12910;

const capped = (variant: TileAsset) =>
  variant.width > RECEIVER_MAX_TIER_WIDTH && typeof location !== "undefined" && isReceiverPath(location.pathname);

export function tierKnown(variant: TileAsset): boolean | undefined {
  return capped(variant) ? false : siteTierKnown(variant);
}

export function probeTier(variant: TileAsset): Promise<boolean> {
  return capped(variant) ? Promise.resolve(false) : siteProbeTier(variant);
}
