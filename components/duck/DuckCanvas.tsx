"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { ensureProbe } from "@/lib/probe";
import { DuckScene } from "./DuckScene";

export function DuckCanvas() {
  const { setReady, setWebgl, poseRef, progressRef, reducedMotion } = useExperience();

  return (
    <Canvas
      className="h-full w-full"
      style={{ pointerEvents: "none" }}
      camera={{ position: [0.4, 0.21, 0.42], fov: 30, near: 0.02, far: 12 }}
      dpr={[1, 1.25]}
      frameloop="demand"
      shadows={false}
      resize={{ scroll: false }}
      gl={{
        antialias: false,
        alpha: true,
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ invalidate }) => {
        setWebgl(true);
        setReady(true);
        const q = ensureProbe();
        if (q) q.ready = true;
        window.__QUACKLES_INVALIDATE__ = invalidate;
        invalidate();
      }}
    >
      <Suspense fallback={null}>
        <DuckScene poseRef={poseRef} progressRef={progressRef} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}
