"use client";
import { useSyncExternalStore } from "react";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { feelThemeStop } from "@/lib/feel/drive";
import { selectTheme, snapshot, subscribe } from "@/lib/sequence/store";
import { animateThemeTo } from "@/lib/theme";

// The current live-R3F lighting model has three calibrated anchor states.
// Map the five authored sequence themes onto those anchors without teaching the
// sequence layer about the live renderer.
const LIVE_THEME_TARGETS = [0, 0, 0.5, 1, 1] as const;

function selectEverywhere(index: number) {
  selectTheme(THEME_IDS[index]);
  animateThemeTo(LIVE_THEME_TARGETS[index]);
}

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, () => snapshot().theme, () => 2);
  const nearest = Math.round(theme);
  return <div className="theme-seg" role="radiogroup" aria-label="Studio theme">
    <span className="theme-thumb" style={{ left: `${theme * 20}%` }} aria-hidden />
    {THEME_IDS.map((id, index) => <button
      key={id}
      type="button"
      role="radio"
      aria-checked={index === nearest}
      tabIndex={index === nearest ? 0 : -1}
      data-testid={`theme-${id}`}
      className="theme-seg-btn"
      onClick={() => { selectEverywhere(index); feelThemeStop(); }}
      onKeyDown={(event) => {
        const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        const next = event.key === "Home" ? 0 : event.key === "End" ? 4 : (index + offset + 5) % 5;
        if (!offset && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault(); selectEverywhere(next); feelThemeStop();
        document.querySelector<HTMLButtonElement>(`[data-testid="theme-${THEME_IDS[next]}"]`)?.focus();
      }}
    ><i className={`swatch swatch-${id}`} aria-hidden />{id[0].toUpperCase() + id.slice(1)}</button>)}
  </div>;
}
