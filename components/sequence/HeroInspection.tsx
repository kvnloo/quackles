"use client";

import { useEffect } from "react";
import { settleCamera, shouldKeepTicking } from "@/lib/sequence/camera-settle";
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
import { flickFocusTarget, flickPixelsPerSecond } from "@/lib/sequence/motion-quality";
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
      if (pan) return;
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
          cameraMoving: false,
        };
        if (pan) return;
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

      // settled (loose, unchanged) drives cameraMoving/sharp-lock; the spring keeps converging invisibly and snaps exactly when converged (camera-settle.ts).
      const arrived = settleCamera(
        { zoom: zoom.value, focusX: focusX.value, focusY: focusY.value, zoomV: zoom.velocity, fxV: focusX.velocity, fyV: focusY.velocity },
        { zoom: current.targetZoom, fx: current.targetFocusX, fy: current.targetFocusY },
      );
      const settled = arrived.settled;
      const active = current.targetZoom > 1.002 || zoom.value > 1.002;

      const next: InspectionState = {
        ...current,
        active,
        zoom: active ? arrived.zoom : 1,
        zoomVelocity: active ? arrived.zoomV : 0,
        focusX: active ? Math.min(1, Math.max(0, arrived.focusX)) : 0.5,
        focusY: active ? Math.min(1, Math.max(0, arrived.focusY)) : 0.5,
        focusVelocityX: active && arrived.focusX > 0 && arrived.focusX < 1 ? arrived.fxV : 0,
        focusVelocityY: active && arrived.focusY > 0 && arrived.focusY < 1 ? arrived.fyV : 0,
        targetFocusX: active ? current.targetFocusX : 0.5,
        targetFocusY: active ? current.targetFocusY : 0.5,
        cameraMoving: active && !settled,
      };
      if (pan) return;
      setInspectionState(next);
      syncFrameState(next);

      if (shouldKeepTicking({ active, settled, converged: arrived.converged, activeChanged: active !== current.active })) {
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

    const claimHeroBoundary = () => {
      window.dispatchEvent(new Event("quackles:reset-story-scroll"));
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };

    const enterInspection = (clientX: number, clientY: number, zoom = 1.9) => {
      const current = inspectionSnapshot();
      const focus = targetFocus(clientX, clientY);
      claimHeroBoundary();
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

    // Gesture latch at the hero boundary: reverse-scroll momentum that brings the
    // story home must not flow into inspection zoom; inspection only takes a
    // wheel-up after a short input gap (a new gesture). Trackpad inertia may need
    // 240-400 ms; tune on real hardware.
    let storyMovedAt = -Infinity;
    let lastProgress = sequenceSnapshot().progress;
    const LATCH_MS = 240;
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

      if (entering && !current.active) {
        const now = performance.now();
        // Same continuous gesture that just brought the story home: let the
        // scroll kernel consume it (it clamps at 0) instead of zooming.
        if (now - storyMovedAt < LATCH_MS) { storyMovedAt = now; return; }
      }
      if (!current.active && !entering) return;

      event.preventDefault();
      event.stopPropagation();

      if (entering && !current.active) {
        enterInspection(event.clientX, event.clientY, 1.25);
        return;
      }

      const focus = targetFocus(event.clientX, event.clientY);
      // A wheel that opposes where the zoom is heading (target still ahead of
      // the spring, or spring momentum) reverses from the zoom the user SEES:
      // rebase on the current zoom and drop the momentum. Otherwise a zoom-out
      // during a zoom-in catch-up only trims a stale target and keeps zooming in
      // (donor idea: fix/scroll-zoom-reversal-attach a0e0825).
      const heading = Math.sign(current.targetZoom - current.zoom) || Math.sign(current.zoomVelocity);
      const contradicts = heading !== 0 && deltaY !== 0 && heading !== -Math.sign(deltaY);
      const targetZoom = wheelZoomTarget(
        contradicts ? current.zoom : current.targetZoom,
        deltaY,
        current.maxZoom,
      );
      const returningHome = targetZoom <= 1.003;

      setInspectionState({
        ...(contradicts ? { zoomVelocity: 0 } : {}),
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

    const onScroll = () => {
      const current = inspectionSnapshot();
      if (!current.active || current.targetZoom <= 1.002) return;
      if (window.scrollY !== 0 || sequenceSnapshot().progress > 0) {
        claimHeroBoundary();
      }
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
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: {
      distance: number;
      zoom: number;
      sourceX: number;
      sourceY: number;
    } | null = null;
    const tracked = () => [...pointers.values()];
    let pan: { x: number; y: number; focusX: number; focusY: number; zoom: number; pendingX: number; pendingY: number; samples: { t: number; x: number; y: number }[] } | null = null;
    const onPinchDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || !atHero()) return;
      if (
        event.target instanceof Element &&
        event.target.closest("a,button,input,textarea,select")
      )
        return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size < 2) {
        const current = inspectionSnapshot();
        if (current.targetZoom > 1.02) {
          pan = {
            x: event.clientX,
            y: event.clientY,
            focusX: current.targetFocusX,
            focusY: current.targetFocusY,
            zoom: current.targetZoom,
            pendingX: current.targetFocusX,
            pendingY: current.targetFocusY,
            samples: [{ t: performance.now(), x: event.clientX, y: event.clientY }],
          };
          try { frame.setPointerCapture(event.pointerId); } catch { /* already released */ }
          cancelAnimationFrame(animation);
          animation = 0;
          lastTick = 0;
        }
        return;
      }
      pan = null;
      updateRect();
      const current = inspectionSnapshot();
      const [a, b] = tracked();
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const fx = (midX - frameRect.left) / Math.max(1, frameRect.width);
      const fy = (midY - frameRect.top) / Math.max(1, frameRect.height);
      const crop = inspectionCrop(
        Math.max(current.zoom, 1),
        current.focusX,
        current.focusY,
      );
      pinch = {
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        zoom: Math.max(current.targetZoom, 1),
        sourceX: crop.x + fx * crop.width,
        sourceY: crop.y + fy * crop.height,
      };
      claimHeroBoundary();
      try { frame.setPointerCapture(event.pointerId); } catch { /* already released */ }
    };
    const onPinchMove = (event: PointerEvent) => {
      const point = pointers.get(event.pointerId);
      if (!point) return;
      point.x = event.clientX;
      point.y = event.clientY;
      if (pointers.size < 2) {
        if (!pan) return;
        event.preventDefault();
        updateRect();
        const zoom = pan.zoom;
        const span = 1 / zoom;
        const cropX = Math.max(0, Math.min(1 - span, (pan.focusX * (zoom - 1)) / zoom - (event.clientX - pan.x) / Math.max(1, frameRect.width) * span));
        const cropY = Math.max(0, Math.min(1 - span, (pan.focusY * (zoom - 1)) / zoom - (event.clientY - pan.y) / Math.max(1, frameRect.height) * span));
        const focusX = (cropX * zoom) / (zoom - 1);
        const focusY = (cropY * zoom) / (zoom - 1);
        pan.pendingX = focusX;
        pan.pendingY = focusY;
        pan.samples.push({ t: performance.now(), x: event.clientX, y: event.clientY });
        if (pan.samples.length > 8) pan.samples.shift();
        const moved = Math.hypot(event.clientX - pan.x, event.clientY - pan.y) > 2;
        syncFrameState({
          ...inspectionSnapshot(),
          active: true,
          zoom,
          targetZoom: zoom,
          focusX,
          focusY,
          targetFocusX: focusX,
          targetFocusY: focusY,
          cameraMoving: moved,
        });
        return;
      }
      pan = null;
      if (!pinch) return;
      event.preventDefault();
      const [a, b] = tracked();
      const current = inspectionSnapshot();
      const zoom = Math.max(
        1,
        Math.min(
          current.maxZoom,
          pinch.zoom *
            (Math.hypot(a.x - b.x, a.y - b.y) / pinch.distance),
        ),
      );
      updateRect();
      const fx = Math.max(
        0,
        Math.min(1, ((a.x + b.x) / 2 - frameRect.left) / Math.max(1, frameRect.width)),
      );
      const fy = Math.max(
        0,
        Math.min(1, ((a.y + b.y) / 2 - frameRect.top) / Math.max(1, frameRect.height)),
      );
      const span = 1 / zoom;
      const cropX = Math.max(0, Math.min(1 - span, pinch.sourceX - fx * span));
      const cropY = Math.max(0, Math.min(1 - span, pinch.sourceY - fy * span));
      setInspectionState({
        active: zoom > 1.002,
        targetZoom: zoom,
        targetFocusX: zoom <= 1.001 ? 0.5 : (cropX * zoom) / (zoom - 1),
        targetFocusY: zoom <= 1.001 ? 0.5 : (cropY * zoom) / (zoom - 1),
      });
      requestTick();
    };
    const onPinchEnd = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size && pan) {
        const now = performance.now();
        const reduced = sequenceSnapshot().reducedMotion;
        const flickX = reduced ? { focus: pan.pendingX, velocity: 0 } : flickFocusTarget({
          focus: pan.pendingX,
          zoom: pan.zoom,
          framePx: frameRect.width,
          pixelsPerSecond: flickPixelsPerSecond(pan.samples.map((sample) => ({ t: sample.t, p: sample.x })), now),
        });
        const flickY = reduced ? { focus: pan.pendingY, velocity: 0 } : flickFocusTarget({
          focus: pan.pendingY,
          zoom: pan.zoom,
          framePx: frameRect.height,
          pixelsPerSecond: flickPixelsPerSecond(pan.samples.map((sample) => ({ t: sample.t, p: sample.y })), now),
        });
        const coast = Math.hypot(flickX.velocity, flickY.velocity) > 0.05;
        const placed = {
          ...inspectionSnapshot(),
          active: pan.zoom > 1.02,
          zoom: pan.zoom,
          targetZoom: pan.zoom,
          zoomVelocity: 0,
          focusX: pan.pendingX,
          focusY: pan.pendingY,
          targetFocusX: flickX.focus,
          targetFocusY: flickY.focus,
          focusVelocityX: flickX.velocity,
          focusVelocityY: flickY.velocity,
          cameraMoving: coast,
        };
        setInspectionState(placed);
        syncFrameState(placed);
        pan = null;
        if (coast) requestTick();
      }
    };


    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetTarget();
    };
    const unsubscribeSequence = subscribeSequence(() => {
      const progress = sequenceSnapshot().progress;
      // Only real story motion arms the latch (theme animations also publish).
      if (progress !== lastProgress && Math.max(progress, lastProgress) > 0.0005) storyMovedAt = performance.now();
      lastProgress = progress;
      if (progress > 0.006) resetImmediately();
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
    frame.addEventListener("pointerdown", onPinchDown);
    frame.addEventListener("pointermove", onPointerMove, { passive: true });
    frame.addEventListener("pointermove", onPinchMove, { passive: false });
    frame.addEventListener("pointerup", onPinchEnd);
    frame.addEventListener("pointercancel", onPinchEnd);
    frame.addEventListener("click", onClick);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("keydown", onKeyDown);

    return () => {
      cancelAnimationFrame(animation);
      resizeObserver.disconnect();
      unsubscribeSequence();
      frame.removeEventListener("wheel", onWheel, { capture: true });
      frame.removeEventListener("pointerdown", onPinchDown);
      frame.removeEventListener("pointermove", onPointerMove);
      frame.removeEventListener("pointermove", onPinchMove);
      frame.removeEventListener("pointerup", onPinchEnd);
      frame.removeEventListener("pointercancel", onPinchEnd);
      frame.removeEventListener("click", onClick);
      removeEventListener("scroll", onScroll);
      removeEventListener("keydown", onKeyDown);
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
