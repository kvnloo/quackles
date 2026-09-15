import type { NextConfig } from "next";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath } : {}),
  transpilePackages: [
    "three",
    "@react-three/fiber",
    "@react-three/drei",
    "@crazygl/hero-scroll-assemble-product",
    "@crazygl/core",
  ],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
