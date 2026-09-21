"use client";

import { useRef, useSyncExternalStore } from "react";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { feelThemeStop } from "@/lib/feel/drive";
import {
  dragTheme,
  selectTheme,
  snapshot,
  subscribe,
} from "@/lib/sequence/store";
import { animateThemeTo, applyThemeT } from "@/lib/theme";

const LIVE_THEME_TARGETS = [0, 0, 0.5, 1, 1] as const;

function liveThemeForSequence(value: number) {
  const t = Math.max(0, Math.min(4, value));
  if (t <= 1) return 0;
  if (t <= 2) return (t - 1) * 0.5;
  if (t <= 3) return 0.5 + (t - 2) * 0.5;
  return 1;
}

function selectEverywhere(index: number) {
  selectTheme(THEME_IDS[index]);
  animateThemeTo(LIVE_THEME_TARGETS[index]);
}

export function ThemeControl() {
  const railRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const theme = useSyncExternalStore(subscribe, () => snapshot().theme, () => 2);
  const nearest = Math.round(theme);

  const dragAt = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const value =
      ((clientX - rect.left) / Math.max(1, rect.width)) *
      (THEME_IDS.length - 1);
    const next = Math.max(0, Math.min(4, value));
    dragTheme(next);
    applyThemeT(liveThemeForSequence(next));
  };

  return (
    <div
      ref={railRef}
      className="theme-seg"
      role="radiogroup"
      aria-label="Studio theme"
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragAt(event.clientX);
      }}
      onPointerMove={(event) => {
        if (!draggingRef.current) return;
        dragAt(event.clientX);
      }}
      onPointerUp={(event) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        const target = Math.round(snapshot().theme);
        selectEverywhere(target);
        feelThemeStop();
      }}
      onPointerCancel={() => {
        draggingRef.current = false;
      }}
    >
      <span
        className="theme-thumb"
        style={{ left: `${theme * 20}%` }}
        aria-hidden
      />
      {THEME_IDS.map((id, index) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={index === nearest}
          tabIndex={index === nearest ? 0 : -1}
          data-testid={`theme-${id}`}
          className="theme-seg-btn"
          onClick={() => {
            selectEverywhere(index);
            feelThemeStop();
          }}
          onKeyDown={(event) => {
            const offset =
              event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowLeft" || event.key === "ArrowUp"
                  ? -1
                  : 0;
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 4
                  : (index + offset + 5) % 5;
            if (!offset && event.key !== "Home" && event.key !== "End") return;
            event.preventDefault();
            selectEverywhere(next);
            feelThemeStop();
            document
              .querySelector<HTMLButtonElement>(
                `[data-testid="theme-${THEME_IDS[next]}"]`,
              )
              ?.focus();
          }}
        >
          <i className={`swatch swatch-${id}`} aria-hidden />
          {id[0].toUpperCase() + id.slice(1)}
        </button>
      ))}
    </div>
  );
}
