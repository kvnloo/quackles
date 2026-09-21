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
import { snapshot as sequenceSnapshot, subscribe as subscribeSequence } from "@/lib/sequence/store";

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

    const syncFrameState = (state: InspectionState) => {
      frame.dataset.inspecting = state.active ? "true" : "false";
      frame.style.setProperty(
        "--inspection-amount",
        String(Math.max(0, state.zoom - 1)),
      );
      camera.style.transformOrigin =
        `${state.focusX * 100}% ${state.focusY * 100}%`;
      camera.style.transform =
        state.zoom > 1.0005 ? `scale(${state.zoom})` : "none";
    };

    const tick = (now: number) => {
      animation = 0;
      const current = inspectionSnapshot();
      const elapsed = lastTick ? now - lastTick : 1000 / 60;
      lastTick = now;

      if (sequenceSnapshot().reducedMotion) {
        const active = current.targetZoom > 1.002;
        const next = {
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
        8.8,
      );
      const focusX = advanceSpring(
        current.focusX,
        current.focusVelocityX,
        current.targetFocusX,
        elapsed,
        5.8,
      );
      const focusY = advanceSpring(
        current.focusY,
        current.focusVelocityY,
        current.targetFocusY,
        elapsed,
        5.8,
      );

      const settled =
        Math.abs(zoom.value - current.targetZoom) < 0.0006 &&
        Math.abs(zoom.velocity) < 0.003 &&
        Math.abs(focusX.value - current.targetFocusX) < 0.0008 &&
        Math.abs(focusY.value - current.targetFocusY) < 0.0008 &&
        Math.abs(focusX.velocity) < 0.003 &&
        Math.abs(focusY.velocity) < 0.003;
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
      normalizedFocus(clientX, clientY, frame.getBoundingClientRect());

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
      const atHero =
        sequenceSnapshot().progress <= 0.002 && window.scrollY <= 2;

      // Wheel-up at the loaded hero enters product inspection. Once active,
      // wheel-down is consumed until the camera returns to 1x; the next
      // downward gesture is then free to begin the normal story scroll.
      const entering = deltaY < 0 && atHero;
      if (!current.active && !entering) return;

      event.preventDefault();
      event.stopPropagation();

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
      if (!current.active || event.pointerType === "touch" || event.buttons)
        return;
      const focus = targetFocus(event.clientX, event.clientY);
      setInspectionState({
        targetFocusX: focus.x,
        targetFocusY: focus.y,
      });
      requestTick();
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

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetTarget();
    };
    const onPointerCapabilityChange = () => {
      if (!finePointer.matches) resetTarget();
    };
    const unsubscribeSequence = subscribeSequence(() => {
      if (sequenceSnapshot().progress > 0.01) resetTarget();
    });

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
    addEventListener("keydown", onKeyDown);
    finePointer.addEventListener("change", onPointerCapabilityChange);

    return () => {
      cancelAnimationFrame(animation);
      unsubscribeSequence();
      frame.removeEventListener("wheel", onWheel, { capture: true });
      frame.removeEventListener("pointermove", onPointerMove);
      removeEventListener("keydown", onKeyDown);
      finePointer.removeEventListener("change", onPointerCapabilityChange);
      delete window.__QUACKLES_INSPECTION__;
      resetInspection();
      delete frame.dataset.inspecting;
      frame.style.removeProperty("--inspection-amount");
      camera.style.transform = "none";
      camera.style.transformOrigin = "50% 50%";
    };
  }, []);

  return null;
}
