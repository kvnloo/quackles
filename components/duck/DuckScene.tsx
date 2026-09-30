"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { assetPath } from "@/lib/paths";
import { useExperience } from "@/components/providers/ExperienceProvider";
import type { Pose } from "@/lib/pose";
import { ensureProbe, pushGlFrame } from "@/lib/probe";
import { subscribeTheme } from "@/lib/theme";
import { BLENDER_LIGHTS, blenderToThree, currentGrade, displayBackdrop, subscribeGrade, type Vec3 } from "@/lib/sim/render-grade";
import { ContactShadow } from "./ContactShadow";
import { OfficialDuck } from "./OfficialDuck";
import { StudioSet } from "./StudioSet";

// Cycles lights the plates' world in three separate paths: a flat colour for diffuse rays, the studio HDR only for
// glossy/transmission rays, and a flat backdrop for camera rays. Match that split: the PMREM environment feeds
// specular only; the flat diffuse world is an AmbientLight (see lib/sim/render-grade.ts). This bundle is the only
// three.js on the page (lazy, ?sim=1), so the chunk edit cannot leak into flag-off rendering.
const IBL_DIFFUSE = "iblIrradiance += getIBLIrradiance( geometryNormal );";
if (THREE.ShaderChunk.lights_fragment_maps.includes(IBL_DIFFUSE))
  THREE.ShaderChunk.lights_fragment_maps = THREE.ShaderChunk.lights_fragment_maps.replace(IBL_DIFFUSE, "/* specular-only IBL (Cycles glossy-ray world) */");
else if (!THREE.ShaderChunk.lights_fragment_maps.includes("specular-only IBL"))
  throw new Error("three lights_fragment_maps changed: re-derive the specular-only IBL patch");

const _v = new THREE.Vector3();
const aimFrom = (position: Vec3, direction: Vec3): Vec3 => blenderToThree([position[0] + direction[0], position[1] + direction[1], position[2] + direction[2]]);
function aimSpot(light: THREE.SpotLight, position: Vec3, target: Vec3) {
  light.position.fromArray(position);
  light.target.position.fromArray(target);
  light.target.updateMatrixWorld();
}
/** Area light of the Blender rig as a hemisphere spot: I = P/pi, decay 2, cos-like falloff. */
function areaSpot(light: THREE.SpotLight | null, color: Vec3, power: number) {
  if (!light) return;
  light.color.setRGB(color[0], color[1], color[2], THREE.LinearSRGBColorSpace);
  light.intensity = power / Math.PI;
  light.visible = power > 0;
}
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
  const key = useRef<THREE.SpotLight>(null),
    fill = useRef<THREE.SpotLight>(null),
    rim = useRef<THREE.SpotLight>(null),
    bounce = useRef<THREE.SpotLight>(null),
    ambient = useRef<THREE.AmbientLight>(null);
  const gradeDirty = useRef(true);
  const backdrop = useRef(new THREE.Color());
  useEffect(() => {
    window.__QUACKLES_SET_SHADOWS__ = async (enabled) => {
      if (!key.current) throw new Error("Studio key light is not ready");
      gl.shadowMap.enabled = enabled;
      key.current.castShadow = enabled;
      scene.traverse((node) => {
        if (!(node instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(node.material) ? node.material : [node.material])
          material.needsUpdate = true;
      });
      await gl.compileAsync(scene, camera);
      gl.shadowMap.needsUpdate = enabled;
      invalidate();
    };
    return () => { delete window.__QUACKLES_SET_SHADOWS__; };
  }, [camera, gl, invalidate, scene]);
  useEffect(() => {
    window.__QUACKLES_INVALIDATE__ = invalidate;
    const dirty = () => { gradeDirty.current = true; invalidate(); };
    scene.background = backdrop.current;
    const unsub = subscribeTheme(invalidate);
    const unsubGrade = subscribeGrade(dirty);
    dirty();
    // Static Blender transforms for the soft lights (identical in every studio scene).
    aimSpot(fill.current!, blenderToThree(BLENDER_LIGHTS.fill.position), aimFrom(BLENDER_LIGHTS.fill.position, BLENDER_LIGHTS.fill.direction));
    aimSpot(rim.current!, blenderToThree(BLENDER_LIGHTS.rim.position), aimFrom(BLENDER_LIGHTS.rim.position, BLENDER_LIGHTS.rim.direction));
    aimSpot(bounce.current!, blenderToThree(BLENDER_LIGHTS.bounce.position), aimFrom(BLENDER_LIGHTS.bounce.position, BLENDER_LIGHTS.bounce.direction));
    return () => {
      delete window.__QUACKLES_INVALIDATE__;
      unsub();
      unsubGrade();
    };
  }, [invalidate, scene]);
  useFrame((_, delta) => {
    const pose = poseRef.current;
    camera.position.fromArray(pose.camPos);
    look.current.fromArray(pose.lookAt);
    camera.lookAt(look.current);
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== pose.fov) {
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
    if (gradeDirty.current) {
      gradeDirty.current = false;
      const G = currentGrade();
      const bg = displayBackdrop(G);
      // One Color object for the life of the scene: debug robot-only mode detaches and later restores this instance.
      backdrop.current.setRGB(bg[0], bg[1], bg[2], THREE.LinearSRGBColorSpace);
      gl.toneMappingExposure = 2 ** G.exposure;
      scene.environmentIntensity = G.envIntensity;
      scene.environmentRotation.set(0, G.envRotationY, 0);
      if (key.current) {
        key.current.color.setRGB(G.key.color[0], G.key.color[1], G.key.color[2], THREE.LinearSRGBColorSpace);
        key.current.intensity = G.key.intensity;
        aimSpot(key.current, G.key.position, G.key.target);
        // Sun: a distant narrow spot (parallel rays over the set); studio key: the Blender area light's hemisphere.
        const d = _v.fromArray(G.key.position).distanceTo(key.current.target.position);
        key.current.angle = G.key.kind === "sun" ? Math.atan(1.2 / d) : Math.PI / 2 - 1e-3;
        key.current.penumbra = G.key.kind === "sun" ? 0.2 : 1;
        key.current.shadow.focus = G.key.kind === "sun" ? 1 : 0.4;
        key.current.shadow.camera.near = Math.max(0.05, d - 1.5);
        key.current.shadow.camera.far = d + 1.5;
        key.current.shadow.camera.updateProjectionMatrix();
        key.current.shadow.needsUpdate = true;
      }
      areaSpot(fill.current, G.fill.color, G.fill.power);
      areaSpot(rim.current, G.rim.color, G.rim.power);
      areaSpot(bounce.current, G.bounce.color, G.bounce.power);
      if (ambient.current) {
        ambient.current.color.setRGB(G.world.color[0], G.world.color[1], G.world.color[2], THREE.LinearSRGBColorSpace);
        ambient.current.intensity = Math.PI * G.world.strength * G.world.occlusion;
      }
    }
    pushGlFrame(delta, progressRef.current, pose);
    const q = ensureProbe();
    if (q) {
      q.shadows.enabled = gl.shadowMap.enabled;
      q.shadows.keyCastShadow = key.current?.castShadow ?? false;
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
      <ambientLight ref={ambient} intensity={0} />
      <spotLight
        ref={key}
        intensity={0}
        decay={2}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
        shadow-normalBias={0.001}
      />
      <spotLight ref={fill} intensity={0} decay={2} angle={Math.PI / 2 - 1e-3} penumbra={1} />
      <spotLight ref={rim} intensity={0} decay={2} angle={Math.PI / 2 - 1e-3} penumbra={1} />
      <spotLight ref={bounce} intensity={0} decay={2} angle={Math.PI / 2 - 1e-3} penumbra={1} />
      <StudioSet />
      <ContactShadow poseRef={poseRef} />
      <OfficialDuck poseRef={poseRef} />
    </>
  );
}
