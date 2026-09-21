import calibration from "./poster-camera.json";
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
  /** 0 = cinematic joints; 1 = official simulator DEFAULT_POSE. */
  simulatorBlend?: number;
  lookAt: Vec3;
  camPos: Vec3;
  fov: number;
};
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
export function interval(p: number, start: number, end: number) {
  return smoothstep((p - start) / (end - start));
}
export const CHOREOGRAPHY = {
  cameraStart: 0.06,
  cameraEnd: 0.26,
  crouchStart: 0.26,
  takeoff: 0.34,
  impact: 0.56,
  compressionEnd: 0.64,
  exploded: 0.84,
} as const;

export function poseAtInto(out: Pose, progress: number): Pose {
  const p = clamp01(progress);
  const orbit = interval(p, CHOREOGRAPHY.cameraStart, CHOREOGRAPHY.cameraEnd);
  const inspection = interval(p, CHOREOGRAPHY.impact, 0.92);
  const explosion = interval(p, CHOREOGRAPHY.impact, CHOREOGRAPHY.exploded);
  const flight = clamp01((p - CHOREOGRAPHY.takeoff) / (CHOREOGRAPHY.impact - CHOREOGRAPHY.takeoff));
  const jump = Math.sin(Math.PI * flight) ** 2;
  const squat = Math.sin(Math.PI * clamp01((p - CHOREOGRAPHY.crouchStart) / (CHOREOGRAPHY.takeoff - CHOREOGRAPHY.crouchStart))) ** 2;
  const land = Math.sin(Math.PI * clamp01((p - CHOREOGRAPHY.impact) / (CHOREOGRAPHY.compressionEnd - CHOREOGRAPHY.impact))) ** 2;
  out.duckPosition[0] = calibration.rootPosition[0];
  out.duckPosition[1] = explosion * 0.34;
  out.duckPosition[2] = calibration.rootPosition[2];
  out.duckRotation[0] = -jump * 0.08;
  out.duckRotation[1] = calibration.rootYaw + Math.PI / 2;
  out.duckRotation[2] = 0;
  out.duckScale = calibration.rootScale;
  out.headPitch = calibration.head - jump * 0.12;
  out.headYaw = 0;
  out.neckPitch = calibration.neck + squat * 0.08;
  out.beak = explosion * 0.3;
  out.crouch = squat * 0.7 + land * 0.28;
  out.explode = explosion;
  out.jump = jump;
  out.simulatorBlend = 0;
  out.lookAt[0] = lerp(lerp(calibration.target[0], calibration.rootPosition[0], orbit), 0.096, inspection);
  out.lookAt[1] = lerp(calibration.target[1], 0.16, orbit) + jump * 0.12 + explosion * 0.36;
  out.lookAt[2] = lerp(lerp(calibration.target[2], calibration.rootPosition[2], orbit), -0.06, inspection);
  const azimuth = lerp(0.35, -1.7, inspection);
  const distance = lerp(0.8, 0.95, explosion);
  out.camPos[0] = lerp(calibration.position[0], calibration.rootPosition[0] + Math.sin(azimuth) * distance, orbit);
  out.camPos[1] = lerp(calibration.position[1], 0.21, orbit) + jump * 0.04 - explosion * 0.24;
  out.camPos[2] = lerp(calibration.position[2], calibration.rootPosition[2] + Math.cos(azimuth) * distance, orbit);
  out.fov = lerp(lerp(calibration.verticalFov, 43, orbit), 43, explosion);
  return out;
}

export function poseAt(p: number): Pose {
  return poseAtInto(
    {
      duckPosition: [0, 0, 0],
      duckRotation: [0, 0, 0],
      duckScale: 1,
      headPitch: 0,
      headYaw: 0,
      neckPitch: 0,
      beak: 0,
      crouch: 0,
      explode: 0,
      jump: 0,
      lookAt: [0, 0, 0],
      camPos: [0, 0, 0],
      fov: 32,
    },
    p,
  );
}
export function sectionIndex(p: number) {
  return p < CHOREOGRAPHY.crouchStart ? 0 : p < CHOREOGRAPHY.impact ? 1 : 2;
}
