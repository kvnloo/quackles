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
    const desktop = matchMedia("(hover: hover) and (pointer: fine)");
    let driver: ScrollDriver | null = null;

    const apply = () => {
      const p = snapshot().progress;
      const line = document.querySelector<HTMLElement>(".scroll-progress-fill");
      if (line) line.style.transform = `scaleX(${p})`;
    };

    const startDriver = () => {
      driver?.destroy();
      driver = null;
      setReducedMotion(media.matches);

      // Desktop uses the explicit reversible product state machine. Native
      // document scroll is reserved for touch/mobile where the poster remains
      // a conventional scroll story.
      if (desktop.matches) {
        setProgress(0);
        scrollTo({ top: 0, behavior: "instant" });
        return;
      }

      driver = createScrollDriver({
        reducedMotion: media.matches,
        onProgress: setProgress,
      });
    };

    const resize = () => driver?.resize();
    const unsubscribe = subscribe(apply);

    startDriver();
    addEventListener("resize", resize);
    media.addEventListener("change", startDriver);
    desktop.addEventListener("change", startDriver);

    return () => {
      driver?.destroy();
      unsubscribe();
      removeEventListener("resize", resize);
      media.removeEventListener("change", startDriver);
      desktop.removeEventListener("change", startDriver);
    };
  }, []);

  return null;
}
