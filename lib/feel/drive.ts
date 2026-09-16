import { playClick, playExplode, playLand, playServo, playTakeoff, unlockAudio } from "./audio";
import { click, pwm, roboticLand, roboticTakeoff, servoTrain, vibrate } from "./haptics";

const CHOREO = { crouch: 0.26, takeoff: 0.34, impact: 0.56, compression: 0.64, exploded: 0.84 };

function envelope(p: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (p - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function motion(p: number) {
  const jump = p > CHOREO.takeoff && p < CHOREO.impact ? Math.sin(Math.PI * ((p - CHOREO.takeoff) / (CHOREO.impact - CHOREO.takeoff))) ** 2 : 0;
  const squat = p > CHOREO.crouch && p < CHOREO.takeoff ? Math.sin(Math.PI * ((p - CHOREO.crouch) / (CHOREO.takeoff - CHOREO.crouch))) ** 2 : 0;
  const land = p > CHOREO.impact && p < CHOREO.compression ? Math.sin(Math.PI * ((p - CHOREO.impact) / (CHOREO.compression - CHOREO.impact))) ** 2 : 0;
  const explode = envelope(p, CHOREO.impact, CHOREO.exploded);
  return { jump, squat, land, explode };
}

type Phase = "idle" | "crouch" | "flight" | "land" | "explode" | "inspect";

function phaseAt(p: number): Phase {
  if (p < CHOREO.crouch) return "idle";
  if (p < CHOREO.takeoff) return "crouch";
  if (p < CHOREO.impact) return "flight";
  if (p < CHOREO.compression) return "land";
  if (p < CHOREO.exploded) return "explode";
  return "inspect";
}

let armed = false;
let lastPhase: Phase = "idle";
let lastServo = 0;

export function armFeel() {
  armed = true;
  unlockAudio();
  vibrate(click(8));
  playClick();
}

export function driveFeel(progress: number, reduced: boolean) {
  if (!armed || reduced) return;
  const phase = phaseAt(progress);
  const body = motion(progress);
  if (phase !== lastPhase) {
    if (phase === "flight") { vibrate(roboticTakeoff()); playTakeoff(); }
    else if (phase === "land") { vibrate(roboticLand()); playLand(); }
    else if (phase === "explode") { vibrate(servoTrain(90, 0.7)); playExplode(); }
    else if (phase === "crouch") { vibrate(pwm(40, 0.28)); playClick(); }
    lastPhase = phase;
  }
  const now = performance.now();
  if (phase === "flight" && now - lastServo > 70) {
    lastServo = now;
    vibrate(servoTrain(48, 0.25 + body.jump * 0.5));
    playServo(body.jump);
  }
  if (phase === "explode" && now - lastServo > 90) {
    lastServo = now;
    vibrate(servoTrain(36, 0.35 + body.explode * 0.4));
    playServo(body.explode);
  }
}

export function feelThemeStop() {
  if (!armed) return;
  vibrate(click(10));
  playClick();
}
