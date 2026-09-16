"use client";
import { useEffect, useState } from "react";
import {
  applyThemeT,
  DEFAULT_THEME_ID,
  DEFAULT_THEME_T,
  selectTheme,
  THEME_STATES,
  type ThemeStateId,
} from "@/lib/theme";
export function ThemeControl() {
  const [active, setActive] = useState<ThemeStateId>(DEFAULT_THEME_ID);
  useEffect(() => applyThemeT(DEFAULT_THEME_T), []);
  return (
    <div className="theme-seg" role="radiogroup" aria-label="Scene color">
      <span className="theme-label" aria-hidden>
        STUDIO
      </span>
      {THEME_STATES.map((state) => (
        <button
          key={state.id}
          type="button"
          role="radio"
          aria-checked={state.id === active}
          data-testid={`theme-${state.id}`}
          className="theme-seg-btn"
          onClick={() => {
            setActive(state.id);
            selectTheme(state.id);
          }}
        >
          <i className={`swatch swatch-${state.id}`} />
          {state.label}
        </button>
      ))}
    </div>
  );
}
