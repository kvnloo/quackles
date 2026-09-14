import { DEFAULT_POSE, JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import {
  setJoint,
  setJawOpen,
  SITTING_POSE,
} from "@/vendor/microduck-simulator/duck.js";
import type { Pose } from "@/lib/pose";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
// Official three.js rig objects are untyped JS from the simulator.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function driveRig(rig: any, pose: Pose, time: number, reducedMotion: boolean) {
  const walk = reducedMotion ? 0 : pose.walkAmp;
  const speed = pose.skate > 0.5 ? 7.1 : 5.35;
  const phase = time * speed;
  const fold = Math.max(pose.crouch * 0.92, pose.grab * 0.78);
  const d = DEFAULT_POSE as Float32Array;
  const sit = SITTING_POSE as Record<string, number>;

  const hipL = Math.sin(phase) * 0.3 * walk;
  const hipR = Math.sin(phase + Math.PI) * 0.3 * walk;
  const kneeL = (1 - Math.cos(phase)) * 0.38 * walk;
  const kneeR = (1 - Math.cos(phase + Math.PI)) * 0.38 * walk;

  setJoint(rig, JOINT_NAMES[0], d[0] + Math.sin(phase) * 0.07 * walk);
  setJoint(rig, JOINT_NAMES[1], d[1]);
  setJoint(rig, JOINT_NAMES[2], lerp(d[2], sit.left_hip_pitch, fold) + hipL);
  setJoint(rig, JOINT_NAMES[3], lerp(d[3], sit.left_knee, fold) + kneeL);
  setJoint(rig, JOINT_NAMES[4], lerp(d[4], sit.left_ankle, fold) - hipL * 0.4);
  setJoint(rig, JOINT_NAMES[5], lerp(d[5], sit.neck_pitch, fold * 0.45) + (pose.neckPitch - 0.12));
  setJoint(rig, JOINT_NAMES[6], lerp(d[6], sit.head_pitch, fold * 0.4) + (pose.headPitch - 0.22));
  setJoint(rig, JOINT_NAMES[7], pose.headYaw);
  setJoint(rig, JOINT_NAMES[8], d[8] + pose.headYaw * 0.25);
  setJoint(rig, JOINT_NAMES[9], d[9] - Math.sin(phase) * 0.07 * walk);
  setJoint(rig, JOINT_NAMES[10], d[10]);
  setJoint(rig, JOINT_NAMES[11], lerp(d[11], sit.right_hip_pitch, fold) + hipR);
  setJoint(rig, JOINT_NAMES[12], lerp(d[12], sit.right_knee, fold) - kneeR);
  setJoint(rig, JOINT_NAMES[13], lerp(d[13], sit.right_ankle, fold) - hipR * 0.4);
  setJawOpen(rig, Math.min(1, pose.beak));

  const placer = rig.placer;
  placer.rotation.x = pose.recover * 1.42 + pose.duckRotation[0];
  placer.rotation.y = -Math.PI / 2 + pose.duckRotation[1];
  placer.rotation.z = pose.duckRotation[2];
  placer.position.x = pose.duckPosition[0];
  placer.position.y = pose.duckPosition[1] + pose.recover * 0.06 - pose.crouch * 0.018;
  placer.position.z =
    pose.duckPosition[2] + (reducedMotion ? 0 : pose.skate * Math.sin(time * 1.35) * 0.035);
  placer.scale.setScalar(pose.duckScale);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function explodeRig(rig: any, explode: number) {
  if (!rig._rest) {
    rig._rest = new Map();
    for (const [name, body] of rig.bodies) {
      rig._rest.set(name, body.position.clone());
    }
  }
  for (const [name, body] of rig.bodies) {
    const rest = rig._rest.get(name) as {
      clone: () => { lengthSq: () => number; normalize: () => unknown };
    };
    if (!rest) continue;
    if (explode < 0.002) {
      body.position.copy(rest);
      continue;
    }
    const away = rest.clone();
    if (away.lengthSq() < 1e-8) {
      body.position.copy(rest);
      continue;
    }
    away.normalize();
    body.position.copy(rest);
    body.position.addScaledVector(away, explode * 0.058);
  }
}
