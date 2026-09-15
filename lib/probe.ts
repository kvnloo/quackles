import type { Pose } from "@/lib/pose";

export type FrameSample = {
  t: number;
  dt: number;
  fps: number;
  progress: number;
  explode: number;
  jump: number;
  source: "webgl";
};

export type QuacklesProbe = {
  ready: boolean;
  rigReady: boolean;
  progress: number;
  explode: number;
  jump: number;
  glFrames: FrameSample[];
};

declare global {
  interface Window {
    __QUACKLES__?: QuacklesProbe;
    __QUACKLES_RECORD__?: boolean;
    __QUACKLES_INVALIDATE__?: () => void;
    __QUACKLES_LENIS_FROM_R3F__?: boolean;
  }
}

export function ensureProbe(): QuacklesProbe | null {
  if (typeof window === "undefined") return null;
  if (!window.__QUACKLES__) {
    window.__QUACKLES__ = {
      ready: false,
      rigReady: false,
      progress: 0,
      explode: 0,
      jump: 0,
      glFrames: [],
    };
  }
  return window.__QUACKLES__;
}

export function publishPose(progress: number, pose: Pose) {
  const q = ensureProbe();
  if (!q) return;
  q.progress = progress;
  q.explode = pose.explode;
  q.jump = pose.jump;
}

export function pushGlFrame(deltaSec: number, progress: number, pose: Pose) {
  const q = ensureProbe();
  if (!q || typeof window === "undefined" || !window.__QUACKLES_RECORD__) return;
  if (q.glFrames.length >= 4000) return;
  const dt = deltaSec * 1000;
  q.glFrames.push({
    t: performance.now(),
    dt,
    fps: dt > 0 ? 1000 / dt : 0,
    progress,
    explode: pose.explode,
    jump: pose.jump,
    source: "webgl",
  });
}
