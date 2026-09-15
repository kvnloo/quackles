"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group } from "three";
import type { ColorwayId } from "@/lib/colorways";
import { COLORWAY_TO_VARIANT, COLORWAYS } from "@/lib/colorways";
import type { Pose } from "@/lib/pose";
import { driveRig, explodeRig } from "@/lib/sim/drive";
import {
  applyPose,
  buildRig,
  cloneRig,
  groundFullBody,
  loadKinematics,
  MODEL_DIR,
} from "@/vendor/microduck-simulator/duck.js";
import { DEFAULT_POSE, JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import {
  applyVariant,
  materialHookFor,
  VARIANTS,
} from "@/vendor/microduck-simulator/variants.js";

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
// Upright 3/4 poster stance — less MJCF squat, neck leaning toward the headline.
STANDING.left_hip_pitch = -0.16;
STANDING.right_hip_pitch = 0.16;
STANDING.left_knee = 0.28;
STANDING.right_knee = -0.28;
STANDING.left_ankle = -0.12;
STANDING.right_ankle = 0.12;
STANDING.neck_pitch = 0.28;
STANDING.head_pitch = 0.14;
STANDING.head_yaw = -0.18;

async function makeRig(variant: string) {
  const kinematics = await loadKinematics(`${MODEL_DIR}/kinematics.json`);
  const rig = (await buildRig(kinematics, {
    materialForMesh: materialHookFor(VARIANTS[variant] ?? VARIANTS.classic),
  })) as Rig;
  applyPose(rig, STANDING);
  groundFullBody(rig);
  return rig;
}

export function OfficialDuck({
  poseRef,
  colorway,
  reducedMotion,
  phaseOffset = 0,
}: {
  poseRef: { current: Pose };
  colorway: ColorwayId;
  reducedMotion: boolean;
  phaseOffset?: number;
}) {
  const host = useRef<Group>(null);
  const rigRef = useRef<Rig | null>(null);
  const colorwayRef = useRef(colorway);
  colorwayRef.current = colorway;
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;

    makeRig(COLORWAY_TO_VARIANT[colorwayRef.current])
      .then((rig) => {
        if (cancelled || !host.current) return;
        applyVariant(rig, COLORWAY_TO_VARIANT[colorwayRef.current]);
        host.current.add(rig.placer as never);
        rigRef.current = rig;
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

  useEffect(() => {
    const rig = rigRef.current;
    if (!rig) return;
    applyVariant(rig, COLORWAY_TO_VARIANT[colorway]);
  }, [colorway]);

  useFrame(({ clock }) => {
    const rig = rigRef.current;
    if (!rig) return;
    const p = poseRef.current;
    explodeRig(rig, p.explode);
    driveRig(rig, p, clock.elapsedTime + phaseOffset, reducedMotion);
  });

  if (failed) return null;
  return <group ref={host} />;
}

export function OfficialFlock({
  poseRef,
  reducedMotion,
}: {
  poseRef: { current: Pose };
  reducedMotion: boolean;
}) {
  const host = useRef<Group>(null);
  const rigs = useRef<Rig[]>([]);

  useEffect(() => {
    const group = host.current;
    if (!group) return;
    let cancelled = false;

    (async () => {
      const source = await makeRig("classic");
      if (cancelled || !host.current) return;
      const built: Rig[] = [];
      COLORWAYS.forEach((c, i) => {
        const clone = (i === 0 ? source : cloneRig(source)) as Rig;
        applyVariant(clone, COLORWAY_TO_VARIANT[c.id]);
        applyPose(clone, STANDING);
        host.current?.add(clone.placer as never);
        built.push(clone);
      });
      rigs.current = built;
    })().catch((err) => console.warn("flock rig failed", err));

    return () => {
      cancelled = true;
      rigs.current = [];
      if (group) {
        while (group.children.length) group.remove(group.children[0]);
      }
    };
  }, []);

  useFrame(({ clock }) => {
    const p = poseRef.current;
    const flock = p.flock;
    rigs.current.forEach((rig, i) => {
      const idle = {
        ...p,
        explode: 0,
        walkAmp: reducedMotion ? 0 : 0.1,
        recover: 0,
        skate: 0,
        grab: 0,
        crouch: 0.05,
        flock: 0,
        duckPosition: [(i - 1.5) * 0.2 * flock, 0, 0] as [number, number, number],
        duckRotation: [0, 0.18, 0] as [number, number, number],
        duckScale: Math.max(0.001, flock),
      };
      driveRig(rig, idle, clock.elapsedTime + i * 0.37, reducedMotion);
    });
  });

  return <group ref={host} />;
}
