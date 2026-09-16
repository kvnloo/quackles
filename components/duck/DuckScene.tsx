"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import type { Pose } from "@/lib/pose";
import { ensureProbe, pushGlFrame } from "@/lib/probe";
import { getThemeSnapshot, lightsAt, subscribeTheme } from "@/lib/theme";
import { ContactShadow } from "./ContactShadow";
import { OfficialDuck } from "./OfficialDuck";
function StudioIbl() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl),
      room = new RoomEnvironment(),
      rt = pmrem.fromScene(room, 0.04);
    scene.environment = rt.texture;
    room.dispose();
    invalidate();
    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, invalidate]);
  return null;
}
export function DuckScene({
  poseRef,
  progressRef,
}: {
  poseRef: MutableRefObject<Pose>;
  progressRef: MutableRefObject<number>;
  reducedMotion: boolean;
}) {
  const { camera, gl, scene, invalidate } = useThree();
  const look = useRef(new THREE.Vector3());
  const key = useRef<THREE.DirectionalLight>(null),
    fill = useRef<THREE.DirectionalLight>(null),
    rim = useRef<THREE.DirectionalLight>(null),
    ambient = useRef<THREE.AmbientLight>(null);
  const lastTheme = useRef(-1);
  useEffect(() => {
    window.__QUACKLES_INVALIDATE__ = invalidate;
    const unsub = subscribeTheme(invalidate);
    invalidate();
    return () => {
      delete window.__QUACKLES_INVALIDATE__;
      unsub();
    };
  }, [invalidate]);
  useFrame((_, delta) => {
    const pose = poseRef.current;
    camera.position.fromArray(pose.camPos);
    look.current.fromArray(pose.lookAt);
    camera.lookAt(look.current);
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    const t = getThemeSnapshot();
    if (t !== lastTheme.current) {
      lastTheme.current = t;
      const L = lightsAt(t);
      scene.background = new THREE.Color(L.bg);
      gl.toneMappingExposure = L.exposure;
      scene.environmentIntensity = L.envIntensity;
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
      if (ambient.current) {
        ambient.current.color.set(L.ambient);
        ambient.current.intensity = L.ambientIntensity;
      }
    }
    pushGlFrame(delta, progressRef.current, pose);
    const q = ensureProbe();
    if (q) {
      q.renderer.calls = gl.info.render.calls;
      q.renderer.triangles = gl.info.render.triangles;
      q.renderer.geometries = gl.info.memory.geometries;
      q.renderer.textures = gl.info.memory.textures;
      q.renderer.dpr = gl.getPixelRatio();
    }
  }, -2);
  return (
    <>
      <StudioIbl />
      <ambientLight ref={ambient} intensity={0.38} />
      <directionalLight ref={key} position={[-0.7, 1.2, 0.7]} intensity={2.8} />
      <directionalLight
        ref={fill}
        position={[0.8, 0.35, 0.1]}
        intensity={0.6}
      />
      <directionalLight ref={rim} position={[0.1, 0.8, -1]} intensity={1.2} />
      <ContactShadow poseRef={poseRef} />
      <OfficialDuck poseRef={poseRef} />
    </>
  );
}
