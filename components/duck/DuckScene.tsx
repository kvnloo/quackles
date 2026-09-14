"use client";

import { ContactShadows } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { COLORWAYS, type ColorwayId } from "@/lib/colorways";
import { lerp, type Pose } from "@/lib/pose";
import { MicroDuck } from "./MicroDuck";

function CameraRig({ pose, mobile }: { pose: Pose; mobile: boolean }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const poseRef = useRef(pose);
  poseRef.current = pose;

  useFrame(() => {
    const p = poseRef.current;
    const ox = mobile ? 0 : 0.05;
    const oy = mobile ? 0.28 : 0;
    const oz = mobile ? 0.7 : 0;
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
      <ambientLight intensity={0.42} color="#f3ead8" />
      <hemisphereLight args={["#f7ead2", "#2a2118", 0.55]} />
      <directionalLight
        position={[3.2, 5.4, 2.4]}
        intensity={2.15}
        color="#fff4e5"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
      />
      <directionalLight position={[-3.2, 1.8, 1.2]} intensity={0.55} color="#9eb6ff" />
      <directionalLight position={[0.2, 1.4, -3.2]} intensity={0.85} color="#ffd8b0" />
      <pointLight position={[0.4, 1.6, 1.4]} intensity={0.45} color="#e56b1a" distance={4} />
    </>
  );
}

function Pedestal() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} receiveShadow>
        <circleGeometry args={[3.4, 64]} />
        <meshStandardMaterial color="#161310" roughness={0.92} metalness={0.08} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]}>
        <ringGeometry args={[1.15, 1.18, 64]} />
        <meshBasicMaterial color="#e56b1a" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

export function DuckScene({
  pose,
  colorway,
  mobile,
  reducedMotion,
}: {
  pose: Pose;
  colorway: ColorwayId;
  mobile: boolean;
  reducedMotion: boolean;
}) {
  const flock = pose.flock;
  const mainVisible = flock < 0.72;

  const idle = useMemo(
    () => ({
      ...pose,
      explode: 0,
      walkAmp: reducedMotion ? 0 : 0.12,
      recover: 0,
      skate: 0,
      grab: 0,
      crouch: 0.06,
      flock: 0,
    }),
    [pose, reducedMotion]
  );

  return (
    <>
      <color attach="background" args={["#100e0c"]} />
      <fog attach="fog" args={["#100e0c", 7, 16]} />
      <Lights />
      <Pedestal />
      <CameraRig pose={pose} mobile={mobile} />

      <group position={mobile ? [0, 0, 0] : [0.42, 0, 0]} visible={mainVisible}>
        <MicroDuck colorway={colorway} pose={pose} reducedMotion={reducedMotion} />
      </group>

      {flock > 0.04 &&
        COLORWAYS.map((c, i) => (
          <group key={c.id} position={[(i - 1.5) * 1.22 * flock, 0, 0]} scale={flock}>
            <MicroDuck
              colorway={c.id}
              pose={idle}
              phaseOffset={i * 0.4}
              reducedMotion={reducedMotion}
            />
          </group>
        ))}

      <ContactShadows
        position={[0, 0, 0]}
        opacity={0.5}
        scale={10}
        blur={2.2}
        far={3.2}
        resolution={512}
        color="#000000"
      />
    </>
  );
}
