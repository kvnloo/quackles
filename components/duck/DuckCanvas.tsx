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
  const { setReady, setWebgl, poseRef, reducedMotion } = useExperience();

  return (
    <Canvas
      className="duck-canvas"
      style={{ pointerEvents: "none" }}
      camera={{ position: [0.5, 0.22, 1.08], fov: 32, near: 0.02, far: 12 }}
      dpr={[1, 1.5]}
      frameloop="always"
      shadows={false}
      resize={{ scroll: false }}
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.08,
      }}
      onCreated={({ gl, invalidate }) => {
        gl.setClearColor(0xefe8dc, 1);
        gl.shadowMap.enabled = false;
        setWebgl(true);
        setReady(true);
        const q = ensureProbe();
        if (q) q.ready = true;
        window.__QUACKLES_INVALIDATE__ = invalidate;
        invalidate();
      }}
    >
      <LenisBridge />
      <Suspense fallback={null}>
        <DuckScene poseRef={poseRef} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  );
}
