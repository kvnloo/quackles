"use client";

import { useEffect, useState } from "react";
import { applyThemeT, themeLabel } from "@/lib/theme";

export function ThemeSlider() {
  const [t, setT] = useState(0);

  useEffect(() => {
    applyThemeT(t);
  }, [t]);

  return (
    <div className="theme-slider-wrap" data-lenis-prevent>
      <span className="theme-slider-label">{themeLabel(t)}</span>
      <input
        className="theme-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(t * 100)}
        aria-label="Studio, white to cobalt to dark"
        aria-valuetext={themeLabel(t)}
        onChange={(e) => setT(Number(e.target.value) / 100)}
      />
    </div>
  );
}
