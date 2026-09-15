import { Vector3 } from "three";
import { DEFAULT_POSE, JOINT_NAMES } from "@/vendor/microduck-simulator/constants.js";
import { setJoint, setJawOpen, SITTING_POSE } from "@/vendor/microduck-simulator/duck.js";
import type { Pose } from "@/lib/pose";

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

const _away = new Vector3();

// Official three.js rig objects are untyped JS from the simulator.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function driveRig(rig: any, pose: Pose, time: number, reducedMotion: boolean) {
  const hop = pose.jump;
  const fold = pose.crouch * (1 - hop);
  const d = DEFAULT_POSE as Float32Array;
  const sit = SITTING_POSE as Record<string, number>;

  const stand = Math.max(0, 1 - fold + hop * 0.45);
  const hipPitchL = lerp(d[2], -0.22, stand);
  const hipPitchR = lerp(d[11], 0.22, stand);
  const kneeL0 = lerp(d[3], 0.18, stand);
  const kneeR0 = lerp(d[12], -0.18, stand);
  const ankleL0 = lerp(d[4], -0.08, stand);
  const ankleR0 = lerp(d[13], 0.08, stand);

  const kick = hop * 0.48;
  const phase = reducedMotion ? 0 : time * 6.2 * hop;

  setJoint(rig, JOINT_NAMES[0], d[0]);
  setJoint(rig, JOINT_NAMES[1], d[1]);
  setJoint(rig, JOINT_NAMES[2], lerp(hipPitchL, sit.left_hip_pitch, fold) - kick);
  setJoint(rig, JOINT_NAMES[3], lerp(kneeL0, sit.left_knee, fold) + Math.sin(phase) * 0.14 * hop);
  setJoint(rig, JOINT_NAMES[4], lerp(ankleL0, sit.left_ankle, fold));
  const breathe = reducedMotion ? 0 : Math.sin(time * 1.15) * 0.012 * (1 - hop);
  setJoint(
    rig,
    JOINT_NAMES[5],
    lerp(d[5], sit.neck_pitch, fold * 0.45) + (pose.neckPitch - 0.12) + breathe,
  );
  setJoint(rig, JOINT_NAMES[6], lerp(d[6], sit.head_pitch, fold * 0.4) + (pose.headPitch - 0.22));
  setJoint(rig, JOINT_NAMES[7], pose.headYaw);
  setJoint(rig, JOINT_NAMES[8], d[8] + pose.headYaw * 0.25);
  setJoint(rig, JOINT_NAMES[9], d[9]);
  setJoint(rig, JOINT_NAMES[10], d[10]);
  setJoint(rig, JOINT_NAMES[11], lerp(hipPitchR, sit.right_hip_pitch, fold) + kick * 0.85);
  setJoint(rig, JOINT_NAMES[12], lerp(kneeR0, sit.right_knee, fold) - Math.sin(phase + 0.6) * 0.12 * hop);
  setJoint(rig, JOINT_NAMES[13], lerp(ankleR0, sit.right_ankle, fold));
  setJawOpen(rig, Math.min(1, pose.beak));

  const placer = rig.placer;
  placer.rotation.x = pose.duckRotation[0] - hop * 0.12;
  placer.rotation.y = -Math.PI / 2 + pose.duckRotation[1];
  placer.rotation.z = pose.duckRotation[2];
  placer.position.x = pose.duckPosition[0];
  placer.position.y = pose.duckPosition[1] + hop * 0.22 - pose.crouch * 0.016;
  placer.position.z = pose.duckPosition[2];
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
    const rest = rig._rest.get(name);
    if (!rest) continue;
    if (explode < 0.002) {
      body.position.copy(rest);
      continue;
    }
    _away.copy(rest);
    if (_away.lengthSq() < 1e-8) {
      body.position.copy(rest);
      continue;
    }
    _away.normalize();
    body.position.copy(rest);
    body.position.addScaledVector(_away, explode * 0.062);
  }
}
