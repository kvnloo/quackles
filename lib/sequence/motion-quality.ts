/** Quality and flick math for a camera that is moving. Still frames do not use this. */

export const MOTION_FRAME_BUDGET_MS = 16.7;
export const MOTION_SCALE_START = 0.72;

export function flickPixelsPerSecond(
  samples: { t: number; p: number }[],
  now: number,
  windowMs = 80,
): number {
  const recent = samples.filter((sample) => now - sample.t <= windowMs);
  if (recent.length < 2) return 0;
  const first = recent[0];
  const last = recent[recent.length - 1];
  const dt = (last.t - first.t) / 1000;
  if (dt < 0.016) return 0;
  return (last.p - first.p) / dt;
}

/** Coast speed cap on screen: ~2.8 focus/s at 7.4x on a 412 px frame (the tuned value there), and no longer a brake on
 * low-zoom flicks (a focus/s cap allowed only ~990 px/s at 1.86x). */
export const MAX_COAST_PX_PER_SECOND = 7400;

/** Project a zoomed pan flick. Focus velocity is in focus-units per second. */
export function flickFocusTarget(args: {
  focus: number;
  zoom: number;
  framePx: number;
  pixelsPerSecond: number;
  coastSeconds?: number;
  maxFocusPerSecond?: number;
}): { focus: number; velocity: number } {
  const zoom = Math.max(1.02, args.zoom);
  const coast = args.coastSeconds ?? 0.42;
  const maxSpeed = args.maxFocusPerSecond ?? MAX_COAST_PX_PER_SECOND / (Math.max(1, args.framePx) * (zoom - 1));
  const raw = -args.pixelsPerSecond / (Math.max(1, args.framePx) * (zoom - 1));
  const velocity = Math.max(-maxSpeed, Math.min(maxSpeed, raw));
  const focus = Math.max(0, Math.min(1, args.focus + velocity * coast));
  return { focus, velocity };
}

/**
 * Camera state when the last finger lifts off a pan: coast towards the flick target, or, when the flick is too slow to
 * coast, stop exactly where the finger left the camera. (A slow flick used to keep the flick target and velocity with
 * no spring running: the camera stayed short of a target the tile plan already used, so the sharp layer sat offset.)
 */
export function panRelease(p: { focusX: number; focusY: number; flickX: { focus: number; velocity: number }; flickY: { focus: number; velocity: number }; minVelocity?: number }) {
  const coast = Math.hypot(p.flickX.velocity, p.flickY.velocity) > (p.minVelocity ?? 0.05);
  return coast
    ? { coast, targetFocusX: p.flickX.focus, targetFocusY: p.flickY.focus, focusVelocityX: p.flickX.velocity, focusVelocityY: p.flickY.velocity }
    : { coast, targetFocusX: p.focusX, targetFocusY: p.focusY, focusVelocityX: 0, focusVelocityY: 0 };
}

/** Spring step for a frame at `now` (rAF time). Seeded with the lift time, the first coast frame advances by the time
 * since the lift (it assumed a full 16.7 ms frame: at 120 Hz the first coast tick moved ~2x the flick speed). */
export function tickElapsed(now: number, lastTick: number): number {
  return lastTick ? Math.max(0, now - lastTick) : 1000 / 60;
}

/** Raise the moving tier when frames are inside budget. Drop it when they are not. */
export function nextMotionScale(
  scale: number,
  frameMs: number,
  budgetMs = MOTION_FRAME_BUDGET_MS,
): number {
  if (frameMs <= 0) return scale;
  if (frameMs <= budgetMs * 0.8) return Math.min(1, scale * 1.1);
  if (frameMs >= budgetMs * 1.35) return Math.max(0.42, scale * 0.86);
  return scale;
}

/** Cap only the moving request. Never below the first tier above the 1024 plate when one exists. */
export function motionDesiredWidth(settledWidth: number, scale: number): number {
  const floor = Math.min(settledWidth, 1448);
  return Math.max(floor, Math.min(settledWidth, Math.round(settledWidth * scale)));
}

/**
 * Detail tier to request. Promotion is a settle-time event (D6): while the camera moves the tier never rises above
 * what is already painted (or the plate when nothing is), so no sharpening pop or high-res decode competes with motion.
 */
export function requestedDetailWidth(input: { moving: boolean; settledWidth: number; paintedWidth: number; plateWidth: number }): number {
  if (!input.moving) return input.settledWidth;
  return Math.min(input.settledWidth, Math.max(input.paintedWidth, input.plateWidth));
}
