"use client";
import { useRef, useSyncExternalStore } from "react";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { dragTheme, selectTheme, snapshot, subscribe } from "@/lib/sequence/store";

function themeFromX(node: HTMLElement, clientX: number) {
  const rect = node.getBoundingClientRect();
  if (rect.width <= 0) return snapshot().theme;
  return Math.max(0, Math.min(4, ((clientX - rect.left) / rect.width) * 4));
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, () => snapshot().theme, () => 2);
  const drag = useRef<{ id: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const nearest = Math.round(theme);
  return <div
    className="theme-seg"
    role="slider"
    aria-label="Studio theme"
    aria-valuemin={0}
    aria-valuemax={4}
    aria-valuenow={Number(theme.toFixed(3))}
    aria-valuetext={THEME_IDS[nearest]}
    onPointerDown={(event) => {
      if (event.button !== 0 || !event.isPrimary) return;
      drag.current = { id: event.pointerId, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
      dragTheme(themeFromX(event.currentTarget, event.clientX));
    }}
    onPointerMove={(event) => {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      if (Math.abs(event.movementX) > 0 || Math.abs(event.movementY) > 0) drag.current.moved = true;
      dragTheme(themeFromX(event.currentTarget, event.clientX));
    }}
    onPointerUp={(event) => {
      if (!drag.current || event.pointerId !== drag.current.id) return;
      const moved = drag.current.moved;
      drag.current = null;
      skipClick.current = moved;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
  >
    <span className="theme-thumb" style={{ left: `${theme * 20}%` }} aria-hidden />
    {THEME_IDS.map((id, index) => <button
      key={id}
      type="button"
      role="radio"
      aria-checked={index === nearest}
      tabIndex={index === nearest ? 0 : -1}
      data-testid={`theme-${id}`}
      className="theme-seg-btn"
      onClick={(event) => {
        if (skipClick.current) { skipClick.current = false; event.preventDefault(); return; }
        selectTheme(id);
      }}
      onKeyDown={(event) => {
        const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        const next = event.key === "Home" ? 0 : event.key === "End" ? 4 : (index + offset + 5) % 5;
        if (!offset && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault(); selectTheme(THEME_IDS[next]);
        document.querySelector<HTMLButtonElement>(`[data-testid="theme-${THEME_IDS[next]}"]`)?.focus();
      }}
    ><i className={`swatch swatch-${id}`} aria-hidden />{id[0].toUpperCase() + id.slice(1)}</button>)}
  </div>;
}
