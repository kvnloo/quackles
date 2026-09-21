"use client";

import { useEffect, useState } from "react";
import { DuckStage } from "@/components/duck/DuckStage";
import {
  ExperienceProvider,
  useExperience,
} from "@/components/providers/ExperienceProvider";

function LiveLayer() {
  const { ready, webgl } = useExperience();
  return (
    <div
      className="duck-slot"
      style={{ visibility: ready && webgl ? "visible" : "hidden" }}
      data-testid="live-motion-surface"
      aria-hidden
    >
      <DuckStage />
    </div>
  );
}

/**
 * Live renderer plugged into the same normalized progress store as the
 * pre-rendered sequence. The sequence remains underneath as a fallback.
 *
 * ?renderer=sequence disables this layer for direct A/B inspection.
 */
export function MotionSurface() {
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    const renderer = new URLSearchParams(location.search).get("renderer");
    setEnabled(renderer !== "sequence");
  }, []);

  if (!enabled) return null;

  return (
    <ExperienceProvider>
      <LiveLayer />
    </ExperienceProvider>
  );
}
