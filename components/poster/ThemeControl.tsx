"use client";
import { useSyncExternalStore } from "react";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { feelThemeStop } from "@/lib/feel/drive";
import { selectLiveTheme } from "@/lib/sequence/live-theme";
import { snapshot, subscribe } from "@/lib/sequence/store";
import { PREVIEW } from "@/lib/preview";
import { previewStartTheme, previewThemeIndices } from "@/lib/sequence/preview-policy";

/** Buttons for the preview's scenes only (production: all five). Hidden for a single scene. */
const INDICES = previewThemeIndices(PREVIEW);
const SHOWN = PREVIEW.scenes !== "mushroom" && INDICES.length > 1;
const CONTIGUOUS = INDICES.every((index, i) => index === INDICES[0] + i);

/** Slot position (0..n-1) of a possibly-fractional theme index among the shown buttons. */
function slotOf(theme: number) {
  if (CONTIGUOUS) return theme - INDICES[0];
  for (let i = 0; i < INDICES.length - 1; i++) {
    if (theme <= INDICES[i + 1]) return i + Math.max(0, theme - INDICES[i]) / (INDICES[i + 1] - INDICES[i]);
  }
  return INDICES.length - 1;
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, () => snapshot().presented, () => previewStartTheme(PREVIEW));
  if (!SHOWN) return null;
  const nearest = Math.round(theme), count = INDICES.length, full = count === THEME_IDS.length;
  return <div className="theme-seg" role="radiogroup" aria-label="Studio theme" style={full ? undefined : { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
    <span className="theme-thumb" style={full ? { left: `${theme * 20}%` } : { left: `${slotOf(theme) * 100 / count}%`, width: `${100 / count}%` }} aria-hidden />
    {INDICES.map((index, slot) => {
      const id = THEME_IDS[index];
      return <button
        key={id}
        type="button"
        role="radio"
        aria-checked={index === nearest}
        tabIndex={index === nearest ? 0 : -1}
        data-testid={`theme-${id}`}
        className="theme-seg-btn"
        onClick={() => { selectLiveTheme(index); feelThemeStop(); }}
        onKeyDown={(event) => {
          const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
          const nextSlot = event.key === "Home" ? 0 : event.key === "End" ? count - 1 : (slot + offset + count) % count;
          if (!offset && event.key !== "Home" && event.key !== "End") return;
          const next = INDICES[nextSlot];
          event.preventDefault(); selectLiveTheme(next); feelThemeStop();
          document.querySelector<HTMLButtonElement>(`[data-testid="theme-${THEME_IDS[next]}"]`)?.focus();
        }}
      ><i className={`swatch swatch-${id}`} aria-hidden />{id[0].toUpperCase() + id.slice(1)}</button>;
    })}
  </div>;
}
