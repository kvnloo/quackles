"use client";

import { addEffect, Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import * as THREE from "three";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { ensureProbe } from "@/lib/probe";
import { DEFAULT_THEME_T, lightsAt } from "@/lib/theme";
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
  const initial = lightsAt(DEFAULT_THEME_T);

  return (
    <Canvas
      className="duck-canvas"
      style={{ pointerEvents: "none", width: "100%", height: "100%", display: "block", background: "transparent" }}
      camera={{ position: [0.52, 0.24, 1.12], fov: 32, near: 0.02, far: 16 }}
      dpr={[1, 2]}
      frameloop="always"
      shadows={false}
      resize={{ scroll: false, debounce: { resize: 250, scroll: 0 } }}
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        depth: true,
        failIfMajorPerformanceCaveat: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: initial.exposure,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = initial.exposure;
        gl.shadowMap.enabled = false;
        gl.setClearColor(new THREE.Color(initial.bg), 0);
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
