"use client";

import { useEffect, useState } from "react";
import { LINKS } from "@/lib/story";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { cn } from "@/lib/utils";

const SIM_SRC = "https://pollen-robotics-microduck-simulator.hf.space/?boot=1";

export function SimulatorFrame() {
  const { progress, reducedMotion } = useExperience();
  const morph = Math.min(1, Math.max(0, (progress - 0.78) / 0.12));
  const shouldLoad = progress > 0.68 || reducedMotion;
  const [failed, setFailed] = useState(false);
  const interactive = morph > 0.55;

  useEffect(() => {
    if (!shouldLoad) return;
    const ping = window.setTimeout(() => {
      // If the frame never fires load, still leave the fallback link visible.
    }, 8000);
    return () => window.clearTimeout(ping);
  }, [shouldLoad]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-[5] transition-opacity duration-700",
        morph > 0.04 ? "opacity-100" : "opacity-0"
      )}
      style={{ pointerEvents: interactive ? "auto" : "none" }}
      aria-hidden={morph < 0.08}
    >
      {shouldLoad && !failed ? (
        <iframe
          data-lenis-prevent
          title="Official Microduck MuJoCo + ONNX playground"
          src={SIM_SRC}
          className="h-full w-full border-0 bg-[#08080c]"
          allow="gamepad; autoplay; fullscreen; clipboard-read; clipboard-write"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#08080c] px-6">
          <a
            href={LINKS.simulator}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-border bg-card/70 px-5 py-4 text-sm text-foreground"
          >
            Open the official browser simulator
          </a>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-10 right-4 z-10 hidden max-w-xs rounded-xl border border-border/70 bg-background/55 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground backdrop-blur-md md:block">
        Official playground · MuJoCo WASM · ONNX at 50 Hz
      </div>
    </div>
  );
}
