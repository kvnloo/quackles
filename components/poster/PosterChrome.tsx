"use client";

import { useSyncExternalStore } from "react";
import { assetPath } from "@/lib/paths";
import { getThemeSnapshot, plateWeights, subscribeTheme } from "@/lib/theme";

export function PosterPlates() {
  const t = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 0.5);
  const w = plateWeights(t);
  return (
    <div className="poster-plates" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="poster-plate"
        src={assetPath("/poster/frame-white.jpg")}
        alt=""
        style={{ opacity: w.white }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="poster-plate"
        src={assetPath("/poster/frame-cobalt.jpg")}
        alt=""
        style={{ opacity: w.cobalt }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="poster-plate"
        src={assetPath("/poster/frame-dark.jpg")}
        alt=""
        style={{ opacity: w.dark }}
      />
    </div>
  );
}

export function PosterChrome() {
  return null;
}
export function PosterMarks() {
  return null;
}
export function PosterBack() {
  return null;
}
export function PosterFront() {
  return null;
}
