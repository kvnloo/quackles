"use client";

import { useEffect } from "react";
import {
  advanceSpring,
  inspectionSnapshot,
  normalizedFocus,
  resetInspection,
  setInspectionState,
  wheelZoomTarget,
  type InspectionState,
} from "@/lib/sequence/inspection";
import { inspectionCrop } from "@/lib/sequence/render";
import {
  snapshot as sequenceSnapshot,
  subscribe as subscribeSequence,
} from "@/lib/sequence/store";

declare global {
  interface Window {
    __QUACKLES_INSPECTION__?: {
      getState: () => InspectionState;
      reset: () => void;
      setTarget: (zoom: number, x?: number, y?: number) => void;
    };
  }
}

function normalizedWheelDelta(event: WheelEvent) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE)
    return event.deltaY * innerHeight;
  return event.deltaY;
}

export function HeroInspection() {
  useEffect(() => {
    const frame = document.querySelector<HTMLElement>(".poster-frame");
    const camera = document.querySelector<HTMLElement>(".sequence-camera");
    if (!frame || !camera) return;

    const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
    let animation = 0;
    let lastTick = 0;
    let frameRect = frame.getBoundingClientRect();

    const updateRect = () => {
      frameRect = frame.getBoundingClientRect();
    };

    const syncFrameState = (state: InspectionState) => {
      frame.dataset.inspecting = state.active ? "true" : "false";
      frame.style.setProperty(
        "--inspection-amount",
        String(Math.max(0, state.zoom - 1)),
      );

      if (state.zoom <= 1.0005) {
        camera.style.transform = "none";
        camera.style.transformOrigin = "0 0";
        return;
      }

      const crop = inspectionCrop(state.zoom, state.focusX, state.focusY);
      const translateX = -crop.x * state.zoom * frameRect.width;
      const translateY = -crop.y * state.zoom * frameRect.height;

      camera.style.transformOrigin = "0 0";
      camera.style.transform =
        `matrix(${state.zoom}, 0, 0, ${state.zoom}, ${translateX}, ${translateY})`;
    };

    const tick = (now: number) => {
      animation = 0;
      const current = inspectionSnapshot();
      const elapsed = lastTick ? now - lastTick : 1000 / 60;
      lastTick = now;

      if (sequenceSnapshot().reducedMotion) {
        const active = current.targetZoom > 1.002;
        const next: InspectionState = {
          ...current,
          active,
          zoom: current.targetZoom,
          zoomVelocity: 0,
          focusX: active ? current.targetFocusX : 0.5,
          focusY: active ? current.targetFocusY : 0.5,
          focusVelocityX: 0,
          focusVelocityY: 0,
        };
        setInspectionState(next);
        syncFrameState(next);
        return;
      }

      const zoom = advanceSpring(
        current.zoom,
        current.zoomVelocity,
        current.targetZoom,
        elapsed,
        6.2,
      );
      const focusX = advanceSpring(
        current.focusX,
        current.focusVelocityX,
        current.targetFocusX,
        elapsed,
        3.6,
      );
      const focusY = advanceSpring(
        current.focusY,
        current.focusVelocityY,
        current.targetFocusY,
        elapsed,
        3.6,
      );

      const settled =
        Math.abs(zoom.value - current.targetZoom) < 0.0006 &&
        Math.abs(zoom.velocity) < 0.0025 &&
        Math.abs(focusX.value - current.targetFocusX) < 0.0008 &&
        Math.abs(focusY.value - current.targetFocusY) < 0.0008 &&
        Math.abs(focusX.velocity) < 0.0025 &&
        Math.abs(focusY.velocity) < 0.0025;
      const active = current.targetZoom > 1.002 || zoom.value > 1.002;

      const next: InspectionState = {
        ...current,
        active,
        zoom: active ? zoom.value : 1,
        zoomVelocity: active ? zoom.velocity : 0,
        focusX: active ? focusX.value : 0.5,
        focusY: active ? focusY.value : 0.5,
        focusVelocityX: active ? focusX.velocity : 0,
        focusVelocityY: active ? focusY.velocity : 0,
        targetFocusX: active ? current.targetFocusX : 0.5,
        targetFocusY: active ? current.targetFocusY : 0.5,
      };
      setInspectionState(next);
      syncFrameState(next);

      if (!settled || active !== current.active) {
        animation = requestAnimationFrame(tick);
      } else {
        lastTick = 0;
      }
    };

    const requestTick = () => {
      if (!animation) animation = requestAnimationFrame(tick);
    };

    const targetFocus = (clientX: number, clientY: number) =>
      normalizedFocus(clientX, clientY, frameRect);

    const atHero = () => sequenceSnapshot().progress <= 0.012;

    const enterInspection = (clientX: number, clientY: number, zoom = 1.9) => {
      const current = inspectionSnapshot();
      const focus = targetFocus(clientX, clientY);
      // Entering inspection owns the hero boundary. Reset Lenis even when the
      // DOM already reports 0 so latent story-scroll state cannot resume after
      // the inspection wheel event has been consumed.
      window.dispatchEvent(new Event("quackles:reset-story-scroll"));
      setInspectionState({
        active: true,
        targetZoom: Math.max(
          1,
          Math.min(current.maxZoom, Math.max(current.targetZoom, zoom)),
        ),
        targetFocusX: focus.x,
        targetFocusY: focus.y,
      });
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

      const current = inspectionSnapshot();
      const deltaY = normalizedWheelDelta(event);
      const entering = deltaY < 0 && atHero();

      if (!current.active && !entering) return;

      event.preventDefault();
      event.stopPropagation();

      if (entering && !current.active) {
        enterInspection(event.clientX, event.clientY, 1.25);
        return;
      }

      const focus = targetFocus(event.clientX, event.clientY);
      const targetZoom = wheelZoomTarget(
        current.targetZoom,
        deltaY,
        current.maxZoom,
      );
      const returningHome = targetZoom <= 1.003;

      setInspectionState({
        active: true,
        targetZoom: returningHome ? 1 : targetZoom,
        targetFocusX: returningHome ? 0.5 : focus.x,
        targetFocusY: returningHome ? 0.5 : focus.y,
      });
      requestTick();
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = inspectionSnapshot();
      if (
        !current.active ||
        current.targetZoom <= 1.02 ||
        event.pointerType === "touch" ||
        event.buttons ||
        !atHero()
      )
        return;

      const focus = targetFocus(event.clientX, event.clientY);
      const follow = Math.max(0.07, 0.14 / Math.sqrt(current.targetZoom));
      const targetFocusX =
        current.targetFocusX + (focus.x - current.targetFocusX) * follow;
      const targetFocusY =
        current.targetFocusY + (focus.y - current.targetFocusY) * follow;

      if (
        Math.abs(targetFocusX - current.targetFocusX) < 0.0004 &&
        Math.abs(targetFocusY - current.targetFocusY) < 0.0004
      )
        return;

      setInspectionState({ targetFocusX, targetFocusY });
      requestTick();
    };

    const onClick = (event: MouseEvent) => {
      if (
        !finePointer.matches ||
        !atHero() ||
        frame.dataset.themeDragging === "true" ||
        (event.target instanceof Element &&
          event.target.closest("a,button,input,textarea,select"))
      )
        return;

      const current = inspectionSnapshot();
      if (current.active) return;

      event.preventDefault();
      enterInspection(event.clientX, event.clientY, 2.15);
    };

    const resetTarget = () => {
      const current = inspectionSnapshot();
      if (!current.active && current.targetZoom === 1) return;
      setInspectionState({
        active: true,
        targetZoom: 1,
        targetFocusX: 0.5,
        targetFocusY: 0.5,
      });
      requestTick();
    };

    const resetImmediately = () => {
      cancelAnimationFrame(animation);
      animation = 0;
      lastTick = 0;
      resetInspection();
      syncFrameState(inspectionSnapshot());
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetTarget();
    };
    const onPointerCapabilityChange = () => {
      if (!finePointer.matches) resetImmediately();
    };
    const unsubscribeSequence = subscribeSequence(() => {
      if (sequenceSnapshot().progress > 0.006) resetImmediately();
    });

    const resizeObserver = new ResizeObserver(() => {
      updateRect();
      syncFrameState(inspectionSnapshot());
    });
    resizeObserver.observe(frame);

    window.__QUACKLES_INSPECTION__ = {
      getState: inspectionSnapshot,
      reset: resetTarget,
      setTarget(zoom, x = 0.5, y = 0.5) {
        const current = inspectionSnapshot();
        setInspectionState({
          active: zoom > 1.002,
          targetZoom: Math.max(1, Math.min(current.maxZoom, zoom)),
          targetFocusX: Math.max(0, Math.min(1, x)),
          targetFocusY: Math.max(0, Math.min(1, y)),
        });
        requestTick();
      },
    };

    syncFrameState(inspectionSnapshot());
    frame.addEventListener("wheel", onWheel, { passive: false, capture: true });
    frame.addEventListener("pointermove", onPointerMove, { passive: true });
    frame.addEventListener("click", onClick);
    addEventListener("keydown", onKeyDown);
    finePointer.addEventListener("change", onPointerCapabilityChange);

    return () => {
      cancelAnimationFrame(animation);
      resizeObserver.disconnect();
      unsubscribeSequence();
      frame.removeEventListener("wheel", onWheel, { capture: true });
      frame.removeEventListener("pointermove", onPointerMove);
      frame.removeEventListener("click", onClick);
      removeEventListener("keydown", onKeyDown);
      finePointer.removeEventListener("change", onPointerCapabilityChange);
      delete window.__QUACKLES_INSPECTION__;
      resetInspection();
      delete frame.dataset.inspecting;
      frame.style.removeProperty("--inspection-amount");
      camera.style.transform = "none";
      camera.style.transformOrigin = "0 0";
    };
  }, []);

  return null;
}
