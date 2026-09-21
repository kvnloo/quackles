"use client";

import { useEffect, useRef } from "react";
import { useExperience } from "@/components/providers/ExperienceProvider";
import {
  DESKTOP_EXPERIENCE,
  advanceInspectZoom,
  assembledPoseInto,
  cinematicPoseInto,
  inspectPoseInto,
  normalizeWheelDelta,
  probeProgress,
  type DesktopPhase,
} from "@/lib/desktop-experience";
import { ensureProbe, publishPose } from "@/lib/probe";
import { simulatorHandoffError } from "@/lib/sim/drive";

type DesktopState = {
  phase: DesktopPhase;
  zoom: number;
  targetZoom: number;
  zoomVelocity: number;
  launchIntent: number;
  launchThreshold: number;
  phaseProgress: number;
  authority: "cinematic" | "simulator-pending";
  simReady: boolean;
  handoff: ReturnType<typeof simulatorHandoffError>;
};

declare global {
  interface Window {
    __QUACKLES_DESKTOP__?: {
      getState: () => DesktopState;
      reset: () => void;
      setZoom: (value: number) => void;
      setZoomInstant: (value: number) => void;
      triggerJump: () => void;
      wheel: (deltaY: number) => void;
    };
  }
}

export function DesktopExperienceController() {
  const { poseRef, progressRef, reducedMotion } = useExperience();
  const phaseRef = useRef<DesktopPhase>("inspect");
  const zoomRef = useRef<number>(DESKTOP_EXPERIENCE.initialZoom);
  const targetZoomRef = useRef<number>(DESKTOP_EXPERIENCE.initialZoom);
  const zoomVelocityRef = useRef(0);
  const lastInspectTickAtRef = useRef(0);
  const launchIntentRef = useRef(0);
  const phaseStartedAtRef = useRef(0);
  const phaseProgressRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>(".desktop-shell");
    const progressFill =
      document.querySelector<HTMLElement>(".desktop-shell .scroll-progress-fill");
    const phaseCopy =
      document.querySelector<HTMLElement>(".desktop-shell .desktop-phase-copy");
    const scrollCopy =
      document.querySelector<HTMLElement>(".desktop-shell .desktop-scroll-copy");

    const state = (): DesktopState => ({
      phase: phaseRef.current,
      zoom: zoomRef.current,
      targetZoom: targetZoomRef.current,
      zoomVelocity: zoomVelocityRef.current,
      launchIntent: launchIntentRef.current,
      launchThreshold: DESKTOP_EXPERIENCE.launchThreshold,
      phaseProgress: phaseProgressRef.current,
      authority:
        phaseRef.current === "sim-ready" ? "simulator-pending" : "cinematic",
      simReady: phaseRef.current === "sim-ready",
      handoff: simulatorHandoffError(poseRef.current),
    });

    const syncPresentation = () => {
      if (shell) {
        shell.dataset.phase = phaseRef.current;
        shell.style.setProperty("--desktop-zoom", String(zoomRef.current));
        const zoomT =
          (zoomRef.current - DESKTOP_EXPERIENCE.nearZoom) /
          (DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.nearZoom);
        shell.style.setProperty(
          "--desktop-inspect-scale",
          String(1.22 - Math.max(0, Math.min(1, zoomT)) * 0.3),
        );
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
      if (phaseCopy) {
        phaseCopy.textContent =
          phaseRef.current === "sim-ready"
            ? "SIM READY"
            : phaseRef.current.toUpperCase();
      }
      if (scrollCopy) {
        scrollCopy.textContent =
          phaseRef.current === "inspect"
            ? targetZoomRef.current >= DESKTOP_EXPERIENCE.farZoom - 0.001
              ? "KEEP SCROLLING DOWN TO LAUNCH"
              : "SCROLL UP TO INSPECT · DOWN TO PULL BACK"
            : phaseRef.current === "sim-ready"
              ? "CINEMATIC COMPLETE · SIMULATOR HANDOFF READY"
              : "CINEMATIC CONTROL LOCKED";
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
      zoomVelocityRef.current = 0;
      lastInspectTickAtRef.current = 0;
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
      zoomVelocityRef.current = 0;
      lastInspectTickAtRef.current = 0;
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
        const elapsed =
          lastInspectTickAtRef.current > 0
            ? now - lastInspectTickAtRef.current
            : 1000 / 60;
        lastInspectTickAtRef.current = now;

        if (reducedMotion) {
          zoomRef.current = targetZoomRef.current;
          zoomVelocityRef.current = 0;
        } else {
          const next = advanceInspectZoom(
            zoomRef.current,
            zoomVelocityRef.current,
            targetZoomRef.current,
            elapsed,
          );
          zoomRef.current = next.zoom;
          zoomVelocityRef.current = next.velocity;
        }

        inspectPoseInto(poseRef.current, zoomRef.current);
        publish(0);
        if (
          Math.abs(targetZoomRef.current - zoomRef.current) >
            DESKTOP_EXPERIENCE.zoomSettleEpsilon ||
          Math.abs(zoomVelocityRef.current) >
            DESKTOP_EXPERIENCE.zoomVelocityEpsilon
        ) {
          requestTick();
        } else {
          lastInspectTickAtRef.current = 0;
        }
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
      if (phaseRef.current !== "inspect" || deltaY === 0) return;

      // Keep the camera attached to the user's latest gesture. A critically
      // damped spring does not overshoot a fixed target, but its existing
      // velocity can still point the wrong way for a few frames after a fast
      // wheel-direction reversal. Cancel only that contradictory momentum.
      if (
        zoomVelocityRef.current !== 0 &&
        Math.sign(zoomVelocityRef.current) !== Math.sign(deltaY)
      ) {
        zoomVelocityRef.current = 0;
        lastInspectTickAtRef.current = 0;
      }

      const zoomDelta =
        Math.sign(deltaY) *
        Math.min(Math.abs(deltaY), DESKTOP_EXPERIENCE.maxWheelZoomDelta);
      if (deltaY < 0) {
        launchIntentRef.current = Math.max(
          0,
          launchIntentRef.current - Math.abs(deltaY) * 1.5,
        );
        targetZoomRef.current = Math.max(
          DESKTOP_EXPERIENCE.nearZoom,
          targetZoomRef.current +
            zoomDelta * DESKTOP_EXPERIENCE.wheelSensitivity,
        );
      } else if (
        targetZoomRef.current < DESKTOP_EXPERIENCE.farZoom - 0.001 ||
        zoomRef.current <
          DESKTOP_EXPERIENCE.farZoom - DESKTOP_EXPERIENCE.farTolerance
      ) {
        targetZoomRef.current = Math.min(
          DESKTOP_EXPERIENCE.farZoom,
          targetZoomRef.current +
            zoomDelta * DESKTOP_EXPERIENCE.wheelSensitivity,
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
      zoomVelocityRef.current = 0;
      lastInspectTickAtRef.current = 0;
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
        zoomVelocityRef.current = 0;
        lastInspectTickAtRef.current = 0;
        requestTick();
      },
      setZoomInstant(value) {
        if (phaseRef.current !== "inspect") reset();
        const next = Math.max(
          DESKTOP_EXPERIENCE.nearZoom,
          Math.min(DESKTOP_EXPERIENCE.farZoom, value),
        );
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
        zoomRef.current = next;
        targetZoomRef.current = next;
        zoomVelocityRef.current = 0;
        lastInspectTickAtRef.current = 0;
        inspectPoseInto(poseRef.current, next);
        publish(0);
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
