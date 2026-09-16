"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { Group, Mesh, MeshStandardMaterial } from "three";
import type { Pose } from "@/lib/pose";
import {
  auditFeet,
  driveRig,
  isRig,
  prepareRig,
  type Rig,
} from "@/lib/sim/drive";
import { ensureProbe } from "@/lib/probe";
import {
  auditRenderBatches,
  prepareRigForRendering,
} from "@/lib/sim/render-rig";
import {
  buildRig,
  loadKinematics,
  MODEL_DIR,
} from "@/vendor/microduck-simulator/duck.js";
import { useExperience } from "@/components/providers/ExperienceProvider";
const shell = { color: [0.71, 0.68, 0.61], roughness: 0.46, metalness: 0.02 };
const dark = { color: [0.015, 0.017, 0.02], roughness: 0.39, metalness: 0.2 };
const metal = { color: [0.25, 0.27, 0.29], roughness: 0.31, metalness: 0.78 };
function materialForMesh(name: string) {
  if (name === "noenoeil.stl") return shell;
  if (name === "lens.stl")
    return {
      color: [0.008, 0.015, 0.025],
      roughness: 0.09,
      metalness: 0.2,
      clearcoat: 0.6,
    };
  if (name === "bottom_head_shell.stl") return dark;
  if (
    /head_shell|left_shell|right_shell|upper_leg|foot|ankle|eye_ring/.test(name)
  )
    return shell;
  if (/bracket|bearing|horn|holder|support/.test(name)) return metal;
  return dark;
}
export function OfficialDuck({
  poseRef,
}: {
  poseRef: {
    current: Pose;
  };
}) {
  const host = useRef<Group>(null),
    rigRef = useRef<{
      rig: Rig;
      prepared: ReturnType<typeof prepareRig>;
    } | null>(null);
  const { gl, scene, camera, invalidate } = useThree();
  const { setReady, setWebgl } = useExperience();
  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;
    let activeRig: Rig | null = null;
    async function load() {
      try {
        const kinematics = await loadKinematics(`${MODEL_DIR}/kinematics.json`);
        const rig = await buildRig(kinematics, { materialForMesh });
        if (!isRig(rig)) throw new Error("Invalid Microduck hierarchy");
        if (cancelled) return;
        prepareRigForRendering(rig);
        activeRig = rig;
        group!.add(rig.placer);
        const prepared = prepareRig(rig);
        rigRef.current = { rig, prepared };
        window.__QUACKLES_AUDIT__ = () => ({
          ...auditFeet(rig, prepared),
          batchGeometry: auditRenderBatches(rig),
        });
        driveRig(rig, poseRef.current, prepared);
        await gl.compileAsync(scene, camera);
        if (cancelled) return;
        const q = ensureProbe();
        if (q) {
          q.rigReady = true;
          q.rigLoaded = true;
          q.ready = true;
        }
        setReady(true);
        invalidate();
      } catch (error) {
        if (!cancelled) {
          console.error("Microduck model load failed", error);
          setWebgl(false);
          setReady(true);
        }
      }
    }
    void load();
    return () => {
      delete window.__QUACKLES_AUDIT__;
      cancelled = true;
      rigRef.current = null;
      if (activeRig) {
        group.remove(activeRig.placer);
        const materials = new Set<MeshStandardMaterial>();
        activeRig.root.traverse((node) => {
          if (
            node instanceof Mesh &&
            node.material instanceof MeshStandardMaterial
          )
            materials.add(node.material);
          if (node instanceof Mesh && node.userData.mergedForRendering)
            node.geometry.dispose();
        });
        materials.forEach((material) => material.dispose());
      }
    };
  }, [camera, gl, invalidate, poseRef, scene, setReady, setWebgl]);
  useFrame(() => {
    const active = rigRef.current;
    if (!active) return;
    const feetMinY = driveRig(active.rig, poseRef.current, active.prepared);
    const q = ensureProbe();
    if (q) {
      q.feetMinY = feetMinY;
      q.renderedProgress = q.progress;
      q.renderedAt = performance.now();
      const p = active.rig.placer.position;
      q.rootPosition[0] = p.x;
      q.rootPosition[1] = p.y;
      q.rootPosition[2] = p.z;
    }
  }, -1);
  return <group ref={host} />;
}
