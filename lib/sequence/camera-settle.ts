/** Camera arrival, two stages.
 *  SETTLE (loose; unchanged from the original app): the spring is "at rest" for interaction purposes -> cameraMoving=false -> sharp-lock timing.
 *  CONVERGE (tight): the spring keeps converging invisibly, then snaps EXACTLY to the target with a sub-pixel jump, so the final view is
 *  route-independent (the loose stop left it up to ~5 px short at 8x, varying by route). Snapping at the LOOSE tolerance instead produced a
 *  visible ~5 px jump in the final frame, which is why the two stages are separate. */
export const SETTLE_TOL = { zoom: 0.0006, focus: 0.0008, velocity: 0.0025 } as const;
export const CONVERGE_TOL = { zoom: 0.0001, focus: 0.0001, velocity: 0.0008 } as const;
/** Tight focus tolerance scaled with zoom: a focus error d is ~d*H*(zoom-1) screen px, so a constant tolerance made the final snap ~2 px at maxZoom.
 * Capped at the base value for low zoom; ~0.65 px of final snap at any zoom. */
export function convergeFocusTol(zoom: number): number {
  return Math.min(CONVERGE_TOL.focus, 0.65 / (900 * Math.max(zoom - 1, 1)));
}
/** Keep ticking while the camera is still travelling. An INACTIVE camera (stored zoom pinned at 1) can never reach the tight tolerance,
 * so it stops as soon as it is loosely settled (as the original loop did) instead of ticking forever. */
export function shouldKeepTicking(i: { active: boolean; settled: boolean; converged: boolean; activeChanged: boolean }): boolean {
  if (i.activeChanged) return true;
  return i.active ? !i.converged : !i.settled;
}
export type CameraValues = { zoom: number; focusX: number; focusY: number; zoomV: number; fxV: number; fyV: number };
export type CameraTarget = { zoom: number; fx: number; fy: number };

export function settleCamera(c: CameraValues, t: CameraTarget): CameraValues & { settled: boolean; converged: boolean } {
  const within = (tol: { zoom: number; focus: number; velocity: number }) =>
    Math.abs(c.zoom - t.zoom) < tol.zoom && Math.abs(c.focusX - t.fx) < tol.focus && Math.abs(c.focusY - t.fy) < tol.focus &&
    Math.abs(c.zoomV) < tol.velocity && Math.abs(c.fxV) < tol.velocity && Math.abs(c.fyV) < tol.velocity;
  const settled = within(SETTLE_TOL), converged = within({ ...CONVERGE_TOL, focus: convergeFocusTol(t.zoom) });
  if (converged) return { zoom: t.zoom, focusX: t.fx, focusY: t.fy, zoomV: 0, fxV: 0, fyV: 0, settled: true, converged: true };
  return { ...c, settled, converged: false };
}
