"use client";

import { useSyncExternalStore } from "react";
import { POSTER } from "@/lib/poster";
import { assetPath } from "@/lib/paths";
import { getThemeSnapshot, plateWeights, subscribeTheme } from "@/lib/theme";

function Globe() {
  return (
    <svg viewBox="0 0 64 64" className="poster-globe-icon" aria-hidden>
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <ellipse cx="32" cy="32" rx="8" ry="19" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M13 32h38M17 22h30M17 42h30" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function PosterPlates() {
  const t = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => 0);
  const w = plateWeights(t);
  return (
    <div className="poster-plates" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="poster-plate" src={assetPath("/poster/frame-white.jpg")} alt="" style={{ opacity: w.white }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="poster-plate" src={assetPath("/poster/frame-cobalt.jpg")} alt="" style={{ opacity: w.cobalt }} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="poster-plate" src={assetPath("/poster/frame-dark.jpg")} alt="" style={{ opacity: w.dark }} />
    </div>
  );
}

export function PosterMarks() {
  return (
    <div className="poster-marks" aria-hidden>
      <p className="poster-right-stamp">
        {POSTER.rightStamp.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </p>
      <div className="poster-globe">
        <Globe />
        <p>
          {POSTER.globeCaption.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
      </div>
      <div className="poster-plinth-copy">
        <p className="poster-plinth-title">
          {POSTER.plinth[0]}
          <br />
          {POSTER.plinth[1]}
        </p>
        <span className="poster-plinth-rule" />
        <p className="poster-plinth-sub">
          Pollen
          <br />
          Robotics
        </p>
      </div>
      <div className="poster-footer-copy">
        <p>
          {POSTER.footer.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
        <p className="poster-year">{`//  ${POSTER.year}`}</p>
      </div>
    </div>
  );
}
