import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
// Blue 200MP tiles live on the asset Pages site, not in this export.
// Empty string still means same-origin; only an unset env gets the default.
const assetOrigin =
  process.env.NEXT_PUBLIC_ASSET_ORIGIN ??
  "https://kvnloo.github.io/quackles-assets";

// Chromecast (docs/CAST.md). NEXT_PUBLIC_CAST=1|0 overrides CAST_DEFAULT (the per-branch switch: "1" only on
// preview/chromecast). Off adds nothing to the config below, so the default site compiles byte-identically
// (scripts/cast-flag-off-check.mjs). On: the /cast-receiver/ route (app/cast-receiver/page.cast.tsx) is compiled
// and three module seams are swapped at build time: the page gains the Cast button, and the receiver gets its own
// perf profile and tier cap.
const CAST_DEFAULT = "1";
const cast = (process.env.NEXT_PUBLIC_CAST ?? CAST_DEFAULT) === "1";
const castSeams: [RegExp, string][] = [
  [/^@\/components\/overlay\/Landing$/, "@/components/cast/CastLanding"],
  [/^@\/lib\/sequence\/perf-profile$/, "@/lib/cast/engine/perf-profile"],
  [/^@\/lib\/sequence\/tier-probe$/, "@/lib/cast/engine/tier-probe"],
];
const castConfig: Partial<NextConfig> = cast
  ? {
      pageExtensions: ["tsx", "ts", "jsx", "js", "cast.tsx"],
      webpack: (config, { webpack }) => {
        for (const [request, replacement] of castSeams) {
          config.plugins.push(new webpack.NormalModuleReplacementPlugin(request, replacement));
        }
        return config;
      },
    }
  : {};

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_ASSET_ORIGIN: assetOrigin },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
  ...castConfig,
};

export default nextConfig;
