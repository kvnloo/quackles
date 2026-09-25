import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
// Blue 200MP tiles live on the asset Pages site, not in this export.
// Empty string still means same-origin; only an unset env gets the default.
const assetOrigin =
  process.env.NEXT_PUBLIC_ASSET_ORIGIN ??
  "https://kvnloo.github.io/quackles-assets";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_ASSET_ORIGIN: assetOrigin },
  transpilePackages: ["three", "@react-three/fiber", "@react-three/drei"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  devIndicators: false,
};

export default nextConfig;
