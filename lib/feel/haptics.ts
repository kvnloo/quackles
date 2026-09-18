/** PWM envelope engine for Chrome Android → Vibrator.vibrate(ms).
 * Galaxy S25 Ultra uses a Cirrus CS40L26 closed-loop LRA. Chrome never
 * exposes amplitude or AHAP; Blink sanitizes patterns to ≤99 steps / 10s
 * and Android then calls Vibrator.vibrate(milliseconds) per step. Duty-cycle
 * pulse trains are the only intensity channel a website has. */
const MAX_STEPS = 99;
const MAX_MS = 10000;

export function pwm(durationMs: number, duty: number, period = 14): number[] {
  const on = Math.max(1, Math.min(period - 1, Math.round(period * Math.max(0.08, Math.min(0.92, duty)))));
  const off = Math.max(1, period - on);
  const pattern: number[] = [];
  let spent = 0;
  while (spent < durationMs && pattern.length < MAX_STEPS - 1) {
    const pulse = Math.min(on, durationMs - spent);
    pattern.push(pulse);
    spent += pulse;
    if (spent >= durationMs || pattern.length >= MAX_STEPS) break;
    pattern.push(off);
    spent += off;
  }
  if (pattern.length % 2 === 0) pattern.pop();
  return pattern;
}

export function click(ms = 12) {
  return [Math.max(1, Math.min(MAX_MS, ms))];
}

export function roboticLand() {
  return [18, 22, 9, 14, 28];
}

export function roboticTakeoff() {
  return pwm(70, 0.55, 12);
}

export function servoTrain(ms: number, duty: number) {
  return pwm(ms, duty, 10);
}

export function vibrate(pattern: number[]) {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return false;
  if (document.visibilityState !== "visible") return false;
  const clean = pattern.map((n) => Math.max(0, Math.min(MAX_MS, Math.round(n)))).slice(0, MAX_STEPS);
  if (!clean.length) return navigator.vibrate(0);
  return navigator.vibrate(clean);
}
