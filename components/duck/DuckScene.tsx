"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { assetPath } from "@/lib/paths";
import { useExperience } from "@/components/providers/ExperienceProvider";
import type { Pose } from "@/lib/pose";
import { ensureProbe, pushGlFrame } from "@/lib/probe";
import { getThemeSnapshot, lightsAt, subscribeTheme } from "@/lib/theme";
import { ContactShadow } from "./ContactShadow";
import { OfficialDuck } from "./OfficialDuck";
import { StudioSet } from "./StudioSet";
function StudioIbl() {
  const { gl, scene, camera, invalidate } = useThree();
  const { setEnvironmentReady, setWebgl } = useExperience();
  useEffect(() => {
    let cancelled = false;
    let target: THREE.WebGLRenderTarget | null = null;
    const pmrem = new THREE.PMREMGenerator(gl);
    async function load() {
      try {
        const hdr = await new HDRLoader().loadAsync(assetPath("/preview-scene/studio-small-09-1k.hdr"));
        if (cancelled) { hdr.dispose(); return; }
        target = pmrem.fromEquirectangular(hdr);
        hdr.dispose();
        scene.environment = target.texture;
        await gl.compileAsync(scene, camera);
        if (cancelled) return;
        setEnvironmentReady(true);
        invalidate();
      } catch (error) {
        if (!cancelled) {
          console.error("Microduck environment load failed", error);
          setWebgl(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      scene.environment = null;
      target?.dispose();
      pmrem.dispose();
    };
  }, [gl, scene, camera, invalidate, setEnvironmentReady, setWebgl]);
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
      <directionalLight
        ref={key}
        position={[-0.7, 1.2, 0.7]}
        intensity={2.05}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-0.65}
        shadow-camera-right={0.65}
        shadow-camera-top={0.9}
        shadow-camera-bottom={-0.45}
        shadow-camera-near={0.05}
        shadow-camera-far={3}
        shadow-bias={-0.0001}
        shadow-normalBias={0.001}
      />
      <directionalLight
        ref={fill}
        position={[0.8, 0.35, 0.1]}
        intensity={0.6}
      />
      <directionalLight ref={rim} position={[0.1, 0.8, -1]} intensity={1.2} />
      <StudioSet />
      <ContactShadow poseRef={poseRef} />
      <OfficialDuck poseRef={poseRef} />
    </>
  );
}
