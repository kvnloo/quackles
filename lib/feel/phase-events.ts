// Pure haptic event planner. Events fire only on a forward crossing of a
// choreography boundary, once per crossing; a boundary re-arms only after
// progress retreats REARM below it. No continuous trains while dwelling.
export const CHOREO = { crouch: 0.26, flight: 0.34, land: 0.56, explode: 0.64, inspect: 0.84 } as const;
export type FeelEvent = keyof typeof CHOREO;
export const REARM = 0.03;

const ORDER = Object.keys(CHOREO) as FeelEvent[];

export type FeelState = { last: number | null; fired: Record<FeelEvent, boolean> };

export function initialFeel(): FeelState {
  return { last: null, fired: { crouch: false, flight: false, land: false, explode: false, inspect: false } };
}

export function stepFeel(state: FeelState, progress: number): { state: FeelState; event: FeelEvent | null } {
  const fired = { ...state.fired };
  // First sample (fresh load or restored scroll): mark everything behind us as fired, emit nothing.
  if (state.last === null) {
    for (const k of ORDER) fired[k] = progress >= CHOREO[k];
    return { state: { last: progress, fired }, event: null };
  }
  let event: FeelEvent | null = null;
  for (const k of ORDER) {
    const b = CHOREO[k];
    if (fired[k] && progress < b - REARM) fired[k] = false;
    if (!fired[k] && progress >= b && progress > state.last) { fired[k] = true; event = k; }
  }
  return { state: { last: progress, fired }, event };
}

export function hapticsAllowed(g: { coarse: boolean; optOut: boolean; reduced: boolean }) {
  return g.coarse && !g.optOut && !g.reduced;
}
