"use client";

import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import type { ColorwayId } from "@/lib/colorways";
import { lerp, type Pose } from "@/lib/pose";
import { OfficialDuck, OfficialFlock } from "./OfficialDuck";

function CameraRig({ poseRef }: { poseRef: MutableRefObject<Pose> }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const primed = useRef(false);

  useFrame(() => {
    const p = poseRef.current;
    desired.current.set(p.camPos[0], p.camPos[1], p.camPos[2]);
    lookTarget.current.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    if (!primed.current) {
      camera.position.copy(desired.current);
      look.current.copy(lookTarget.current);
      primed.current = true;
    } else {
      camera.position.lerp(desired.current, 0.18);
      look.current.lerp(lookTarget.current, 0.18);
    }
    camera.lookAt(look.current);
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = p.fov;
    persp.updateProjectionMatrix();
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.62} color="#f3ece2" />
      <hemisphereLight args={["#f6f0e6", "#b7ad93", 0.58]} />
      <directionalLight
        position={[0.7, 1.5, 0.35]}
        intensity={1.85}
        color="#fff8ee"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-0.9, 0.4, 0.15]} intensity={0.42} color="#2f5bff" />
      <directionalLight position={[0.15, 0.25, -0.8]} intensity={0.38} color="#ffffff" />
    </>
  );
}

function Gate({
  poseRef,
  showWhen,
  children,
}: {
  poseRef: MutableRefObject<Pose>;
  showWhen: (p: Pose) => boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  useFrame(() => {
    if (group.current) group.current.visible = showWhen(poseRef.current);
  });
  return <group ref={group}>{children}</group>;
}

export function DuckScene({
  poseRef,
  colorway,
  reducedMotion,
}: {
  poseRef: MutableRefObject<Pose>;
  colorway: ColorwayId;
  mobile: boolean;
  reducedMotion: boolean;
}) {
  const duckPose = useRef(poseRef.current);
  useFrame(() => {
    duckPose.current = poseRef.current;
  });

  return (
    <>
      <Lights />
      <CameraRig poseRef={poseRef} />

      <Gate
        poseRef={poseRef}
        showWhen={(p) => p.explode < 0.55 && p.play < 0.45 && p.flock < 0.72}
      >
        <group position={[0.03, 0, 0]}>
          <OfficialDuck poseRef={duckPose} colorway={colorway} reducedMotion={reducedMotion} />
        </group>
      </Gate>

      <Gate poseRef={poseRef} showWhen={(p) => p.flock > 0.04 && p.play < 0.4}>
        <OfficialFlock poseRef={poseRef} reducedMotion={reducedMotion} />
      </Gate>

      <ContactShadows
        position={[0, -0.01, 0]}
        opacity={0.28}
        scale={1.4}
        blur={2.2}
        far={0.45}
        resolution={512}
        color="#6a5a40"
      />
    </>
  );
}
