// Audio is intentionally absent (the synthetic Web Audio layer was judged
// annoying). Haptics: one short pattern per forward phase crossing, touch
// devices only, opt-out via localStorage "quackles.haptics" = "off".
import { click, pwm, roboticLand, roboticTakeoff, servoTrain, vibrate } from "./haptics";
import { hapticsAllowed, initialFeel, stepFeel, type FeelEvent, type FeelState } from "./phase-events";

const OPT_OUT_KEY = "quackles.haptics";
const PATTERN: Record<FeelEvent, () => number[]> = {
  crouch: () => pwm(40, 0.28),
  flight: roboticTakeoff,
  land: roboticLand,
  explode: () => servoTrain(90, 0.7),
  inspect: () => click(10),
};

let armed = false;
let feel: FeelState = initialFeel();

function optedOut() {
  try { return localStorage.getItem(OPT_OUT_KEY) === "off"; } catch { return false; }
}

function coarse() {
  return typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
}

export function setHapticsEnabled(on: boolean) {
  try { if (on) localStorage.removeItem(OPT_OUT_KEY); else localStorage.setItem(OPT_OUT_KEY, "off"); } catch { /* storage blocked */ }
}

function allowed(reduced: boolean) {
  return armed && hapticsAllowed({ coarse: coarse(), optOut: optedOut(), reduced });
}

export function armFeel() {
  armed = true;
}

export function driveFeel(progress: number, reduced: boolean) {
  const { state, event } = stepFeel(feel, progress);
  feel = state;
  if (event && allowed(reduced)) vibrate(PATTERN[event]());
}

export function feelThemeStop() {
  if (allowed(false)) vibrate(click(10));
}
