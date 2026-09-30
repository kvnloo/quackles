/** Camera arrival, two stages.
 *  SETTLE (loose; unchanged from the original app): the spring is "at rest" for interaction purposes -> cameraMoving=false -> sharp-lock timing.
 *  CONVERGE (tight): the spring keeps converging invisibly, then snaps EXACTLY to the target with a sub-pixel jump, so the final view is
 *  route-independent (the loose stop left it up to ~5 px short at 8x, varying by route). Snapping at the LOOSE tolerance instead produced a
 *  visible ~5 px jump in the final frame, which is why the two stages are separate. */
export const SETTLE_TOL = { zoom: 0.0006, focus: 0.0008, velocity: 0.0025 } as const;
export const CONVERGE_TOL = { zoom: 0.0001, focus: 0.0001, velocity: 0.0008 } as const;
export type CameraValues = { zoom: number; focusX: number; focusY: number; zoomV: number; fxV: number; fyV: number };
export type CameraTarget = { zoom: number; fx: number; fy: number };

export function settleCamera(c: CameraValues, t: CameraTarget): CameraValues & { settled: boolean; converged: boolean } {
  const within = (tol: { zoom: number; focus: number; velocity: number }) =>
    Math.abs(c.zoom - t.zoom) < tol.zoom && Math.abs(c.focusX - t.fx) < tol.focus && Math.abs(c.focusY - t.fy) < tol.focus &&
    Math.abs(c.zoomV) < tol.velocity && Math.abs(c.fxV) < tol.velocity && Math.abs(c.fyV) < tol.velocity;
  const settled = within(SETTLE_TOL), converged = within(CONVERGE_TOL);
  if (converged) return { zoom: t.zoom, focusX: t.fx, focusY: t.fy, zoomV: 0, fxV: 0, fyV: 0, settled: true, converged: true };
  return { ...c, settled, converged: false };
}
