"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import type { Pose } from "@/lib/pose";
import { poseAtInto } from "@/lib/pose";
import { readScrollProgress } from "@/lib/scroll";
import { publishPose, pushGlFrame } from "@/lib/probe";
import { OfficialDuck } from "./OfficialDuck";

function ScrollBinder({
  poseRef,
  progressRef,
}: {
  poseRef: MutableRefObject<Pose>;
  progressRef: MutableRefObject<number>;
}) {
  const { camera, invalidate } = useThree();
  const look = useRef(new THREE.Vector3());
  const lastFov = useRef(-1);

  useEffect(() => {
    window.__QUACKLES_INVALIDATE__ = invalidate;
    const bump = () => invalidate();
    window.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("touchmove", bump, { passive: true });
    invalidate();
    return () => {
      window.removeEventListener("scroll", bump);
      window.removeEventListener("touchmove", bump);
    };
  }, [invalidate]);

  useFrame((_, delta) => {
    const p = readScrollProgress();
    progressRef.current = p;
    poseAtInto(poseRef.current, p);
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
    publishPose(p, pose);
    pushGlFrame(delta, p, pose);
  });

  return null;
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.78} color="#f4eee4" />
      <directionalLight position={[0.55, 1.15, 0.4]} intensity={1.45} color="#fff8ee" />
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
      <Lights />
      <ScrollBinder poseRef={poseRef} progressRef={progressRef} />
      <group position={[0.03, 0, 0]}>
        <OfficialDuck poseRef={poseRef} reducedMotion={reducedMotion} />
      </group>
    </>
  );
}
