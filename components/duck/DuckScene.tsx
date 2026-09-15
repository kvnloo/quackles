"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Pose } from "@/lib/pose";
import { poseAtInto } from "@/lib/pose";
import { publishPose, pushGlFrame } from "@/lib/probe";
import { getThemeSnapshot, lightsAt } from "@/lib/theme";
import { OfficialDuck } from "./OfficialDuck";

function StudioIbl() {
  const { gl, scene } = useThree();

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.88;
    room.dispose();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);

  return null;
}

function Studio({
  poseRef,
  progressRef,
}: {
  poseRef: MutableRefObject<Pose>;
  progressRef: MutableRefObject<number>;
}) {
  const { camera, gl, scene } = useThree();
  const look = useRef(new THREE.Vector3());
  const lastFov = useRef(-1);
  const lastTheme = useRef(-1);
  const floor = useRef<THREE.MeshBasicMaterial>(null);
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const rim = useRef<THREE.DirectionalLight>(null);
  const amb = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

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
    if (Math.abs(t - lastTheme.current) > 0.001) {
      lastTheme.current = t;
      const L = lightsAt(t);
      gl.toneMappingExposure = L.exposure;
      gl.setClearColor(L.bg, 1);
      scene.environmentIntensity = L.envIntensity;
      if (amb.current) {
        amb.current.color.set(L.ambient);
        amb.current.intensity = L.ambientIntensity;
      }
      if (hemi.current) {
        hemi.current.color.set(L.hemiSky);
        hemi.current.groundColor.set(L.hemiGround);
        hemi.current.intensity = L.hemiIntensity;
      }
      if (key.current) {
        key.current.color.set(L.key);
        key.current.intensity = L.keyIntensity;
      }
      if (fill.current) {
        fill.current.color.set(L.fill);
        fill.current.intensity = L.fillIntensity;
      }
      if (rim.current) {
        rim.current.color.set(L.rim);
        rim.current.intensity = L.rimIntensity;
      }
      if (floor.current) floor.current.color.set(L.bg);
    }

    publishPose(progressRef.current, pose);
    pushGlFrame(delta, progressRef.current, pose);
  });

  return (
    <>
      <StudioIbl />
      <ambientLight ref={amb} intensity={0.32} color="#3d3dff" />
      <hemisphereLight ref={hemi} color="#9a9aff" groundColor="#0000c2" intensity={0.48} />
      <directionalLight ref={key} position={[0.72, 1.45, 0.62]} intensity={2.35} color="#f7f7ff" />
      <directionalLight ref={fill} position={[-0.82, 0.48, 0.38]} intensity={0.78} color="#0000f2" />
      <directionalLight ref={rim} position={[-0.18, 0.72, -0.92]} intensity={1.35} color="#7a7aff" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial ref={floor} color="#0000f2" />
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
