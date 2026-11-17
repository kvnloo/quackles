/** Camera arrival. The spring used to stop ticking once within tolerance, leaving the camera up to 0.0008 focus (~5 px at 8x) short of
 * its target, by an amount that depends on the approach route. On arrival the camera now snaps EXACTLY to the target (zero velocity), so the
 * settled view is route-independent and matches the target the detail coverage is planned from. Tolerances are unchanged. */
export const SETTLE_TOL = { zoom: 0.0006, focus: 0.0008, velocity: 0.0025 } as const;
export type CameraValues = { zoom: number; focusX: number; focusY: number; zoomV: number; fxV: number; fyV: number };
export type CameraTarget = { zoom: number; fx: number; fy: number };

export function settleCamera(c: CameraValues, t: CameraTarget): CameraValues & { settled: boolean } {
  const settled =
    Math.abs(c.zoom - t.zoom) < SETTLE_TOL.zoom &&
    Math.abs(c.focusX - t.fx) < SETTLE_TOL.focus &&
    Math.abs(c.focusY - t.fy) < SETTLE_TOL.focus &&
    Math.abs(c.zoomV) < SETTLE_TOL.velocity &&
    Math.abs(c.fxV) < SETTLE_TOL.velocity &&
    Math.abs(c.fyV) < SETTLE_TOL.velocity;
  if (!settled) return { ...c, settled: false };
  return { zoom: t.zoom, focusX: t.fx, focusY: t.fy, zoomV: 0, fxV: 0, fyV: 0, settled: true };
}
