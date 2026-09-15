"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
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

type Rig = {
  placer: object;
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

async function makeRig() {
  const kinematics = await loadKinematics(`${MODEL_DIR}/kinematics.json`);
  const rig = (await buildRig(kinematics, {
    materialForMesh: materialHookFor(VARIANTS.classic),
  })) as Rig;
  applyPose(rig, STANDING);
  groundFullBody(rig);
  applyVariant(rig, "classic");
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
        window.__QUACKLES_INVALIDATE__?.();
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
