/** One place for the hero camera's "zoomed in" threshold and the touch policy that follows from it. */

/** Zoom (or native pinch scale) strictly above this counts as inspecting rather than the 1x story view. */
export const ZOOMED_IN_THRESHOLD = 1.02;

export function isZoomedIn(zoom: number): boolean {
  return zoom > ZOOMED_IN_THRESHOLD;
}

/** The hero camera is zoomed in, or is still heading there. */
export function heroZoomed(state: { zoom: number; targetZoom: number }): boolean {
  return isZoomedIn(state.zoom) || isZoomedIn(state.targetZoom);
}

export type HeroTouchPolicy = { touchAction: "none" | "pan-y"; overscrollBehavior: "none" | "" };

/** Whenever the hero is inspectable (any zoom above 1x, a camera still heading there, or an active inspection) every
 * touch belongs to the camera; at rest at 1x vertical swipes stay native page scroll. Apply it on the state change so it
 * is already in place when the next gesture's first finger lands (touch-action is fixed at touchstart). */
export function heroTouchPolicy(state: { zoom: number; targetZoom: number; active: boolean }): HeroTouchPolicy {
  const owned = heroZoomed(state) || state.active;
  return owned ? { touchAction: "none", overscrollBehavior: "none" } : { touchAction: "pan-y", overscrollBehavior: "" };
}
