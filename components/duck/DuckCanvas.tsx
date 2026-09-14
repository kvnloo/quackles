"use client";

import { Canvas } from "@react-three/fiber";
import { Suspense } from "react";
import * as THREE from "three";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { CanvasGuard } from "./CanvasGuard";
import { DuckFallback } from "./DuckFallback";
import { DuckScene } from "./DuckScene";

export function DuckCanvas() {
  const { setReady, setWebgl, colorway, poseRef, reducedMotion, mobile, progress } =
    useExperience();
  const dpr =
    typeof window === "undefined" ? 1 : Math.min(window.devicePixelRatio, 1.75);
  const fade = Math.min(1, Math.max(0, (progress - 0.78) / 0.1));
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
          camera={{ position: [0.4, 0.2, 0.5], fov: 28, near: 0.02, far: 12 }}
          dpr={dpr}
          shadows
          gl={{
            antialias: true,
            alpha: false,
            failIfMajorPerformanceCaveat: false,
            powerPreference: "default",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.05,
          }}
          onCreated={() => {
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
            />
          </Suspense>
        </Canvas>
      </div>
    </CanvasGuard>
  );
}
