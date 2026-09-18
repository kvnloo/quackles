"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { dragTheme, snapshot } from "@/lib/sequence/store";

export function SequenceFrame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let gesture: { id: number; x: number; y: number; theme: number; horizontal: boolean } | null = null;
    const cancel = () => {
      const previous = gesture; gesture = null;
      if (previous?.horizontal && node.hasPointerCapture(previous.id)) node.releasePointerCapture(previous.id);
    };
    const zoom = () => {
      const zoomed = (visualViewport?.scale ?? 1) > 1.01;
      if (zoomed) cancel();
      node.style.touchAction = zoomed ? "auto" : "pan-y pinch-zoom";
    };
    const hint = node.querySelector<HTMLElement>(".swipe-hint");
    const hideHint = () => {
      if (!hint || hint.hidden) return;
      hint.hidden = true;
      try { sessionStorage.setItem("quackles-swipe-hint", "1"); } catch { /* private mode */ }
    };
    try { if (sessionStorage.getItem("quackles-swipe-hint")) hideHint(); } catch { /* */ }
    const hintTimer = window.setTimeout(hideHint, 7000);
    const down = (event: PointerEvent) => {
      if (!event.isPrimary) { cancel(); return; }
      if (event.button !== 0 || (visualViewport?.scale ?? 1) > 1.01 || (event.target instanceof Element && event.target.closest("a,button"))) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, theme: snapshot().theme, horizontal: false };
    };
    const move = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
      if (!gesture.horizontal) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { gesture = null; return; }
        if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
        gesture.horizontal = true; node.setPointerCapture(event.pointerId);
      }
      event.preventDefault(); dragTheme(gesture.theme - dx / (node.clientWidth * .72));
    };
    const up = (event: PointerEvent) => {
      if (!gesture || event.pointerId !== gesture.id) return;
      if (gesture.horizontal) hideHint();
      if (gesture.horizontal && node.hasPointerCapture(event.pointerId)) node.releasePointerCapture(event.pointerId);
      gesture = null;
    };
    zoom(); visualViewport?.addEventListener("resize", zoom);
    node.addEventListener("pointerdown", down); node.addEventListener("pointermove", move, { passive: false });
    node.addEventListener("pointerup", up); node.addEventListener("pointercancel", cancel); node.addEventListener("lostpointercapture", cancel);
    return () => {
      window.clearTimeout(hintTimer);
      visualViewport?.removeEventListener("resize", zoom);
      node.removeEventListener("pointerdown", down); node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", cancel); node.removeEventListener("lostpointercapture", cancel);
    };
  }, []);
  return <div ref={ref} className="poster-frame" data-testid="scene">
    {children}
    <p className="swipe-hint" aria-hidden>swipe to change</p>
  </div>;
}
