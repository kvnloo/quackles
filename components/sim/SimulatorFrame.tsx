"use client";

import { useState } from "react";
import { TRY_MICRODUCK, TRY_MICRODUCK_HOME, playMorph, PRELOAD_AT } from "@/lib/sim/morph";
import { useExperience } from "@/components/providers/ExperienceProvider";

export function SimulatorFrame() {
  const { progress, reducedMotion } = useExperience();
  const morph = playMorph(progress);
  const shouldLoad = progress > PRELOAD_AT || reducedMotion;
  const [failed, setFailed] = useState(false);
  const interactive = morph > 0.42;

  const t = reducedMotion ? (progress > 0.82 ? 1 : 0) : morph;
  const left = (1 - t) * 42;
  const top = (1 - t) * 14;
  const right = (1 - t) * 5;
  const bottom = (1 - t) * 16;
  const radius = (1 - t) * 28;

  return (
    <div
      className="fixed z-[5] overflow-hidden bg-[#f3efe3] transition-[opacity,box-shadow] duration-500"
      style={{
        opacity: t > 0.02 ? 1 : 0,
        top: `${top}vh`,
        right: `${right}vw`,
        bottom: `${bottom}vh`,
        left: `${left}vw`,
        borderRadius: `${radius}px`,
        pointerEvents: interactive ? "auto" : "none",
        boxShadow:
          t > 0.08 && t < 0.97
            ? "0 24px 80px rgba(0,0,0,0.45)"
            : "none",
      }}
      aria-hidden={t < 0.08}
    >
      {shouldLoad && !failed ? (
        <iframe
          data-lenis-prevent
          title="Try Micro Duck — official MuJoCo physics and RL policies"
          src={TRY_MICRODUCK}
          className="h-full w-full border-0 bg-[#f3efe3]"
          allow="camera; gamepad; autoplay; fullscreen; clipboard-read; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#f3efe3] px-6">
          <a
            href={TRY_MICRODUCK_HOME}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-black/20 bg-white/80 px-5 py-4 text-sm text-[#1a1714]"
          >
            Open Try Micro Duck
          </a>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-10 right-4 z-10 hidden max-w-xs rounded-xl border border-black/10 bg-[#f3efe3]/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#5c5346] backdrop-blur-md md:block">
        Try Micro Duck · official physics · camera stays on your device
      </div>
    </div>
  );
}
