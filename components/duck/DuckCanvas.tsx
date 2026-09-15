"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { playMorph } from "@/lib/sim/morph";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { CanvasGuard } from "./CanvasGuard";
import { DuckFallback } from "./DuckFallback";
import { DuckScene } from "./DuckScene";

export function DuckCanvas() {
  const { setReady, setWebgl, colorway, poseRef, reducedMotion, mobile, progress, theme } =
    useExperience();
  const dpr =
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.75);
  const fade = playMorph(progress);
  const explodeFade = Math.min(1, Math.max(0, (poseRef.current.explode - 0.12) / 0.4));
  const opacity = Math.max(0, 1 - Math.max(fade, explodeFade * 0.92));

  return (
    <CanvasGuard
      fallback={<DuckFallback />}
      onError={() => {
        setWebgl(false);
        setReady(true);
      }}
    >
      <div className="h-full w-full transition-opacity duration-500" style={{ opacity }}>
        <Canvas
          className="h-full w-full"
          camera={{ position: [0.46, 0.14, 0.82], fov: 26, near: 0.02, far: 12 }}
          dpr={dpr}
          shadows
          gl={{
            antialias: true,
            alpha: true,
            failIfMajorPerformanceCaveat: false,
            powerPreference: "default",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: theme.lights.exposure,
          }}
          onCreated={({ gl }) => {
            gl.setClearColor(0x000000, 0);
            setWebgl(true);
            setReady(true);
          }}
        >
          <Suspense fallback={null}>
            <DuckScene
              poseRef={poseRef}
              colorway={colorway}
              mobile={mobile}
              reducedMotion={reducedMotion}
              theme={theme}
            />
          </Suspense>
        </Canvas>
      </div>
    </CanvasGuard>
  );
}
