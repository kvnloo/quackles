"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense, type ReactNode } from "react";
import * as THREE from "three";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { DuckScene } from "./DuckScene";
export function DuckCanvas({ children }: { children?: ReactNode }) {
  const { setWebgl, poseRef, progressRef, reducedMotion } = useExperience();
  return (
    <Canvas
      className="duck-canvas"
      camera={{ position: [0.41, 0.245, 0.71], fov: 32, near: 0.02, far: 10 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      shadows="soft"
      resize={{ scroll: false, debounce: { resize: 150, scroll: 0 } }}
      gl={{
        antialias: true,
        alpha: true,
        stencil: false,
        depth: true,
        powerPreference: "high-performance",
        // The plates' view transform is Khronos PBR Neutral (exposure 0, sRGB display) in every theme.
        toneMapping: THREE.NeutralToneMapping,
      }}
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace;
        setWebgl(true);
      }}
    >
      <Suspense fallback={null}>
        <DuckScene
          poseRef={poseRef}
          progressRef={progressRef}
          reducedMotion={reducedMotion}
        />
        {children}
      </Suspense>
    </Canvas>
  );
}
