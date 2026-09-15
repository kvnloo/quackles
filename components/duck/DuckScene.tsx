"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Pose } from "@/lib/pose";
import { poseAtInto } from "@/lib/pose";
import { publishPose, pushGlFrame } from "@/lib/probe";
import { getThemeSnapshot, lightsAt } from "@/lib/theme";
import { OfficialDuck } from "./OfficialDuck";

function Studio({
  poseRef,
  progressRef,
}: {
  poseRef: MutableRefObject<Pose>;
  progressRef: MutableRefObject<number>;
}) {
  const { camera, gl } = useThree();
  const look = useRef(new THREE.Vector3());
  const lastFov = useRef(-1);
  const lastTheme = useRef(-1);
  const floor = useRef<THREE.MeshBasicMaterial>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);

  useFrame((_, delta) => {
    poseAtInto(poseRef.current, progressRef.current);
    const pose = poseRef.current;
    camera.position.set(pose.camPos[0], pose.camPos[1], pose.camPos[2]);
    look.current.set(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
    camera.lookAt(look.current);
    const persp = camera as THREE.PerspectiveCamera;
    if (Math.abs(pose.fov - lastFov.current) > 0.04) {
      persp.fov = pose.fov;
      persp.updateProjectionMatrix();
      lastFov.current = pose.fov;
    }

    const t = getThemeSnapshot();
    if (Math.abs(t - lastTheme.current) > 0.004) {
      lastTheme.current = t;
      const L = lightsAt(t);
      gl.setClearColor(L.bg, 1);
      if (amb.current) {
        amb.current.color.set(L.ambient);
        amb.current.intensity = L.ambientIntensity;
      }
      if (key.current) {
        key.current.color.set(L.key);
        key.current.intensity = L.keyIntensity;
      }
      if (fill.current) {
        fill.current.color.set(L.fill);
        fill.current.intensity = L.fillIntensity;
      }
      if (floor.current) floor.current.color.set(L.bg);
    }

    publishPose(progressRef.current, pose);
    pushGlFrame(delta, progressRef.current, pose);
  });

  return (
    <>
      <ambientLight ref={amb} intensity={0.82} color="#f4eee4" />
      <directionalLight ref={key} position={[0.55, 1.2, 0.45]} intensity={1.55} color="#fff8ee" />
      <directionalLight ref={fill} position={[-0.6, 0.35, 0.2]} intensity={0.32} color="#ffffff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial ref={floor} color="#efe8dc" />
      </mesh>
    </>
  );
}

export function DuckScene({
  poseRef,
  progressRef,
  reducedMotion,
}: {
  poseRef: MutableRefObject<Pose>;
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  return (
    <>
      <Studio poseRef={poseRef} progressRef={progressRef} />
      <group position={[0.02, 0, 0]}>
        <OfficialDuck poseRef={poseRef} reducedMotion={reducedMotion} />
      </group>
    </>
  );
}
