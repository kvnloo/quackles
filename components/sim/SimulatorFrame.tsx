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
  const left = (1 - t) * 38;
  const top = (1 - t) * 16;
  const right = (1 - t) * 6;
  const bottom = (1 - t) * 18;
  const radius = (1 - t) * 28;

  return (
    <div
      className="absolute z-[28] overflow-hidden bg-[#efe8dc] transition-[opacity,box-shadow] duration-500"
      style={{
        opacity: t > 0.02 ? 1 : 0,
        visibility: t > 0.02 ? "visible" : "hidden",
        top: `${top}%`,
        right: `${right}%`,
        bottom: `${bottom}%`,
        left: `${left}%`,
        borderRadius: `${radius}px`,
        pointerEvents: interactive ? "auto" : "none",
        boxShadow: t > 0.08 && t < 0.97 ? "0 24px 80px rgb(22 32 74 / 0.28)" : "none",
      }}
      aria-hidden={t < 0.08}
    >
      {shouldLoad && !failed ? (
        <iframe
          data-lenis-prevent
          title="Try Micro Duck — official MuJoCo physics and RL policies"
          src={TRY_MICRODUCK}
          className="h-full w-full border-0 bg-[#efe8dc]"
          allow="camera; gamepad; autoplay; fullscreen; clipboard-read; clipboard-write"
          referrerPolicy="no-referrer-when-downgrade"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#efe8dc] px-6">
          <a
            href={TRY_MICRODUCK_HOME}
            target="_blank"
            rel="noreferrer"
            className="border border-[color:var(--cobalt)] bg-[color:var(--paper)] px-4 py-3 font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--cobalt)]"
          >
            Open Try Micro Duck
          </a>
        </div>
      )}
    </div>
  );
}
