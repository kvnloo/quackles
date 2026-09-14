"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense, useState } from "react";
import { poseAt } from "@/lib/pose";
import { detectWebGL } from "@/lib/webgl";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { CanvasGuard } from "./CanvasGuard";
import { DuckFallback } from "./DuckFallback";
import { DuckScene } from "./DuckScene";

export function DuckCanvas() {
  const { setReady, setWebgl, colorway, progress, reducedMotion, mobile } =
    useExperience();
  const [supported] = useState<boolean>(detectWebGL);
  const pose = poseAt(progress);
  const dpr =
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.75);

  const fallback = <DuckFallback />;

  if (!supported) {
    return fallback;
  }

  return (
    <CanvasGuard
      fallback={fallback}
      onError={() => {
        setWebgl(false);
        setReady(true);
      }}
    >
      <Canvas
        className="h-full w-full"
        camera={{ position: [1.62, 1.18, 2.48], fov: 30, near: 0.1, far: 40 }}
        dpr={dpr}
        shadows
        gl={{
          antialias: true,
          alpha: false,
          failIfMajorPerformanceCaveat: false,
          powerPreference: "default",
        }}
        onCreated={() => {
          setWebgl(true);
          setReady(true);
        }}
      >
        <Suspense fallback={null}>
          <DuckScene
            pose={pose}
            colorway={colorway}
            mobile={mobile}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>
    </CanvasGuard>
  );
}
