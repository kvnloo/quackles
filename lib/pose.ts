export type Vec3 = [number, number, number];

export type Pose = {
  duckPosition: Vec3;
  duckRotation: Vec3;
  duckScale: number;
  headPitch: number;
  headYaw: number;
  neckPitch: number;
  beak: number;
  crouch: number;
  explode: number;
  jump: number;
  lookAt: Vec3;
  camPos: Vec3;
  fov: number;
};

function pose(partial: Partial<Pose>): Pose {
  return {
    duckPosition: [0, 0, 0],
    duckRotation: [0, 0.48, 0],
    duckScale: 1,
    headPitch: 0.1,
    headYaw: -0.28,
    neckPitch: 0.22,
    beak: 0.06,
    crouch: 0.04,
    explode: 0,
    jump: 0,
    lookAt: [0.03, 0.125, 0],
    camPos: [0.4, 0.17, 0.62],
    fov: 28,
    ...partial,
  };
}

/** Product still → explode → jump. Three keys, one scroll. */
export const POSES: Pose[] = [
  pose({
    duckPosition: [0.04, 0, 0.01],
    duckRotation: [0.03, 0.62, 0.03],
    duckScale: 1,
    headPitch: 0.08,
    headYaw: -0.32,
    neckPitch: 0.26,
    beak: 0.04,
    crouch: 0.03,
    camPos: [0.4, 0.155, 0.66],
    lookAt: [0.04, 0.118, 0.01],
    fov: 27,
  }),
  pose({
    duckPosition: [0.01, 0.012, 0],
    duckRotation: [0, 0.38, 0],
    explode: 1,
    beak: 0.62,
    headPitch: 0.04,
    neckPitch: 0.12,
    camPos: [0.34, 0.26, 0.78],
    lookAt: [0, 0.155, 0],
    fov: 34,
  }),
  pose({
    duckPosition: [0.02, 0.018, 0],
    duckRotation: [-0.06, 0.52, 0.02],
    jump: 1,
    crouch: 0,
    beak: 0.12,
    headPitch: 0.16,
    neckPitch: 0.2,
    camPos: [0.46, 0.1, 0.58],
    lookAt: [0.02, 0.2, 0],
    fov: 31,
  }),
  pose({
    duckPosition: [0.04, 0, 0.01],
    duckRotation: [0.03, 0.55, 0.03],
    jump: 0,
    camPos: [0.38, 0.16, 0.62],
    lookAt: [0.03, 0.12, 0.01],
    fov: 28,
  }),
];

export function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function lerpVecInto(out: Vec3, a: Vec3, b: Vec3, t: number) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
}

export function poseAtInto(out: Pose, progress: number): Pose {
  const t = clamp01(progress);
  const max = POSES.length - 1;
  const u = t * max;
  const i = Math.min(max - 1, Math.floor(u));
  const s = smoothstep(u - i);
  const a = POSES[i];
  const b = POSES[i + 1];
  lerpVecInto(out.duckPosition, a.duckPosition, b.duckPosition, s);
  lerpVecInto(out.duckRotation, a.duckRotation, b.duckRotation, s);
  out.duckScale = lerp(a.duckScale, b.duckScale, s);
  out.headPitch = lerp(a.headPitch, b.headPitch, s);
  out.headYaw = lerp(a.headYaw, b.headYaw, s);
  out.neckPitch = lerp(a.neckPitch, b.neckPitch, s);
  out.beak = lerp(a.beak, b.beak, s);
  out.crouch = lerp(a.crouch, b.crouch, s);
  out.explode = lerp(a.explode, b.explode, s);
  out.jump = lerp(a.jump, b.jump, s);
  lerpVecInto(out.lookAt, a.lookAt, b.lookAt, s);
  lerpVecInto(out.camPos, a.camPos, b.camPos, s);
  out.fov = lerp(a.fov, b.fov, s);
  return out;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const s = smoothstep(t);
  return {
    duckPosition: lerpVec(a.duckPosition, b.duckPosition, s),
    duckRotation: lerpVec(a.duckRotation, b.duckRotation, s),
    duckScale: lerp(a.duckScale, b.duckScale, s),
    headPitch: lerp(a.headPitch, b.headPitch, s),
    headYaw: lerp(a.headYaw, b.headYaw, s),
    neckPitch: lerp(a.neckPitch, b.neckPitch, s),
    beak: lerp(a.beak, b.beak, s),
    crouch: lerp(a.crouch, b.crouch, s),
    explode: lerp(a.explode, b.explode, s),
    jump: lerp(a.jump, b.jump, s),
    lookAt: lerpVec(a.lookAt, b.lookAt, s),
    camPos: lerpVec(a.camPos, b.camPos, s),
    fov: lerp(a.fov, b.fov, s),
  };
}

export function poseAt(progress: number): Pose {
  return poseAtInto(pose({}), progress);
}

export function sectionIndex(progress: number) {
  return Math.round(clamp01(progress) * (POSES.length - 1));
}
