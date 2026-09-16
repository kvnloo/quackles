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
export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export function smoothstep(t: number) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}
export function interval(p: number, start: number, end: number) {
  return smoothstep((p - start) / (end - start));
}
export function sceneMix(p: number) {
  return interval(p, 0.06, 0.2);
}
export function poseAtInto(out: Pose, progress: number): Pose {
  const p = clamp01(progress);
  const enter = interval(p, 0.16, 0.3);
  const explosion = interval(p, 0.18, 0.38) * (1 - interval(p, 0.44, 0.58));
  const flight = clamp01((p - 0.7) / 0.21);
  const jump = Math.sin(Math.PI * flight) ** 2;
  const squat = Math.sin(Math.PI * clamp01((p - 0.62) / 0.08)) ** 2;
  const land = Math.sin(Math.PI * clamp01((p - 0.91) / 0.06)) ** 2;
  out.duckPosition[0] = lerp(0.085, 0, enter);
  out.duckPosition[1] = 0;
  out.duckPosition[2] = 0;
  out.duckRotation[0] = -jump * 0.08;
  out.duckRotation[1] = lerp(-0.28, -0.3, enter);
  out.duckRotation[2] = 0;
  out.duckScale = 1;
  out.headPitch = 0.29 - jump * 0.12;
  out.headYaw = -0.12;
  out.neckPitch = 0.1 + squat * 0.08;
  out.beak = explosion * 0.3;
  out.crouch = squat * 0.7 + land * 0.28;
  out.explode = explosion;
  out.jump = jump;
  out.lookAt[0] = lerp(0.02, 0, enter);
  out.lookAt[1] =
    lerp(0.16, 0.18, enter) + explosion * 0.08 - interval(p, 0.94, 1) * 0.055;
  out.lookAt[2] = 0;
  out.camPos[0] = lerp(0.49, 0.44, enter);
  out.camPos[1] = lerp(0.23, 0.28, enter);
  out.camPos[2] = lerp(0.88, 0.94, enter) + explosion * 0.2;
  out.fov = 32;
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
  return p < 0.18 ? 0 : p < 0.62 ? 1 : 2;
}
