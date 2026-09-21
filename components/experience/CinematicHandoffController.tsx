"use client";

import { useEffect, useRef } from "react";
import { useExperience } from "@/components/providers/ExperienceProvider";
import {
  assembledPoseInto,
  cinematicPoseInto,
  type CinematicPhase,
} from "@/lib/cinematic-handoff";
import { inspectionSnapshot } from "@/lib/sequence/inspection";
import {
  setProgress as setSequenceProgress,
  setReducedMotion as setSequenceReducedMotion,
} from "@/lib/sequence/store";
import { ensureProbe, publishPose } from "@/lib/probe";
import { poseAtInto } from "@/lib/pose";
import { simulatorHandoffError } from "@/lib/sim/drive";

type CinematicState = {
  phase: CinematicPhase;
  storyProgress: number;
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

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function normalizedWheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * innerHeight;
  return event.deltaY;
}

function phaseAt(progress: number): CinematicPhase {
  if (progress <= 0.002) return "idle";
  if (progress < 0.45) return "jump";
  if (progress < 0.72) return "explode";
  if (progress < 0.93) return "reassemble";
  return "sim-ready";
}

function phaseProgressAt(progress: number, phase: CinematicPhase) {
  if (phase === "idle") return 0;
  if (phase === "jump") return clamp01(progress / 0.45);
  if (phase === "explode") return clamp01((progress - 0.45) / 0.27);
  if (phase === "reassemble") return clamp01((progress - 0.72) / 0.21);
  return 1;
}

function progressForPhase(
  phase: Exclude<CinematicPhase, "idle">,
  progress: number,
) {
  const t = clamp01(progress);
  if (phase === "jump") return t * 0.45;
  if (phase === "explode") return 0.45 + t * 0.27;
  if (phase === "reassemble") return 0.72 + t * 0.21;
  return 1;
}

export function CinematicHandoffController() {
  const { poseRef, progressRef, ready, reducedMotion } = useExperience();
  const storyRef = useRef(0);
  const phaseRef = useRef<CinematicPhase>("idle");
  const phaseProgressRef = useRef(0);

  useEffect(() => {
    const frame = document.querySelector<HTMLElement>(".poster-frame");
    if (!frame) return;

    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    setSequenceReducedMotion(reducedMotion);

    const state = (): CinematicState => ({
      phase: phaseRef.current,
      storyProgress: storyRef.current,
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
      frame.dataset.storyProgress = storyRef.current.toFixed(4);

      const phaseCopy = document.querySelector<HTMLElement>(
        ".cinematic-phase-copy",
      );
      if (phaseCopy) {
        phaseCopy.textContent =
          phaseRef.current === "idle"
            ? "INSPECT"
            : phaseRef.current === "sim-ready"
              ? "SPECS"
              : phaseRef.current.toUpperCase();
      }

      const progress = document.querySelector<HTMLElement>(
        ".scroll-progress-fill",
      );
      if (progress)
        progress.style.transform = `scaleX(${storyRef.current})`;
    };

    const applyStory = (nextProgress: number) => {
      const progress = clamp01(nextProgress);
      const phase = phaseAt(progress);
      const local = phaseProgressAt(progress, phase);

      storyRef.current = progress;
      phaseRef.current = phase;
      phaseProgressRef.current = local;
      progressRef.current = progress;
      setSequenceProgress(progress);

      if (phase === "idle") {
        poseAtInto(poseRef.current, 0);
      } else if (phase === "sim-ready") {
        assembledPoseInto(poseRef.current);
      } else {
        cinematicPoseInto(poseRef.current, phase, local);
      }

      publishPose(progress, poseRef.current);
      const probe = ensureProbe();
      if (probe) probe.reducedMotion = reducedMotion;
      syncPresentation();
      window.__QUACKLES_INVALIDATE__?.();
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
      const inspection = inspectionSnapshot();

      // At story origin, wheel-up belongs entirely to product inspection.
      if (deltaY < 0 && storyRef.current <= 0.002) return;

      // While inspection is active, wheel-down first returns the camera to 1x.
      if (
        deltaY > 0 &&
        (inspection.active ||
          inspection.zoom > 1.002 ||
          inspection.targetZoom > 1.002)
      )
        return;

      event.preventDefault();
      event.stopPropagation();

      const bounded = Math.max(-180, Math.min(180, deltaY));
      applyStory(storyRef.current + bounded * 0.00125);
    };

    const reset = () => applyStory(0);

    window.__QUACKLES_CINEMATIC__ = {
      getState: state,
      reset,
      trigger: () => applyStory(Math.max(storyRef.current, 0.08)),
      seekPhase(phase, progress) {
        applyStory(progressForPhase(phase, progress));
      },
    };

    applyStory(0);
    frame.addEventListener("wheel", onWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      frame.removeEventListener("wheel", onWheel, { capture: true });
      delete window.__QUACKLES_CINEMATIC__;
      delete frame.dataset.cinematicPhase;
      delete frame.dataset.storyProgress;
    };
  }, [poseRef, progressRef, ready, reducedMotion]);

  return null;
}
