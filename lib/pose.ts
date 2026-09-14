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
  lookAt: Vec3;
  camPos: Vec3;
  fov: number;
};

function pose(partial: Partial<Pose>): Pose {
  return {
    duckPosition: [0, 0, 0],
    duckRotation: [0, 0.35, 0],
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
    lookAt: [0.1, 0.82, 0],
    camPos: [1.55, 1.12, 2.55],
    fov: 32,
    ...partial,
  };
}

export const POSES: Pose[] = [
  pose({
    duckRotation: [0, 0.42, 0],
    headPitch: 0.18,
    beak: 0.22,
    camPos: [1.62, 1.18, 2.48],
    lookAt: [0.12, 0.88, 0],
    fov: 30,
  }),
  pose({
    duckRotation: [0, 0.15, 0],
    duckScale: 0.92,
    headPitch: 0.1,
    camPos: [0.35, 1.35, 3.55],
    lookAt: [0, 0.72, 0],
    fov: 34,
  }),
  pose({
    duckRotation: [0, 0.55, 0],
    explode: 1,
    headPitch: 0.05,
    beak: 0.55,
    camPos: [1.85, 1.48, 2.05],
    lookAt: [0, 0.95, 0],
    fov: 32,
  }),
  pose({
    duckRotation: [0, Math.PI / 2 - 0.12, 0],
    walkAmp: 1,
    headPitch: 0.16,
    camPos: [2.55, 0.82, 0.55],
    lookAt: [0, 0.68, 0],
    fov: 36,
  }),
  pose({
    duckRotation: [0, 0.2, 0],
    crouch: 0.85,
    beak: 0.82,
    grab: 1,
    headPitch: 0.55,
    neckPitch: 0.45,
    camPos: [1.35, 0.62, 2.15],
    lookAt: [0, 0.42, 0.15],
    fov: 34,
  }),
  pose({
    duckRotation: [0, 0.1, 0],
    recover: 1,
    crouch: 0.2,
    headPitch: -0.2,
    camPos: [0.55, 1.55, 3.05],
    lookAt: [0, 0.45, 0],
    fov: 38,
  }),
  pose({
    duckRotation: [0, Math.PI / 2 - 0.2, 0],
    skate: 1,
    walkAmp: 0.35,
    headPitch: 0.28,
    neckPitch: 0.18,
    camPos: [2.45, 0.72, 1.15],
    lookAt: [0, 0.58, 0],
    fov: 36,
  }),
  pose({
    duckRotation: [0, 0.2, 0],
    flock: 1,
    duckScale: 0.85,
    camPos: [0, 1.42, 5.4],
    lookAt: [0, 0.72, 0],
    fov: 32,
  }),
  pose({
    duckRotation: [0, 0.38, 0],
    headPitch: 0.14,
    beak: 0.28,
    camPos: [1.48, 1.15, 2.62],
    lookAt: [0.1, 0.86, 0],
    fov: 30,
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
    lookAt: lerpVec(a.lookAt, b.lookAt, s),
    camPos: lerpVec(a.camPos, b.camPos, s),
    fov: lerp(a.fov, b.fov, s),
  };
}

export function poseAt(progress: number): Pose {
  const t = clamp01(progress);
  const max = POSES.length - 1;
  const u = t * max;
  const i = Math.min(max - 1, Math.floor(u));
  return lerpPose(POSES[i], POSES[i + 1], u - i);
}

export function sectionIndex(progress: number) {
  return Math.round(clamp01(progress) * (POSES.length - 1));
}
