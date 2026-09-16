"use client";
import { useEffect } from "react";
import { armFeel, driveFeel } from "@/lib/feel/drive";
import { snapshot } from "@/lib/sequence/store";

export function FeelEngine() {
  useEffect(() => {
    const arm = () => armFeel();
    addEventListener("pointerdown", arm, { once: true });
    addEventListener("keydown", arm, { once: true });
    let frame = 0;
    const tick = () => {
      const state = snapshot();
      driveFeel(state.progress, state.reducedMotion);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
