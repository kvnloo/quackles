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
      className="duck-canvas"
      style={{ pointerEvents: "none", width: "100%", height: "100%", display: "block" }}
      camera={{ position: [0.4, 0.155, 0.66], fov: 27, near: 0.02, far: 12 }}
      dpr={1}
      frameloop="demand"
      shadows={false}
      resize={{ scroll: false, debounce: { resize: 250, scroll: 0 } }}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.05,
      }}
      onCreated={({ gl, invalidate }) => {
        gl.setPixelRatio(1);
        gl.shadowMap.enabled = false;
        gl.setClearColor(0xefe8dc, 1);
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
