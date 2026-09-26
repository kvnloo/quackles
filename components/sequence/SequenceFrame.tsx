"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { inspectionSnapshot, subscribeInspection } from "@/lib/sequence/inspection";
import { dragTheme, snapshot } from "@/lib/sequence/store";

export function SequenceFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let gesture: { id: number; x: number; y: number; theme: number; horizontal: boolean } | null = null;
    let clearDragging = 0;
    const clearThemeDragging = () => {
      window.clearTimeout(clearDragging);
      clearDragging = window.setTimeout(() => {
        delete node.dataset.themeDragging;
      }, 80);
    };
    const cancel = () => {
      const previous = gesture; gesture = null;
      if (previous?.horizontal && node.hasPointerCapture(previous.id)) node.releasePointerCapture(previous.id);
      if (previous?.horizontal) clearThemeDragging();
    };
    const inspecting = () => {
      const state = inspectionSnapshot();
      return state.zoom > 1.02 || state.targetZoom > 1.02;
    };
    const syncTouch = () => {
      const zoomed = inspecting();
      node.style.touchAction = zoomed ? "none" : "pan-y";
      document.documentElement.style.overscrollBehavior = zoomed ? "none" : "";
    };
    const down = (event: PointerEvent) => {
      if (inspecting()) return;
      if (!event.isPrimary) { cancel(); return; }
      if (event.button !== 0 || (visualViewport?.scale ?? 1) > 1.01 || (event.target instanceof Element && event.target.closest("a,button"))) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, theme: snapshot().theme, horizontal: false };
    };
    const move = (event: PointerEvent) => {
      if (inspecting()) { cancel(); return; }
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
        gesture.horizontal = true;
        node.dataset.themeDragging = "true";
        node.setPointerCapture(event.pointerId);
      }
      event.preventDefault(); dragTheme(gesture.theme - dx / (node.clientWidth * .72));
    };
    const up = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (gesture.horizontal && node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      if (gesture.horizontal) clearThemeDragging();
      gesture = null;
    };
    syncTouch();
    const unsubscribeInspection = subscribeInspection(syncTouch);
    visualViewport?.addEventListener("resize", syncTouch);
    node.addEventListener("pointerdown", down); node.addEventListener("pointermove", move, { passive: false });
    node.addEventListener("pointerup", up); node.addEventListener("pointercancel", cancel); node.addEventListener("lostpointercapture", cancel);
    return () => {
      unsubscribeInspection();
      visualViewport?.removeEventListener("resize", syncTouch);
      node.removeEventListener("pointerdown", down); node.removeEventListener("pointermove", move);
      window.clearTimeout(clearDragging);
      node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", cancel); node.removeEventListener("lostpointercapture", cancel);
    };
  }, []);
  return <div ref={ref} className="poster-frame" data-testid="scene">{children}</div>;
}
