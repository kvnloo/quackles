"use client";
import { useEffect } from "react";
import { createScrollDriver, type ScrollDriver } from "@/lib/sequence/scroll-driver";
import { setProgress, setReducedMotion, snapshot, subscribe } from "@/lib/sequence/store";

/**
 * Story copy beats (authored progress). Each block is shown or hidden by story
 * position; the change itself is a timed CSS reveal (globals.css, factory.ai
 * model), so text is never scrubbed and never parks at a partial opacity.
 * Thresholds are the midpoints of the former scrub ramps.
 */
const BEATS: [selector: string, shown: (p: number) => boolean][] = [
  [".hero-copy", (p) => p < 0.08],
  [".jump-copy", (p) => p >= 0.215 && p < 0.545],
  [".explode-copy", (p) => p >= 0.585 && p < 0.73],
  [".specs-copy", (p) => p >= 0.935],
];

export function applyStoryProgress(p: number) {
  for (const [selector, shown] of BEATS) {
    const node = document.querySelector<HTMLElement>(selector);
    const value = String(shown(p));
    if (node && node.dataset.shown !== value) node.dataset.shown = value;
  }
}

export function SequenceScroll() {
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let driver: ScrollDriver | null = null;

    const apply = () => {
      const p = snapshot().progress;
      const line = document.querySelector<HTMLElement>(".scroll-progress-fill");
      if (line) line.style.transform = `scaleX(${p})`;
    };

    const startDriver = () => {
      driver?.destroy();
      setReducedMotion(media.matches);
      driver = createScrollDriver({
        reducedMotion: media.matches,
        onProgress: setProgress,
      });
    };

    const resize = () => driver?.resize();
    const resetToHero = () => {
      driver?.scrollToTop();
      setProgress(0);
    };
    const unsubscribe = subscribe(apply);

    startDriver();
    addEventListener("resize", resize);
    addEventListener("quackles:reset-story-scroll", resetToHero);
    media.addEventListener("change", startDriver);

    return () => {
      driver?.destroy();
      unsubscribe();
      removeEventListener("resize", resize);
      removeEventListener("quackles:reset-story-scroll", resetToHero);
      media.removeEventListener("change", startDriver);
    };
  }, []);

  return null;
}
