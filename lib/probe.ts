import { CHOREOGRAPHY, type Pose } from "@/lib/pose";
import type { applyRobotSurfaces } from "@/lib/sim/robot-surfaces";
import type { auditBounds } from "@/lib/scene-audit";
import type { auditFeet } from "@/lib/sim/drive";
import type { auditRenderBatches } from "@/lib/sim/render-rig";
type RigAudit = ReturnType<typeof auditFeet> & {
  robotSurfaces: ReturnType<Awaited<ReturnType<typeof applyRobotSurfaces>>["getAudit"]>;
  duckBounds: ReturnType<typeof auditBounds>;
  support: { group: "set_robot_plinth"; topY: number; contact: boolean };
  batchGeometry: ReturnType<typeof auditRenderBatches>;
};
export type SetAudit = {
  sceneId: string;
  viewport: { left: number; top: number; width: number; height: number };
  camera: { position: number[]; worldMatrix: number[] };
  theme: number;
  groups: Array<ReturnType<typeof auditBounds> & {
    name: string; id: string; visible: boolean; worldMatrix: number[];
    shadowCastingMeshCount: number;
    shadowReceivingMeshCount: number;
    shadowMeshes: Array<{ name: string; castShadow: boolean; receiveShadow: boolean; visible: boolean }>;
    materialOpacities: Array<{ name: string; opacity: number; transparent: boolean }>;
  }>;
};
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
  rigLoaded: boolean;
  robotTheme: number | null;
  setTheme: number | null;
  setReady: boolean;
  phase: "poster" | "camera" | "crouch" | "flight" | "landing" | "explode" | "inspection";
  renderCount: number;
  renderedProgress: number;
  renderedAt: number;
  progress: number;
  explode: number;
  jump: number;
  glFrames: FrameSample[];
  renderedFrames: number;
  reducedMotion: boolean;
  rootPosition: number[];
  feetMinY: number;
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
    dpr: number;
  };
};
export type QuacklesDebug = {
  setProgress: (progress: number) => void;
  getState: () => QuacklesProbe | null;
  getAuditState: () => RigAudit | null;
  getSetAudit: () => SetAudit | null;
  prepareAudit: () => Promise<void>;
  getThemeAudit: () => { target: number; current: number; robot: number | null; set: number | null };
  failCanvas: () => void;
};
declare global {
  interface Window {
    __QUACKLES__?: QuacklesProbe;
    __QUACKLES_DEBUG__?: QuacklesDebug;
    __QUACKLES_RECORD__?: boolean;
    __QUACKLES_INVALIDATE__?: () => void;
    __QUACKLES_AUDIT__?: () => RigAudit;
    __QUACKLES_PREPARE_AUDIT__?: () => Promise<void>;
    __QUACKLES_FAIL_CANVAS__?: () => void;
    __QUACKLES_SET_AUDIT__?: () => SetAudit;
  }
}
export function ensureProbe(): QuacklesProbe | null {
  if (typeof window === "undefined") return null;
  return (window.__QUACKLES__ ??= {
    ready: false,
    rigReady: false,
    rigLoaded: false,
    robotTheme: null,
    setTheme: null,
    setReady: false,
    phase: "poster",
    renderCount: 0,
    renderedProgress: 0,
    renderedAt: 0,
    progress: 0,
    explode: 0,
    jump: 0,
    glFrames: [],
    renderedFrames: 0,
    reducedMotion: false,
    rootPosition: [0, 0, 0],
    feetMinY: 0,
    renderer: { calls: 0, triangles: 0, geometries: 0, textures: 0, dpr: 1 },
  });
}
export function publishPose(progress: number, pose: Pose) {
  const q = ensureProbe();
  if (q) {
    q.progress = progress;
    q.explode = pose.explode;
    q.jump = pose.jump;
    q.phase = progress < CHOREOGRAPHY.cameraStart ? "poster"
      : progress < CHOREOGRAPHY.crouchStart ? "camera"
      : progress < CHOREOGRAPHY.takeoff ? "crouch"
      : progress < CHOREOGRAPHY.impact ? "flight"
      : progress < CHOREOGRAPHY.compressionEnd ? "landing"
      : progress < CHOREOGRAPHY.exploded ? "explode" : "inspection";
  }
}
export function pushGlFrame(delta: number, progress: number, pose: Pose) {
  const q = ensureProbe();
  if (!q) return;
  q.renderedFrames++;
  q.renderCount++;
  if (!window.__QUACKLES_RECORD__ || q.glFrames.length >= 20000) return;
  const dt = delta * 1000;
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
