import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
