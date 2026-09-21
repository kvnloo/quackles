"use client";

import { useEffect, useRef } from "react";
import { useExperience } from "@/components/providers/ExperienceProvider";
import {
  CINEMATIC,
  assembledPoseInto,
  cinematicPoseInto,
  cinematicProbeProgress,
  type CinematicPhase,
} from "@/lib/cinematic-handoff";
import { inspectionSnapshot } from "@/lib/sequence/inspection";
import {
  setReducedMotion as setSequenceReducedMotion,
  snapshot as sequenceSnapshot,
} from "@/lib/sequence/store";
import { ensureProbe, publishPose } from "@/lib/probe";
import { poseAtInto } from "@/lib/pose";
import { simulatorHandoffError } from "@/lib/sim/drive";

type CinematicState = {
  phase: CinematicPhase;
  launchIntent: number;
  launchThreshold: number;
  phaseProgress: number;
  authority: "inspection" | "cinematic" | "simulator-pending";
  liveReady: boolean;
  handoff: ReturnType<typeof simulatorHandoffError>;
};

declare global {
  interface Window {
    __QUACKLES_CINEMATIC__?: {
      getState: () => CinematicState;
      reset: () => void;
      trigger: () => void;
      seekPhase: (phase: Exclude<CinematicPhase, "idle">, progress: number) => void;
    };
  }
}

function normalizedWheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * innerHeight;
  return event.deltaY;
}

export function CinematicHandoffController() {
  const { poseRef, progressRef, ready, reducedMotion } = useExperience();
  const phaseRef = useRef<CinematicPhase>("idle");
  const launchIntentRef = useRef(0);
  const phaseProgressRef = useRef(0);
  const phaseStartedAtRef = useRef(0);
  const animationRef = useRef(0);

  useEffect(() => {
    const frame = document.querySelector<HTMLElement>(".poster-frame");
    if (!frame) return;

    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    setSequenceReducedMotion(reducedMotion);

    const state = (): CinematicState => ({
      phase: phaseRef.current,
      launchIntent: launchIntentRef.current,
      launchThreshold: CINEMATIC.launchThreshold,
      phaseProgress: phaseProgressRef.current,
      authority:
        phaseRef.current === "idle"
          ? "inspection"
          : phaseRef.current === "sim-ready"
            ? "simulator-pending"
            : "cinematic",
      liveReady: ready,
      handoff: simulatorHandoffError(poseRef.current),
    });

    const syncPresentation = () => {
      frame.dataset.cinematicPhase = phaseRef.current;
      frame.style.setProperty(
        "--launch-intent",
        String(
          Math.min(
            1,
            launchIntentRef.current / CINEMATIC.launchThreshold,
          ),
        ),
      );

      const phaseCopy = document.querySelector<HTMLElement>(".cinematic-phase-copy");
      const scrollCopy = document.querySelector<HTMLElement>(".cinematic-scroll-copy");
      if (phaseCopy) {
        phaseCopy.textContent =
          phaseRef.current === "idle"
            ? "INSPECT"
            : phaseRef.current === "sim-ready"
              ? "SIM READY"
              : phaseRef.current.toUpperCase();
      }
      if (scrollCopy) {
        scrollCopy.textContent =
          phaseRef.current === "idle"
            ? ready
              ? "↑ INSPECT · ↓ LAUNCH"
              : "↑ INSPECT · LIVE RIG WARMING"
            : phaseRef.current === "sim-ready"
              ? "CINEMATIC COMPLETE · SIMULATOR HANDOFF READY"
              : "CINEMATIC CONTROL LOCKED";
      }
    };

    const publish = (phaseProgress: number) => {
      phaseProgressRef.current = phaseProgress;
      const progress = cinematicProbeProgress(
        phaseRef.current,
        phaseProgress,
      );
      progressRef.current = progress;
      publishPose(progress, poseRef.current);
      const probe = ensureProbe();
      if (probe) probe.reducedMotion = reducedMotion;
      syncPresentation();
      window.__QUACKLES_INVALIDATE__?.();
    };

    const setPhase = (phase: CinematicPhase, now = performance.now()) => {
      phaseRef.current = phase;
      phaseStartedAtRef.current = now;
      phaseProgressRef.current = 0;
      launchIntentRef.current = 0;
      syncPresentation();
    };

    const durationFor = (phase: CinematicPhase) => {
      if (phase === "jump") return CINEMATIC.jumpMs;
      if (phase === "explode") return CINEMATIC.explodeMs;
      if (phase === "reassemble") return CINEMATIC.reassembleMs;
      return 0;
    };

    const requestTick = () => {
      if (!animationRef.current)
        animationRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      if (phaseRef.current !== "idle" || !ready) return;
      if (reducedMotion) {
        assembledPoseInto(poseRef.current);
        setPhase("sim-ready");
        publish(1);
        return;
      }
      setPhase("jump");
      requestTick();
    };

    const tick = (now: number) => {
      animationRef.current = 0;
      const phase = phaseRef.current;

      if (phase === "idle") {
        syncPresentation();
        return;
      }
      if (phase === "sim-ready") {
        assembledPoseInto(poseRef.current);
        publish(1);
        return;
      }

      const duration = durationFor(phase);
      const elapsed = Math.max(0, now - phaseStartedAtRef.current);
      const progress = Math.min(1, elapsed / duration);
      cinematicPoseInto(poseRef.current, phase, progress);
      publish(progress);

      if (progress < 1) {
        requestTick();
        return;
      }

      if (phase === "jump") setPhase("explode", now);
      else if (phase === "explode") setPhase("reassemble", now);
      else setPhase("sim-ready", now);
      requestTick();
    };

    const onWheel = (event: WheelEvent) => {
      if (
        !finePointer.matches ||
        event.ctrlKey ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,select,button,a"))
      )
        return;

      const deltaY = normalizedWheelDelta(event);
      const phase = phaseRef.current;

      if (phase !== "idle") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      // HeroInspection owns wheel-up and the return-to-1x motion. We only take
      // authority after it has fully released the camera at the hero.
      const inspection = inspectionSnapshot();
      if (
        deltaY <= 0 ||
        inspection.active ||
        inspection.zoom > 1.002 ||
        inspection.targetZoom > 1.002
      )
        return;

      const atHero =
        sequenceSnapshot().progress <= 0.002 && window.scrollY <= 2;
      if (!atHero) return;

      event.preventDefault();
      event.stopPropagation();

      launchIntentRef.current = Math.min(
        CINEMATIC.launchThreshold,
        launchIntentRef.current + Math.max(0, deltaY),
      );
      syncPresentation();

      if (
        ready &&
        launchIntentRef.current >= CINEMATIC.launchThreshold
      )
        start();
    };

    const reset = () => {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
      phaseRef.current = "idle";
      launchIntentRef.current = 0;
      phaseProgressRef.current = 0;
      // Keep the live rig at the authored hero pose while it is hidden.
      poseAtInto(poseRef.current, 0);
      syncPresentation();
      window.__QUACKLES_INVALIDATE__?.();
    };

    window.__QUACKLES_CINEMATIC__ = {
      getState: state,
      reset,
      trigger: start,
      seekPhase(phase, progress) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = 0;
        setPhase(phase);
        if (phase === "sim-ready") {
          assembledPoseInto(poseRef.current);
          publish(1);
          return;
        }
        cinematicPoseInto(
          poseRef.current,
          phase,
          Math.max(0, Math.min(1, progress)),
        );
        publish(Math.max(0, Math.min(1, progress)));
      },
    };

    syncPresentation();
    frame.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      cancelAnimationFrame(animationRef.current);
      frame.removeEventListener("wheel", onWheel, { capture: true });
      delete window.__QUACKLES_CINEMATIC__;
      delete frame.dataset.cinematicPhase;
      frame.style.removeProperty("--launch-intent");
    };
  }, [poseRef, progressRef, ready, reducedMotion]);

  return null;
}
