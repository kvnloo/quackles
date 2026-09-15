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

// Camera units are metres — the official mesh is the real 25 cm robot.
export const POSES: Pose[] = [
  pose({
    duckPosition: [0.045, -0.102, 0.0],
    duckRotation: [0.04, 0.1, 0.02],
    duckScale: 1.12,
    headPitch: 0.08,
    headYaw: -0.28,
    neckPitch: 0.22,
    beak: 0.04,
    crouch: 0.06,
    walkAmp: 0,
    camPos: [0.58, 0.132, 0.46],
    lookAt: [0.03, 0.088, 0.0],
    fov: 27,
  }),
  pose({
    duckRotation: [0, 0.12, 0],
    duckScale: 0.95,
    headPitch: 0.1,
    camPos: [0.06, 0.32, 0.92],
    lookAt: [0, 0.12, 0],
    fov: 32,
  }),
  pose({
    duckRotation: [0, 0.48, 0],
    explode: 1,
    headPitch: 0.05,
    beak: 0.55,
    camPos: [0.42, 0.26, 0.46],
    lookAt: [0, 0.155, 0],
    fov: 30,
  }),
  pose({
    duckRotation: [0, Math.PI / 2 - 0.18, 0],
    walkAmp: 1,
    headPitch: 0.16,
    camPos: [0.62, 0.13, 0.1],
    lookAt: [0, 0.11, 0],
    fov: 34,
  }),
  pose({
    duckRotation: [0, 0.16, 0],
    crouch: 0.85,
    beak: 0.82,
    grab: 1,
    headPitch: 0.55,
    neckPitch: 0.45,
    camPos: [0.32, 0.09, 0.46],
    lookAt: [0, 0.07, 0.03],
    fov: 32,
  }),
  pose({
    duckRotation: [0, 0.08, 0],
    recover: 1,
    crouch: 0.2,
    headPitch: -0.2,
    camPos: [0.12, 0.3, 0.7],
    lookAt: [0, 0.07, 0],
    fov: 36,
  }),
  pose({
    duckRotation: [0, Math.PI / 2 - 0.22, 0],
    skate: 1,
    walkAmp: 0.35,
    headPitch: 0.28,
    neckPitch: 0.18,
    camPos: [0.56, 0.11, 0.26],
    lookAt: [0, 0.1, 0],
    fov: 34,
  }),
  pose({
    duckRotation: [0, 0.16, 0],
    flock: 1,
    duckScale: 0.92,
    camPos: [0, 0.26, 1.05],
    lookAt: [0, 0.12, 0],
    fov: 30,
  }),
  pose({
    duckRotation: [0, 0.28, 0],
    play: 0.55,
    camPos: [0.34, 0.2, 0.52],
    lookAt: [0.04, 0.13, 0],
    fov: 32,
  }),
  pose({
    duckRotation: [0, 0.22, 0],
    play: 1,
    beak: 0.2,
    camPos: [0.28, 0.18, 0.42],
    lookAt: [0.06, 0.12, 0],
    fov: 34,
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
    play: lerp(a.play, b.play, s),
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
