"use client";

import { useEffect, useRef } from "react";
import { useExperience } from "@/components/providers/ExperienceProvider";
import {
  DESKTOP_EXPERIENCE,
  assembledPoseInto,
  cinematicPoseInto,
  inspectPoseInto,
  normalizeWheelDelta,
  probeProgress,
  type DesktopPhase,
} from "@/lib/desktop-experience";
import { ensureProbe, publishPose } from "@/lib/probe";

type DesktopState = {
  phase: DesktopPhase;
  zoom: number;
  targetZoom: number;
  launchIntent: number;
  launchThreshold: number;
  phaseProgress: number;
  authority: "cinematic" | "simulator-pending";
  simReady: boolean;
};

declare global {
  interface Window {
    __QUACKLES_DESKTOP__?: {
      getState: () => DesktopState;
      reset: () => void;
      setZoom: (value: number) => void;
      triggerJump: () => void;
      wheel: (deltaY: number) => void;
    };
  }
}

export function DesktopExperienceController() {
  const { poseRef, progressRef, reducedMotion } = useExperience();
  const phaseRef = useRef<DesktopPhase>("inspect");
  const zoomRef = useRef(DESKTOP_EXPERIENCE.initialZoom);
  const targetZoomRef = useRef(DESKTOP_EXPERIENCE.initialZoom);
  const launchIntentRef = useRef(0);
  const phaseStartedAtRef = useRef(0);
  const phaseProgressRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".desktop-shell");
    const progressFill =
      document.querySelector<HTMLElement>(".desktop-shell .scroll-progress-fill");

    const state = (): DesktopState => ({
      phase: phaseRef.current,
      zoom: zoomRef.current,
      targetZoom: targetZoomRef.current,
      launchIntent: launchIntentRef.current,
      launchThreshold: DESKTOP_EXPERIENCE.launchThreshold,
      phaseProgress: phaseProgressRef.current,
      authority:
        phaseRef.current === "sim-ready" ? "simulator-pending" : "cinematic",
      simReady: phaseRef.current === "sim-ready",
    });

    const syncPresentation = () => {
      if (shell) {
        shell.dataset.phase = phaseRef.current;
        shell.style.setProperty("--desktop-zoom", String(zoomRef.current));
        shell.style.setProperty(
          "--launch-intent",
          String(
            Math.min(
              1,
              launchIntentRef.current / DESKTOP_EXPERIENCE.launchThreshold,
            ),
          ),
        );
      }
      if (progressFill) {
        const zoomProgress =
          (zoomRef.current - DESKTOP_EXPERIENCE.nearZoom) /
          (DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.nearZoom);
        const phaseBase =
          phaseRef.current === "inspect"
            ? Math.max(0, Math.min(1, zoomProgress)) * 0.24
            : phaseRef.current === "jump"
              ? 0.24 + phaseProgressRef.current * 0.32
              : phaseRef.current === "explode"
                ? 0.56 + phaseProgressRef.current * 0.28
                : phaseRef.current === "reassemble"
                  ? 0.84 + phaseProgressRef.current * 0.16
                  : 1;
        progressFill.style.transform = `scaleX(${phaseBase})`;
      }
    };

    const publish = (phaseProgress: number) => {
      phaseProgressRef.current = phaseProgress;
      const progress = probeProgress(
        phaseRef.current,
        phaseProgress,
        zoomRef.current,
      );
      progressRef.current = progress;
      publishPose(progress, poseRef.current);
      const probe = ensureProbe();
      if (probe) probe.reducedMotion = reducedMotion;
      syncPresentation();
      window.__QUACKLES_INVALIDATE__?.();
    };

    const setPhase = (phase: DesktopPhase, now = performance.now()) => {
      phaseRef.current = phase;
      phaseStartedAtRef.current = now;
      phaseProgressRef.current = 0;
      launchIntentRef.current = 0;
      syncPresentation();
    };

    const durationFor = (phase: DesktopPhase) => {
      if (phase === "jump") return DESKTOP_EXPERIENCE.jumpMs;
      if (phase === "explode") return DESKTOP_EXPERIENCE.explodeMs;
      if (phase === "reassemble") return DESKTOP_EXPERIENCE.reassembleMs;
      return 0;
    };

    const requestTick = () => {
      if (!frameRef.current) frameRef.current = requestAnimationFrame(tick);
    };

    const startJump = () => {
      if (phaseRef.current !== "inspect") return;
      zoomRef.current = DESKTOP_EXPERIENCE.farZoom;
      targetZoomRef.current = DESKTOP_EXPERIENCE.farZoom;
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
      frameRef.current = 0;
      const phase = phaseRef.current;
      if (phase === "inspect") {
        const delta = targetZoomRef.current - zoomRef.current;
        if (Math.abs(delta) > 0.0005) {
          zoomRef.current += delta * 0.16;
        } else {
          zoomRef.current = targetZoomRef.current;
        }
        inspectPoseInto(poseRef.current, zoomRef.current);
        publish(0);
        if (Math.abs(targetZoomRef.current - zoomRef.current) > 0.0005)
          requestTick();
        return;
      }
      if (phase === "sim-ready") {
        assembledPoseInto(poseRef.current);
        publish(1);
        return;
      }
      const duration = durationFor(phase);
      const elapsed = Math.max(0, now - phaseStartedAtRef.current);
      const t = Math.min(1, elapsed / duration);
      cinematicPoseInto(poseRef.current, phase, t);
      publish(t);
      if (t < 1) {
        requestTick();
        return;
      }
      if (phase === "jump") setPhase("explode", now);
      else if (phase === "explode") setPhase("reassemble", now);
      else setPhase("sim-ready", now);
      requestTick();
    };

    const feedWheel = (deltaY: number) => {
      if (phaseRef.current !== "inspect") return;
      if (deltaY < 0) {
        launchIntentRef.current = Math.max(
          0,
          launchIntentRef.current - Math.abs(deltaY) * 1.5,
        );
        targetZoomRef.current = Math.max(
          DESKTOP_EXPERIENCE.nearZoom,
          targetZoomRef.current +
            deltaY * DESKTOP_EXPERIENCE.wheelSensitivity,
        );
      } else if (
        targetZoomRef.current < DESKTOP_EXPERIENCE.farZoom - 0.001 ||
        zoomRef.current <
          DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.farTolerance
      ) {
        targetZoomRef.current = Math.min(
          DESKTOP_EXPERIENCE.farZoom,
          targetZoomRef.current +
            deltaY * DESKTOP_EXPERIENCE.wheelSensitivity,
        );
        launchIntentRef.current = 0;
      } else {
        launchIntentRef.current += deltaY;
        if (launchIntentRef.current >= DESKTOP_EXPERIENCE.launchThreshold) {
          startJump();
          return;
        }
      }
      syncPresentation();
      requestTick();
    };

    const onWheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        (event.target instanceof Element &&
          event.target.closest("input,textarea,select"))
      )
        return;
      event.preventDefault();
      const delta = normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        window.innerHeight,
      );
      feedWheel(delta);
    };

    const reset = () => {
      setPhase("inspect");
      zoomRef.current = DESKTOP_EXPERIENCE.initialZoom;
      targetZoomRef.current = DESKTOP_EXPERIENCE.initialZoom;
      launchIntentRef.current = 0;
      inspectPoseInto(poseRef.current, zoomRef.current);
      publish(0);
    };

    window.__QUACKLES_DESKTOP__ = {
      getState: state,
      reset,
      setZoom(value) {
        if (phaseRef.current !== "inspect") reset();
        targetZoomRef.current = Math.max(
          DESKTOP_EXPERIENCE.nearZoom,
          Math.min(DESKTOP_EXPERIENCE.farZoom, value),
        );
        requestTick();
      },
      triggerJump() {
        targetZoomRef.current = DESKTOP_EXPERIENCE.farZoom;
        zoomRef.current = DESKTOP_EXPERIENCE.farZoom;
        startJump();
      },
      wheel: feedWheel,
    };

    addEventListener("wheel", onWheel, { passive: false });
    inspectPoseInto(poseRef.current, zoomRef.current);
    publish(0);
    requestTick();

    return () => {
      cancelAnimationFrame(frameRef.current);
      removeEventListener("wheel", onWheel);
      delete window.__QUACKLES_DESKTOP__;
    };
  }, [poseRef, progressRef, reducedMotion]);

  return null;
}
