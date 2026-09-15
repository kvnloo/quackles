"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group, MeshPhysicalMaterial } from "three";
import type { Pose } from "@/lib/pose";
import { driveRig, explodeRig } from "@/lib/sim/drive";
import { ensureProbe } from "@/lib/probe";
import {
  applyPose,
  buildRig,
  groundFullBody,
  loadKinematics,
  MODEL_DIR,
} from "@/vendor/microduck-simulator/duck.js";
import { DEFAULT_POSE, JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import { applyVariant, materialHookFor, VARIANTS } from "@/vendor/microduck-simulator/variants.js";

type Spec = {
  color: number[];
  roughness: number;
  metalness: number;
  clearcoat?: number;
  clearcoatRoughness?: number;
  envMapIntensity?: number;
};

type Rig = {
  placer: object;
  root?: { traverse: (fn: (o: unknown) => void) => void };
  bodies: Map<
    string,
    {
      position: {
        clone: () => unknown;
        copy: (v: unknown) => void;
        addScaledVector: (v: unknown, s: number) => void;
      };
    }
  >;
  joints: Map<string, unknown>;
};

const STANDING: Record<string, number> = {};
JOINT_NAMES.forEach((name: string, i: number) => {
  STANDING[name] = (DEFAULT_POSE as Float32Array)[i];
});
STANDING.left_hip_pitch = -0.18;
STANDING.right_hip_pitch = 0.18;
STANDING.left_knee = 0.26;
STANDING.right_knee = -0.26;
STANDING.left_ankle = -0.12;
STANDING.right_ankle = 0.12;
STANDING.neck_pitch = 0.42;
STANDING.head_pitch = 0.16;
STANDING.head_yaw = -0.32;

/** Official classic: cream shells, graphite legs/face, amber pads. */
const CREAM: Spec = {
  color: [0.78, 0.73, 0.64],
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0.28,
  clearcoatRoughness: 0.42,
  envMapIntensity: 1.2,
};
const GRAPHITE: Spec = {
  color: [0.028, 0.028, 0.032],
  roughness: 0.4,
  metalness: 0.18,
  clearcoat: 0.2,
  clearcoatRoughness: 0.26,
  envMapIntensity: 1.05,
};
const AMBER: Spec = {
  color: [0.847, 0.339, 0.022],
  roughness: 0.42,
  metalness: 0,
  envMapIntensity: 1.1,
};

const HQ_CLASSIC = {
  ...VARIANTS.classic,
  headDome: CREAM,
  trim: CREAM,
  bodyShell: CREAM,
  sideShells: CREAM,
  feet: CREAM,
  facePlate: GRAPHITE,
  eyeRing: GRAPHITE,
  legShells: GRAPHITE,
  soles: AMBER,
};

function polishMaterials(rig: Rig) {
  rig.root?.traverse((node) => {
    const mesh = node as { isMesh?: boolean; material?: MeshPhysicalMaterial };
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material.envMapIntensity = Math.max(mesh.material.envMapIntensity ?? 0.7, 1.12);
    mesh.material.needsUpdate = true;
  });
}

async function makeRig() {
  const kinematics = await loadKinematics(`${MODEL_DIR}/kinematics.json`);
  const rig = (await buildRig(kinematics, {
    materialForMesh: materialHookFor(HQ_CLASSIC),
  })) as Rig;
  applyPose(rig, STANDING);
  groundFullBody(rig);
  applyVariant(rig, HQ_CLASSIC);
  polishMaterials(rig);
  return rig;
}

export function OfficialDuck({
  poseRef,
  reducedMotion,
}: {
  poseRef: { current: Pose };
  reducedMotion: boolean;
}) {
  const host = useRef<Group>(null);
  const rigRef = useRef<Rig | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;

    makeRig()
      .then((rig) => {
        if (cancelled || !host.current) return;
        host.current.add(rig.placer as never);
        rigRef.current = rig;
        const q = ensureProbe();
        if (q) q.rigReady = true;
      })
      .catch((err) => {
        console.warn("official microduck rig failed", err);
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      rigRef.current = null;
      if (group) {
        while (group.children.length) group.remove(group.children[0]);
      }
    };
  }, []);

  useFrame(({ clock }) => {
    const rig = rigRef.current;
    if (!rig) return;
    const p = poseRef.current;
    explodeRig(rig, p.explode);
    driveRig(rig, p, clock.elapsedTime, reducedMotion);
  });

  if (failed) return null;
  return <group ref={host} />;
}
