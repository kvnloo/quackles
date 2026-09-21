"use client";
import { useEffect } from "react";
import { createScrollDriver, type ScrollDriver } from "@/lib/sequence/scroll-driver";
import { setProgress, setReducedMotion, snapshot, subscribe } from "@/lib/sequence/store";

function interval(value: number, start: number, end: number) {
  const p = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return p * p * (3 - 2 * p);
}

export function applyStoryProgress(p: number) {
  const opacity = (selector: string, value: number) => {
    const node = document.querySelector<HTMLElement>(selector);
    if (node) node.style.opacity = String(value);
  };
  opacity(".hero-copy", 1 - interval(p, .03, .13));
  opacity(".jump-copy", interval(p, .19, .24) * (1 - interval(p, .53, .56)));
  opacity(".explode-copy", interval(p, .56, .61) * (1 - interval(p, .7, .76)));
  opacity(".specs-copy", interval(p, .9, .97));
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
