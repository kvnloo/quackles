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
  walkAmp: number;
  recover: number;
  skate: number;
  flock: number;
  grab: number;
  play: number;
  lookAt: Vec3;
  camPos: Vec3;
  fov: number;
};

function pose(partial: Partial<Pose>): Pose {
  return {
    duckPosition: [0, 0, 0],
    duckRotation: [0, 0.28, 0],
    duckScale: 1,
    headPitch: 0.22,
    headYaw: 0,
    neckPitch: 0.12,
    beak: 0.18,
    crouch: 0.08,
    explode: 0,
    walkAmp: 0,
    recover: 0,
    skate: 0,
    flock: 0,
    grab: 0,
    play: 0,
    lookAt: [0.03, 0.14, 0],
    camPos: [0.38, 0.2, 0.52],
    fov: 30,
    ...partial,
  };
}

/** Hero product shot → anatomy explode → fallen → get-up stand. */
export const POSES: Pose[] = [
  pose({
    duckPosition: [0.05, -0.008, 0.02],
    duckRotation: [0.05, 1.05, 0.04],
    duckScale: 1.02,
    headPitch: 0.06,
    headYaw: -0.55,
    neckPitch: 0.3,
    beak: 0.04,
    crouch: 0.02,
    camPos: [0.4, 0.21, 0.42],
    lookAt: [0.05, 0.15, 0.02],
    fov: 30,
  }),
  pose({
    duckRotation: [0, 0.42, 0],
    explode: 1,
    headPitch: 0.04,
    beak: 0.5,
    camPos: [0.36, 0.28, 0.58],
    lookAt: [0, 0.16, 0],
    fov: 32,
  }),
  pose({
    duckRotation: [0.12, 0.18, 0],
    recover: 1,
    crouch: 0.12,
    headPitch: -0.18,
    camPos: [0.16, 0.24, 0.66],
    lookAt: [0, 0.08, 0],
    fov: 34,
  }),
  pose({
    duckRotation: [0, 0.38, 0],
    duckScale: 1,
    headPitch: 0.08,
    camPos: [0.34, 0.2, 0.5],
    lookAt: [0.02, 0.13, 0],
    fov: 32,
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
  out.walkAmp = lerp(a.walkAmp, b.walkAmp, s);
  out.recover = lerp(a.recover, b.recover, s);
  out.skate = lerp(a.skate, b.skate, s);
  out.flock = lerp(a.flock, b.flock, s);
  out.grab = lerp(a.grab, b.grab, s);
  out.play = lerp(a.play, b.play, s);
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
    walkAmp: lerp(a.walkAmp, b.walkAmp, s),
    recover: lerp(a.recover, b.recover, s),
    skate: lerp(a.skate, b.skate, s),
    flock: lerp(a.flock, b.flock, s),
    grab: lerp(a.grab, b.grab, s),
    play: lerp(a.play, b.play, s),
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
