import type { TileAsset } from "./manifest";
import { resolveAssetUrl } from "../paths";

const known = new Map<string, boolean>();
const pending = new Map<string, Promise<boolean | undefined>>();
/** A probe that failed transiently (5xx, network) may be retried after this time. */
const retryAt = new Map<string, number>();
export const PROBE_RETRY_MS = 1000;

export function tierProbeUrl(variant: TileAsset): string {
  return resolveAssetUrl(
    variant.tiles.urlTemplate.replaceAll("{x}", "0").replaceAll("{y}", "0"),
    "",
  );
}

/** true = tiles exist, false = missing (404/410), undefined = not checked yet or the last check failed transiently. */
export function tierKnown(variant: TileAsset): boolean | undefined {
  return known.get(tierProbeUrl(variant));
}

export function probeTier(variant: TileAsset): Promise<boolean | undefined> {
  const url = tierProbeUrl(variant);
  const cached = known.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = pending.get(url);
  if (existing) return existing;
  if ((retryAt.get(url) ?? 0) > performance.now()) return Promise.resolve(undefined);
  // Only a definite "not there" marks the tier missing for the session; a 5xx or a dropped connection on a static host
  // is transient, so the tier stays unknown and is probed again after PROBE_RETRY_MS.
  const job = fetch(url)
    .then((response) => (response.ok ? true : response.status === 404 || response.status === 410 ? false : undefined))
    .catch(() => undefined)
    .then((ok) => {
      if (ok === undefined) retryAt.set(url, performance.now() + PROBE_RETRY_MS);
      else { known.set(url, ok); retryAt.delete(url); }
      pending.delete(url);
      return ok;
    });
  pending.set(url, job);
  return job;
}
