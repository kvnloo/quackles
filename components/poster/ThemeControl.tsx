"use client";
import { useSyncExternalStore } from "react";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { feelThemeStop } from "@/lib/feel/drive";
import { selectTheme, snapshot, subscribe } from "@/lib/sequence/store";

export function ThemeControl() {
  const theme = useSyncExternalStore(subscribe, () => snapshot().theme, () => 0);
  const nearest = Math.round(theme);
  return (
    <div
      className="theme-seg"
      role="radiogroup"
      aria-label="Studio theme"
      aria-describedby="theme-swipe-hint"
    >
      <span id="theme-swipe-hint" className="sr-only">
        Swipe the image horizontally to change color
      </span>
      <span className="theme-thumb" style={{ left: `${theme * 20}%` }} aria-hidden />
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
            // Paint chrome immediately — don't wait for sequence paint/raf.
            if (typeof document !== "undefined") {
              document.documentElement.dataset.tone = id;
            }
            selectTheme(id);
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
            selectTheme(THEME_IDS[next]);
            feelThemeStop();
            document
              .querySelector<HTMLButtonElement>(`[data-testid="theme-${THEME_IDS[next]}"]`)
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
