export type FrameSample = {
  index: number;
  t: number;
  dt: number;
  zoom: number;
  targetZoom: number;
  focusX: number;
  focusY: number;
  targetFocusX: number;
  targetFocusY: number;
  cameraMoving: boolean;
  baseVis: boolean;
  detailVis: boolean;
  baseCovers: boolean;
  detailCovers: boolean;
  tier: number;
  tiles: number;
  gpRequests: number;
  rgb: [number, number, number] | null;
};

export type FrameIssue = {
  frame: number;
  t: number;
  code:
    | "hitch"
    | "warp"
    | "zoom-jump"
    | "uncovered"
    | "hole"
    | "sharp-late"
    | "stuck-moving"
    | "color-jump"
    | "request-burst";
  detail: string;
};

const colorDistance = (a: [number, number, number], b: [number, number, number]) =>
  Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function frameIssues(frames: FrameSample[]): FrameIssue[] {
  const issues: FrameIssue[] = [];
  let settledAt = -1;
  let stuck = 0;
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const prev = frames[i - 1];
    if (frame.dt > 32) {
      issues.push({ frame: frame.index, t: frame.t, code: "hitch", detail: `${frame.dt.toFixed(1)} ms frame` });
    }
    if (prev) {
      const focusJump = Math.hypot(frame.focusX - prev.focusX, frame.focusY - prev.focusY);
      if (focusJump > 0.04) {
        issues.push({
          frame: frame.index,
          t: frame.t,
          code: "warp",
          detail: `focus jumped ${focusJump.toFixed(3)} in one frame`,
        });
      }
      if (Math.abs(frame.zoom - prev.zoom) > 1.5) {
        issues.push({
          frame: frame.index,
          t: frame.t,
          code: "zoom-jump",
          detail: `zoom ${prev.zoom.toFixed(2)} → ${frame.zoom.toFixed(2)}`,
        });
      }
      if (frame.rgb && prev.rgb && colorDistance(frame.rgb, prev.rgb) > 48) {
        issues.push({
          frame: frame.index,
          t: frame.t,
          code: "color-jump",
          detail: `${prev.rgb.join(",")} → ${frame.rgb.join(",")}`,
        });
      }
      if (frame.gpRequests - prev.gpRequests > 30) {
        issues.push({
          frame: frame.index,
          t: frame.t,
          code: "request-burst",
          detail: `${frame.gpRequests - prev.gpRequests} gigapixel requests`,
        });
      }
    }
    if (frame.zoom > 1.01 && !frame.baseCovers && !frame.detailCovers) {
      issues.push({ frame: frame.index, t: frame.t, code: "uncovered", detail: "neither canvas covers the frame" });
    }
    if (frame.detailVis && !frame.detailCovers && !frame.baseCovers) {
      issues.push({ frame: frame.index, t: frame.t, code: "hole", detail: "tile canvas does not cover the frame and the base is hidden" });
    }
    const atTarget = Math.abs(frame.zoom - frame.targetZoom) < 0.02;
    if (frame.cameraMoving && atTarget) stuck++;
    else stuck = 0;
    if (stuck === 10) {
      issues.push({ frame: frame.index, t: frame.t, code: "stuck-moving", detail: "zoom is at the target but the camera is still marked moving" });
    }
    if (settledAt < 0 && !frame.cameraMoving && frame.zoom > 2) settledAt = i;
    if (settledAt >= 0 && i === settledAt + 8 && frame.tier < 6455) {
      issues.push({
        frame: frame.index,
        t: frame.t,
        code: "sharp-late",
        detail: `tier ${frame.tier} still below 6455 after the camera stopped`,
      });
    }
  }
  return issues;
}
