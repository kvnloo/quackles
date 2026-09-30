// Pure state machine for the flagged (?sim=1) story -> live simulator hand-off.
// STORY -> swap-in (cross-fade the live rig in under the last plate) ->
// reassemble (exploded -> default pose) -> await (backend) -> SIM ->
// return (sim pose -> seeded pose) -> disassemble -> swap-out -> STORY.
// No DOM, clocks or globals: the controller feeds events and derives effects
// from phase changes, which keeps activation/teardown deterministic.

import { SIM_LIVE_PROGRESS } from "./flag";

export const HANDOFF = {
  /** Story progress at which the live layer (three.js + rig) may load. */
  liveProgress: SIM_LIVE_PROGRESS,
  /** Story progress at which the pinned sim runtime is prefetched. */
  runtimeProgress: 0.92,
  /** Story progress at which down-intent may enter the simulator. */
  enterProgress: 0.999,
  /** Accumulated wheel delta (px) that counts as sustained intent. */
  intentThreshold: 320,
  /** A gap longer than this between wheel events restarts the intent. */
  intentWindowMs: 450,
  swapMs: 260,
  reassembleMs: 1000,
  returnMs: 500,
} as const;

export type HandoffPhase =
  | "story"
  | "swap-in"
  | "reassemble"
  | "await"
  | "sim"
  | "return"
  | "disassemble"
  | "swap-out";

export type HandoffState = {
  phase: HandoffPhase;
  /** 0..1 progress through the current timed phase. */
  t: number;
  intent: number;
  lastWheelAt: number;
  backendReady: boolean;
  reduced: boolean;
  entries: number;
  exits: number;
};

export type HandoffEvent =
  | { type: "wheel"; deltaY: number; now: number; progress: number; atMinZoom: boolean }
  | { type: "enter"; progress: number }
  | { type: "exit" }
  | { type: "tick"; dt: number }
  | { type: "backend-ready" }
  | { type: "backend-lost" }
  | { type: "reduced-motion"; reduced: boolean };

export type LoadStage = "none" | "live" | "runtime";

export function loadStage(progress: number): LoadStage {
  if (progress >= HANDOFF.runtimeProgress) return "runtime";
  if (progress >= HANDOFF.liveProgress) return "live";
  return "none";
}

export function initialHandoff(reduced: boolean): HandoffState {
  return { phase: "story", t: 0, intent: 0, lastWheelAt: -Infinity, backendReady: false, reduced, entries: 0, exits: 0 };
}

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

const DURATION: Partial<Record<HandoffPhase, number>> = {
  "swap-in": HANDOFF.swapMs,
  reassemble: HANDOFF.reassembleMs,
  return: HANDOFF.returnMs,
  disassemble: HANDOFF.reassembleMs,
  "swap-out": HANDOFF.swapMs,
};

function to(state: HandoffState, phase: HandoffPhase, t = 0): HandoffState {
  return { ...state, phase, t, intent: 0, lastWheelAt: -Infinity };
}

function enter(state: HandoffState): HandoffState {
  const next = { ...state, entries: state.entries + 1, backendReady: false };
  // Reduced motion: no reassembly animation, straight to the assembled pose.
  return state.reduced ? to(next, "await", 1) : to(next, "swap-in");
}

function leave(state: HandoffState): HandoffState {
  if (state.reduced) return { ...to(state, "story"), exits: state.exits + 1, backendReady: false };
  switch (state.phase) {
    case "swap-in":
      return to(state, "swap-out", 1 - state.t);
    case "reassemble":
      return to(state, "disassemble", 1 - state.t);
    case "await":
      return to(state, "disassemble");
    case "sim":
      return to(state, "return");
    default:
      return state;
  }
}

function accumulate(state: HandoffState, deltaY: number, now: number) {
  const fresh = now - state.lastWheelAt > HANDOFF.intentWindowMs;
  return { ...state, intent: (fresh ? 0 : state.intent) + Math.abs(deltaY), lastWheelAt: now };
}

function advance(state: HandoffState): HandoffState {
  switch (state.phase) {
    case "swap-in":
      return to(state, "reassemble");
    case "reassemble":
      return state.backendReady ? to(state, "sim", 1) : to(state, "await", 1);
    case "return":
      return to(state, "disassemble");
    case "disassemble":
      return to(state, "swap-out");
    case "swap-out":
      return { ...to(state, "story"), exits: state.exits + 1, backendReady: false };
    default:
      return state;
  }
}

export function reduceHandoff(state: HandoffState, event: HandoffEvent): HandoffState {
  switch (event.type) {
    case "reduced-motion":
      return { ...state, reduced: event.reduced };
    case "tick": {
      const duration = DURATION[state.phase];
      if (!duration) return state;
      const t = state.t + Math.max(0, event.dt) / duration;
      return t >= 1 ? advance({ ...state, t: 1 }) : { ...state, t };
    }
    case "backend-ready":
      if (state.phase === "await") return to({ ...state, backendReady: true }, "sim", 1);
      if (state.phase === "swap-in" || state.phase === "reassemble") return { ...state, backendReady: true };
      return state;
    case "backend-lost":
      if (state.phase === "sim" || state.phase === "await") return leave({ ...state, backendReady: false });
      return { ...state, backendReady: false };
    case "enter":
      return state.phase === "story" && event.progress >= HANDOFF.enterProgress ? enter(state) : state;
    case "exit":
      return leave(state);
    case "wheel": {
      if (state.phase === "story") {
        if (state.reduced || event.progress < HANDOFF.enterProgress || event.deltaY <= 0) return { ...state, intent: 0, lastWheelAt: -Infinity };
        const next = accumulate(state, event.deltaY, event.now);
        return next.intent >= HANDOFF.intentThreshold ? enter(next) : next;
      }
      if (state.phase === "sim") {
        if (event.deltaY >= 0 || !event.atMinZoom) return { ...state, intent: 0, lastWheelAt: -Infinity };
        const next = accumulate(state, event.deltaY, event.now);
        return next.intent >= HANDOFF.intentThreshold ? leave(next) : next;
      }
      return state;
    }
  }
}

export type HandoffWeights = {
  /** Opacity of the live canvas over the authored plate. */
  liveOpacity: number;
  /** 0 = exploded story pose (poseAt(1)), 1 = assembled default pose. */
  assembled: number;
  /** 1 = physics snapshot owns the rig, 0 = the seeded (assembled) pose. */
  simPose: number;
  /** Linear exploded->assembled fraction (blendPoseInto applies the easing). */
  assemblyT: number;
};

export function handoffWeights(state: HandoffState): HandoffWeights {
  switch (state.phase) {
    case "story":
      return { liveOpacity: 0, assembled: 0, simPose: 0, assemblyT: 0 };
    case "swap-in":
      return { liveOpacity: state.t, assembled: 0, simPose: 0, assemblyT: 0 };
    case "reassemble":
      return { liveOpacity: 1, assembled: smooth(state.t), simPose: 0, assemblyT: state.t };
    case "await":
      return { liveOpacity: 1, assembled: 1, simPose: 0, assemblyT: 1 };
    case "sim":
      return { liveOpacity: 1, assembled: 1, simPose: 1, assemblyT: 1 };
    case "return":
      return { liveOpacity: 1, assembled: 1, simPose: 1 - smooth(state.t), assemblyT: 1 };
    case "disassemble":
      return { liveOpacity: 1, assembled: smooth(1 - state.t), simPose: 0, assemblyT: 1 - state.t };
    case "swap-out":
      return { liveOpacity: 1 - state.t, assembled: 0, simPose: 0, assemblyT: 0 };
  }
}
