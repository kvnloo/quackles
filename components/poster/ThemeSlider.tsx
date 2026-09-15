"use client";

import { useExperience } from "@/components/providers/ExperienceProvider";
import { themeLabel } from "@/lib/theme";

export function ThemeSlider() {
  const { themeT, setThemeT } = useExperience();
  const label = themeLabel(themeT);

  return (
    <div
      data-lenis-prevent
      className="theme-slider-wrap pointer-events-auto"
    >
      <div className="flex items-center justify-between px-1">
        <span>White</span>
        <span className="text-[color:var(--cobalt)]">{label}</span>
        <span>Dark</span>
      </div>
      <input
        className="theme-slider"
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(themeT * 100)}
        aria-label="Paper theme, white to poster blue to dark"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(themeT * 100)}
        aria-valuetext={label}
        list="theme-stops"
        onChange={(e) => setThemeT(Number(e.target.value) / 100)}
      />
      <datalist id="theme-stops">
        <option value="0" label="White" />
        <option value="50" label="Poster" />
        <option value="100" label="Dark" />
      </datalist>
    </div>
  );
}
