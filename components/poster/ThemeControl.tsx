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

  useEffect(() => {
    applyThemeT(DEFAULT_THEME_T);
  }, []);

  return (
    <div className="theme-seg-wrap" data-lenis-prevent>
      <div className="theme-seg" role="radiogroup" aria-label="Studio finish">
        {THEME_STATES.map((state) => {
          const checked = state.id === active;
          return (
            <button
              key={state.id}
              type="button"
              role="radio"
              aria-checked={checked}
              className="theme-seg-btn"
              onClick={() => {
                setActive(state.id);
                selectTheme(state.id);
              }}
            >
              {state.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Compat name for the old range slider. */
export const ThemeSlider = ThemeControl;
