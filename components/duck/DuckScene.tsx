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

  useFrame(() => {
    const p = poseRef.current;
    desired.current.set(p.camPos[0], p.camPos[1], p.camPos[2]);
    camera.position.lerp(desired.current, 0.08);
    lookTarget.current.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    look.current.lerp(lookTarget.current, 0.08);
    camera.lookAt(look.current);
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = lerp(persp.fov, p.fov, 0.08);
    persp.updateProjectionMatrix();
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.78} color="#fff7ee" />
      <hemisphereLight args={["#fff4e8", "#c9b89a", 0.72]} />
      <directionalLight
        position={[0.55, 1.4, 0.55]}
        intensity={2.15}
        color="#fff6ea"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0003}
      />
      <directionalLight position={[-0.8, 0.5, 0.2]} intensity={0.55} color="#2f5bff" />
      <directionalLight position={[0.2, 0.3, -0.7]} intensity={0.48} color="#ffffff" />
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
        <group position={[0.02, 0, 0]}>
          <OfficialDuck poseRef={duckPose} colorway={colorway} reducedMotion={reducedMotion} />
        </group>
      </Gate>

      <Gate poseRef={poseRef} showWhen={(p) => p.flock > 0.04 && p.play < 0.4}>
        <OfficialFlock poseRef={poseRef} reducedMotion={reducedMotion} />
      </Gate>

      <ContactShadows
        position={[0, 0.001, 0]}
        opacity={0.22}
        scale={1.6}
        blur={2.6}
        far={0.5}
        resolution={512}
        color="#6a5a40"
      />
    </>
  );
}
