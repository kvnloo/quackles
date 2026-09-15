"use client";

import { addEffect, Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { ensureProbe } from "@/lib/probe";
import { DuckScene } from "./DuckScene";

function LenisBridge() {
  const { lenisRef } = useExperience();

  useEffect(() => {
    window.__QUACKLES_LENIS_FROM_R3F__ = true;
    const unsub = addEffect((time) => {
      lenisRef.current?.raf(time);
    });
    return () => {
      window.__QUACKLES_LENIS_FROM_R3F__ = false;
      unsub();
    };
  }, [lenisRef]);

  return null;
}

export function DuckCanvas() {
  const { setReady, setWebgl, poseRef, progressRef, reducedMotion } = useExperience();

  return (
    <Canvas
      className="duck-canvas"
      style={{ pointerEvents: "none", width: "100%", height: "100%", display: "block" }}
      camera={{ position: [0.52, 0.24, 1.12], fov: 32, near: 0.02, far: 16 }}
      dpr={[1, 1.5]}
      frameloop="always"
      shadows={false}
      resize={{ scroll: false, debounce: { resize: 250, scroll: 0 } }}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.NoToneMapping,
        toneMappingExposure: 1,
      }}
      onCreated={({ gl }) => {
        gl.shadowMap.enabled = false;
        gl.setClearColor(0x0000f2, 1);
        setWebgl(true);
        setReady(true);
        const q = ensureProbe();
        if (q) q.ready = true;
      }}
    >
      <LenisBridge />
      <Suspense fallback={null}>
        <DuckScene poseRef={poseRef} progressRef={progressRef} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}
