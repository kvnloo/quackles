import type { TileAsset } from "./manifest";
import { resolveAssetUrl } from "../paths";

const known = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean>>();

export function tierProbeUrl(variant: TileAsset): string {
  return resolveAssetUrl(
    variant.tiles.urlTemplate.replaceAll("{x}", "0").replaceAll("{y}", "0"),
    "",
  );
}

/** true = tiles exist, false = missing, undefined = not checked yet. */
export function tierKnown(variant: TileAsset): boolean | undefined {
  return known.get(tierProbeUrl(variant));
}

export function probeTier(variant: TileAsset): Promise<boolean> {
  const url = tierProbeUrl(variant);
  const cached = known.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(url);
  if (existing) return existing;
  const job = fetch(url)
    .then((response) => response.ok)
    .catch(() => false)
    .then((ok) => {
      known.set(url, ok);
      pending.delete(url);
      return ok;
    });
  pending.set(url, job);
  return job;
}
