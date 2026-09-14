"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { getColorway, type ColorwayId } from "@/lib/colorways";
import type { Pose } from "@/lib/pose";

type DuckProps = {
  colorway: ColorwayId;
  pose: Pose;
  phaseOffset?: number;
  reducedMotion?: boolean;
};

function Servo({
  position,
  rotation,
  size = [0.2, 0.14, 0.24],
}: {
  position?: [number, number, number];
  rotation?: [number, number, number];
  size?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      <RoundedBox args={size} radius={0.018} smoothness={3}>
        <meshStandardMaterial color="#161616" roughness={0.42} metalness={0.38} />
      </RoundedBox>
      <mesh position={[size[0] / 2 + 0.012, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.048, 0.048, 0.034, 20]} />
        <meshStandardMaterial color="#c9c9c9" metalness={0.78} roughness={0.22} />
      </mesh>
    </group>
  );
}

function Cable({
  start,
  mid,
  end,
}: {
  start: [number, number, number];
  mid: [number, number, number];
  end: [number, number, number];
}) {
  const curve = useMemo(
    () =>
      new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(...start),
        new THREE.Vector3(...mid),
        new THREE.Vector3(...end)
      ),
    [start, mid, end]
  );

  return (
    <mesh>
      <tubeGeometry args={[curve, 14, 0.011, 5, false]} />
      <meshStandardMaterial color="#141414" roughness={0.7} />
    </mesh>
  );
}

function Head({
  colorway,
  beakRef,
  explode,
}: {
  colorway: ReturnType<typeof getColorway>;
  beakRef: React.RefObject<THREE.Group | null>;
  explode: number;
}) {
  return (
    <group position={[0, explode * 0.12, explode * 0.08]}>
      <mesh scale={[1.02, 0.78, 1.28]} position={[0, 0.04, -0.04]} castShadow>
        <sphereGeometry args={[0.33, 36, 28]} />
        <meshPhysicalMaterial
          color={colorway.shell}
          roughness={0.36}
          clearcoat={0.55}
          clearcoatRoughness={0.32}
        />
      </mesh>

      <RoundedBox args={[0.58, 0.36, 0.08]} radius={0.04} position={[0, -0.01, 0.275]} castShadow>
        <meshPhysicalMaterial color={colorway.visor} roughness={0.28} metalness={0.12} />
      </RoundedBox>

      <group position={[-0.12, 0.02, 0.322]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.07, 0.07, 0.03, 28]} />
          <meshPhysicalMaterial color={colorway.eyeRing} roughness={0.28} clearcoat={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.012]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.02, 24]} />
          <meshStandardMaterial color="#111" metalness={0.6} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0, 0.022]}>
          <sphereGeometry args={[0.028, 16, 12]} />
          <meshPhysicalMaterial color="#1a2228" roughness={0.05} metalness={0.4} />
        </mesh>
      </group>

      <mesh position={[0.08, 0.04, 0.318]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <meshStandardMaterial color="#111" />
      </mesh>

      <mesh position={[0.2, 0.1, 0.22]}>
        <sphereGeometry args={[0.012, 8, 8]} />
        <meshStandardMaterial color="#ff3b30" emissive="#ff3b30" emissiveIntensity={1.4} />
      </mesh>

      <group position={[0.3, -0.08, 0.08]}>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.055, 0.055, 0.04, 16]} />
          <meshPhysicalMaterial color={colorway.trim} roughness={0.35} />
        </mesh>
      </group>

      <group position={[0, explode * -0.08, explode * 0.18]}>
        <RoundedBox args={[0.62, 0.09, 0.42]} radius={0.03} position={[0, -0.175, 0.22]} castShadow>
          <meshPhysicalMaterial color={colorway.beak} roughness={0.4} clearcoat={0.25} />
        </RoundedBox>
        <group ref={beakRef} position={[0, -0.23, 0.12]}>
          <RoundedBox args={[0.54, 0.035, 0.34]} radius={0.012} position={[0, 0, 0.16]} castShadow>
            <meshPhysicalMaterial color={colorway.beak} roughness={0.42} />
          </RoundedBox>
        </group>
      </group>
    </group>
  );
}

function Foot({
  colorway,
  skateRef,
}: {
  colorway: ReturnType<typeof getColorway>;
  skateRef: React.RefObject<THREE.Group | null>;
}) {
  return (
    <group>
      <RoundedBox args={[0.16, 0.07, 0.3]} radius={0.03} position={[0, 0.02, 0.02]} castShadow>
        <meshPhysicalMaterial color={colorway.trim} roughness={0.4} />
      </RoundedBox>
      <RoundedBox args={[0.17, 0.04, 0.32]} radius={0.02} position={[0, -0.03, 0.02]}>
        <meshPhysicalMaterial color={colorway.sole} roughness={0.55} />
      </RoundedBox>
      <group ref={skateRef} position={[0, -0.07, 0.02]}>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, -0.02, -0.07]}>
          <cylinderGeometry args={[0.055, 0.055, 0.08, 16]} />
          <meshStandardMaterial color="#222" metalness={0.4} roughness={0.35} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]} position={[0, -0.02, 0.09]}>
          <cylinderGeometry args={[0.055, 0.055, 0.08, 16]} />
          <meshStandardMaterial color="#222" metalness={0.4} roughness={0.35} />
        </mesh>
      </group>
    </group>
  );
}

function Leg({
  side,
  colorway,
  hipRef,
  kneeRef,
  skateRef,
  explode,
}: {
  side: 1 | -1;
  colorway: ReturnType<typeof getColorway>;
  hipRef: React.RefObject<THREE.Group | null>;
  kneeRef: React.RefObject<THREE.Group | null>;
  skateRef: React.RefObject<THREE.Group | null>;
  explode: number;
}) {
  const x = side * 0.16;
  return (
    <group
      ref={hipRef}
      position={[x + side * explode * 0.28, explode * -0.08, 0]}
      rotation={[0, 0, side * 0.06]}
    >
      <Servo position={[0, 0, 0]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} size={[0.18, 0.13, 0.2]} />
      <RoundedBox
        args={[0.2, 0.28, 0.22]}
        radius={0.05}
        position={[side * 0.04, -0.16, 0.02]}
        rotation={[0.12, 0, 0]}
        castShadow
      >
        <meshPhysicalMaterial
          color={colorway.shell}
          roughness={0.38}
          clearcoat={0.4}
          clearcoatRoughness={0.35}
        />
      </RoundedBox>
      <group ref={kneeRef} position={[0, -0.32, 0.02]}>
        <Servo position={[0, 0, 0]} rotation={[0, side > 0 ? Math.PI : 0, 0]} size={[0.17, 0.12, 0.2]} />
        <RoundedBox args={[0.12, 0.22, 0.12]} radius={0.02} position={[0, -0.16, 0]}>
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} metalness={0.3} />
        </RoundedBox>
        <group position={[0, -0.3, 0]}>
          <Servo size={[0.16, 0.11, 0.18]} rotation={[0, side > 0 ? 0 : Math.PI, 0]} />
          <group position={[0, -0.1, 0.04]}>
            <Foot colorway={colorway} skateRef={skateRef} />
          </group>
        </group>
      </group>
    </group>
  );
}

export function MicroDuck({ colorway: colorwayId, pose, phaseOffset = 0, reducedMotion }: DuckProps) {
  const colorway = getColorway(colorwayId);
  const root = useRef<THREE.Group>(null);
  const neck = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const beak = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const skateL = useRef<THREE.Group>(null);
  const skateR = useRef<THREE.Group>(null);
  const cube = useRef<THREE.Mesh>(null);
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useFrame(({ clock }) => {
    const p = poseRef.current;
    const t = clock.elapsedTime + phaseOffset;
    const walk = reducedMotion ? 0 : p.walkAmp;
    const speed = p.skate > 0.5 ? 6.5 : 5.2;
    const phase = t * speed;
    const hipSwing = Math.sin(phase) * 0.42 * walk;
    const hipSwingR = Math.sin(phase + Math.PI) * 0.42 * walk;
    const knee = Math.max(0.12, 0.25 - Math.sin(phase) * 0.55 * walk) + p.crouch * 0.7;
    const kneeRight = Math.max(0.12, 0.25 - Math.sin(phase + Math.PI) * 0.55 * walk) + p.crouch * 0.7;

    const recover = p.recover;
    const rootRotX = recover * 1.55 + p.duckRotation[0];
    const rootY = 0.22 + recover * 0.35 + p.skate * 0.04 + p.crouch * -0.22;
    const skateZ = p.skate * Math.sin(t * 1.4) * 0.35;

    if (root.current) {
      root.current.position.set(p.duckPosition[0], rootY, p.duckPosition[2] + skateZ);
      root.current.rotation.set(rootRotX, p.duckRotation[1], p.duckRotation[2]);
      root.current.scale.setScalar(p.duckScale);
    }
    if (neck.current) neck.current.rotation.x = p.neckPitch;
    if (head.current) {
      head.current.rotation.x = p.headPitch;
      head.current.rotation.y = p.headYaw;
    }
    if (beak.current) beak.current.rotation.x = p.beak * 0.55;
    if (hipL.current) hipL.current.rotation.x = hipSwing + p.crouch * 0.55;
    if (hipR.current) hipR.current.rotation.x = hipSwingR + p.crouch * 0.55;
    if (kneeL.current) kneeL.current.rotation.x = knee;
    if (kneeR.current) kneeR.current.rotation.x = kneeRight;
    const skateScale = Math.max(0.001, p.skate);
    skateL.current?.scale.setScalar(skateScale);
    skateR.current?.scale.setScalar(skateScale);
    if (cube.current) {
      cube.current.visible = p.grab > 0.04;
      cube.current.position.set(0, 0.08 + p.crouch * 0.05, 0.42);
      cube.current.scale.setScalar(0.7 + p.grab * 0.3);
    }
  });

  return (
    <group ref={root}>
      <group position={[0, 0.72 + pose.explode * -0.02, 0]}>
        <RoundedBox args={[0.46, 0.32, 0.36]} radius={0.08} castShadow>
          <meshPhysicalMaterial
            color={colorway.shell}
            roughness={0.36}
            clearcoat={0.5}
            clearcoatRoughness={0.3}
          />
        </RoundedBox>
        <RoundedBox args={[0.22, 0.12, 0.08]} radius={0.015} position={[0, -0.02, -0.2]}>
          <meshStandardMaterial color="#1c1c1c" roughness={0.45} metalness={0.35} />
        </RoundedBox>
      </group>

      <group ref={neck} position={[0, 0.95 + pose.explode * 0.16, 0.02]}>
        <Servo position={[0, 0, 0]} rotation={[0, Math.PI / 2, 0]} size={[0.16, 0.12, 0.2]} />
        <Servo position={[0, 0.15, 0.01]} rotation={[0.1, Math.PI / 2, 0]} size={[0.16, 0.12, 0.2]} />
        <Cable start={[0.08, 0.02, -0.04]} mid={[0.14, -0.08, -0.06]} end={[0.06, -0.2, -0.08]} />
        <group ref={head} position={[0, 0.42 + pose.explode * 0.22, 0.04]}>
          <Head colorway={colorway} beakRef={beak} explode={pose.explode} />
        </group>
      </group>

      <group position={[0, 0.58, 0]}>
        <Leg
          side={-1}
          colorway={colorway}
          hipRef={hipL}
          kneeRef={kneeL}
          skateRef={skateL}
          explode={pose.explode}
        />
        <Leg
          side={1}
          colorway={colorway}
          hipRef={hipR}
          kneeRef={kneeR}
          skateRef={skateR}
          explode={pose.explode}
        />
      </group>

      <mesh ref={cube} visible={false}>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial color="#4f7cff" roughness={0.4} />
      </mesh>
    </group>
  );
}
