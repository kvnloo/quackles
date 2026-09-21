import {
  clamp01,
  lerp,
  poseAt,
  poseAtInto,
  smoothstep,
  type Pose,
} from "@/lib/pose";

export type DesktopPhase =
  | "inspect"
  | "jump"
  | "explode"
  | "reassemble"
  | "sim-ready";

export const DESKTOP_EXPERIENCE = {
  nearZoom: 0.72,
  farZoom: 1.42,
  initialZoom: 1,
  wheelSensitivity: 0.00115,
  launchThreshold: 320,
  farTolerance: 0.025,
  jumpMs: 1120,
  explodeMs: 980,
  reassembleMs: 1050,
} as const;

const exploded = poseAt(0.84);
const assembled = poseAt(0);

function copyVec(out: [number, number, number], value: [number, number, number]) {
  out[0] = value[0];
  out[1] = value[1];
  out[2] = value[2];
}

function blendVec(
  out: [number, number, number],
  a: [number, number, number],
  b: [number, number, number],
  t: number,
) {
  out[0] = lerp(a[0], b[0], t);
  out[1] = lerp(a[1], b[1], t);
  out[2] = lerp(a[2], b[2], t);
}

export function copyPoseInto(out: Pose, source: Pose) {
  copyVec(out.duckPosition, source.duckPosition);
  copyVec(out.duckRotation, source.duckRotation);
  out.duckScale = source.duckScale;
  out.headPitch = source.headPitch;
  out.headYaw = source.headYaw;
  out.neckPitch = source.neckPitch;
  out.beak = source.beak;
  out.crouch = source.crouch;
  out.explode = source.explode;
  out.jump = source.jump;
  copyVec(out.lookAt, source.lookAt);
  copyVec(out.camPos, source.camPos);
  out.fov = source.fov;
  return out;
}

export function blendPoseInto(out: Pose, a: Pose, b: Pose, progress: number) {
  const t = smoothstep(progress);
  blendVec(out.duckPosition, a.duckPosition, b.duckPosition, t);
  blendVec(out.duckRotation, a.duckRotation, b.duckRotation, t);
  out.duckScale = lerp(a.duckScale, b.duckScale, t);
  out.headPitch = lerp(a.headPitch, b.headPitch, t);
  out.headYaw = lerp(a.headYaw, b.headYaw, t);
  out.neckPitch = lerp(a.neckPitch, b.neckPitch, t);
  out.beak = lerp(a.beak, b.beak, t);
  out.crouch = lerp(a.crouch, b.crouch, t);
  out.explode = lerp(a.explode, b.explode, t);
  out.jump = lerp(a.jump, b.jump, t);
  blendVec(out.lookAt, a.lookAt, b.lookAt, t);
  blendVec(out.camPos, a.camPos, b.camPos, t);
  out.fov = lerp(a.fov, b.fov, t);
  return out;
}

export function inspectPoseInto(out: Pose, zoom: number) {
  poseAtInto(out, 0);
  const scale = Math.max(
    DESKTOP_EXPERIENCE.nearZoom,
    Math.min(DESKTOP_EXPERIENCE.farZoom, zoom),
  );
  for (let i = 0; i < 3; i++) {
    out.camPos[i] =
      out.lookAt[i] + (out.camPos[i] - out.lookAt[i]) * scale;
  }
  const normalized = clamp01(
    (scale - DESKTOP_EXPERIENCE.nearZoom) /
      (DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.nearZoom),
  );
  out.fov = lerp(29, 37, normalized);
  return out;
}

export function cinematicPoseInto(
  out: Pose,
  phase: Exclude<DesktopPhase, "inspect" | "sim-ready">,
  progress: number,
) {
  const t = clamp01(progress);
  if (phase === "jump") {
    return poseAtInto(out, lerp(0.26, 0.56, smoothstep(t)));
  }
  if (phase === "explode") {
    const authored = t < 0.86 ? t / 0.86 : 1;
    return poseAtInto(out, lerp(0.56, 0.84, smoothstep(authored)));
  }
  return blendPoseInto(out, exploded, assembled, t);
}

export function assembledPoseInto(out: Pose) {
  copyPoseInto(out, assembled);
  return out;
}

export function probeProgress(
  phase: DesktopPhase,
  progress: number,
  zoom: number,
) {
  const t = clamp01(progress);
  if (phase === "inspect") {
    return (
      0.06 +
      clamp01(
        (zoom - DESKTOP_EXPERIENCE.nearZoom) /
          (DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.nearZoom),
      ) *
        0.18
    );
  }
  if (phase === "jump") return lerp(0.26, 0.56, t);
  if (phase === "explode") return lerp(0.56, 0.84, t);
  if (phase === "reassemble") return lerp(0.84, 1, t);
  return 1;
}

export function normalizeWheelDelta(
  deltaY: number,
  deltaMode: number,
  viewportHeight: number,
) {
  if (deltaMode === 1) return deltaY * 16;
  if (deltaMode === 2) return deltaY * viewportHeight;
  return deltaY;
}
