"use client";

import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject, type ReactNode } from "react";
import * as THREE from "three";
import type { ColorwayId } from "@/lib/colorways";
import { lerp, type Pose } from "@/lib/pose";
import { OfficialDuck, OfficialFlock } from "./OfficialDuck";

function CameraRig({
  poseRef,
  mobile,
}: {
  poseRef: MutableRefObject<Pose>;
  mobile: boolean;
}) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());

  useFrame(() => {
    const p = poseRef.current;
    const ox = mobile ? 0 : 0.04;
    const oy = mobile ? 0.06 : 0;
    const oz = mobile ? 0.16 : 0;
    desired.current.set(p.camPos[0] + ox, p.camPos[1] + oy, p.camPos[2] + oz);
    camera.position.lerp(desired.current, 0.08);
    lookTarget.current.set(p.lookAt[0], p.lookAt[1], p.lookAt[2]);
    look.current.lerp(lookTarget.current, 0.08);
    camera.lookAt(look.current);
    const persp = camera as THREE.PerspectiveCamera;
    persp.fov = lerp(persp.fov, p.fov + (mobile ? 6 : 0), 0.08);
    persp.updateProjectionMatrix();
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.45} color="#f3ead8" />
      <hemisphereLight args={["#f7ead2", "#2a2118", 0.5]} />
      <directionalLight
        position={[0.8, 1.35, 0.6]}
        intensity={1.35}
        color="#fff4e5"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-0.8, 0.45, 0.3]} intensity={0.4} color="#9eb6ff" />
      <directionalLight position={[0.05, 0.35, -0.8]} intensity={0.7} color="#ffd8b0" />
    </>
  );
}

function Pedestal() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.0005, 0]} receiveShadow>
        <circleGeometry args={[0.85, 64]} />
        <meshStandardMaterial color="#161310" roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.0004, 0]}>
        <ringGeometry args={[0.22, 0.228, 64]} />
        <meshBasicMaterial color="#e56b1a" transparent opacity={0.35} />
      </mesh>
    </group>
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
  mobile,
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
      <color attach="background" args={["#100e0c"]} />
      <fog attach="fog" args={["#100e0c", 1.6, 3.8]} />
      <Lights />
      <Gate
        poseRef={poseRef}
        showWhen={(p) => p.explode < 0.55 && p.play < 0.45 && p.flock < 0.72}
      >
        <Pedestal />
      </Gate>
      <CameraRig poseRef={poseRef} mobile={mobile} />

      <Gate
        poseRef={poseRef}
        showWhen={(p) => p.explode < 0.55 && p.play < 0.45 && p.flock < 0.72}
      >
        <group position={mobile ? [0, 0, 0] : [0.12, 0, 0]}>
          <OfficialDuck poseRef={duckPose} colorway={colorway} reducedMotion={reducedMotion} />
        </group>
      </Gate>

      <Gate poseRef={poseRef} showWhen={(p) => p.flock > 0.04 && p.play < 0.4}>
        <OfficialFlock poseRef={poseRef} reducedMotion={reducedMotion} />
      </Gate>

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.55}
        scale={2.4}
        blur={2.2}
        far={0.8}
        resolution={512}
        color="#000000"
      />
    </>
  );
}
