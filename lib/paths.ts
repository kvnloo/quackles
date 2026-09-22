/** Asset origin and URL resolution.

 * NEXT_PUBLIC_ASSET_ORIGIN — optional external asset host.
 *   Example: https://kvnloo.github.io/quackles-assets
 *   Example: https://*.public.blob.vercel-storage.com/quackles
 *
 * The tracked manifest contains logical paths such as:
 *   /quackles-assets/blue/p0000000/0/{x}_{y}.webp
 *
 * Resolved URLs strip the /quackles-assets logical prefix before joining
 * with ASSET_ORIGIN, so the same manifest works on GitHub Pages, Vercel Blob,
 * localhost, or any future CDN without rewriting the manifest.
 */

/** Read asset origin lazily from env so tests can reconfigure. */
export function getAssetOrigin(): string {
  return (process.env.NEXT_PUBLIC_ASSET_ORIGIN || "").replace(/\/$/, "");
}

/** Ensure a path starts with exactly one slash. */
function normalizedSuffix(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

/** Join NEXT_PUBLIC_BASE_PATH with a logical path. */
export function assetPath(path: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH || "";
  return `${base}${normalizedSuffix(path)}`;
}

/**
 * Resolve an asset URL from a manifest-relative path.
 *
 * Rules:
 * 1. If the path starts with /quackles-assets and ASSET_ORIGIN is set,
 *    strip the /quackles-assets prefix and join with ASSET_ORIGIN.
 * 2. Otherwise, treat the path as relative to the manifest base and resolve.
 */
export function resolveAssetUrl(raw: string, manifestBase: string): string {
  const cleanedOrigin = getAssetOrigin();

  // External asset: strip /quackles-assets logical prefix, join with origin.
  if (cleanedOrigin && raw.startsWith("/quackles-assets")) {
    const suffix = raw.slice("/quackles-assets".length); // e.g. /blue/p0000000/0/0_0.webp
    try {
      const joined = cleanedOrigin + suffix;
      return new URL(joined).href;
    } catch {
      // Malformed ASSET_ORIGIN — fall through to relative resolution.
    }
  }

  // Relative or same-origin absolute path.
  const scoped = raw.startsWith("/") ? assetPath(raw) : raw;
  return new URL(scoped, manifestBase).href;
}

/** Allowed asset origins for validation. */
export type AllowedOrigins = { manifest: string; asset?: string };

/**
 * Validate that a resolved asset URL is from an allowed origin.
 *
 * Allowed origins:
 * 1. The manifest/app origin
 * 2. The explicitly configured ASSET_ORIGIN (if set)
 */
export function assertAllowedAssetOrigin(
  resolved: string,
  manifestBase: string,
): void;
export function assertAllowedAssetOrigin(
  resolved: string,
  allowed: AllowedOrigins,
): void;
export function assertAllowedAssetOrigin(
  resolved: string,
  arg2: string | AllowedOrigins,
): void {
  const resolvedUrl = new URL(resolved);
  const manifestOrigin = new URL(
    typeof arg2 === "string" ? arg2 : arg2.manifest,
  ).origin;
  const allowed = new Set<string>([manifestOrigin]);

  const origin =
    typeof arg2 === "string" ? getAssetOrigin() : arg2.asset;
  if (origin) {
    try {
      allowed.add(new URL(origin).origin);
    } catch {
      // Malformed ASSET_ORIGIN — best-effort skip.
    }
  }

  if (!allowed.has(resolvedUrl.origin)) {
    throw new Error(
      `Sequence asset origin is not allowed: ${resolvedUrl.origin}`,
    );
  }
}
