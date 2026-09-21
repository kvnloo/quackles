"use client";
import { useEffect } from "react";
import Lenis from "lenis";
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
    let lenis: Lenis | null = null;
    let raf = 0;

    const apply = () => {
      const p = snapshot().progress;
      const line = document.querySelector<HTMLElement>(".scroll-progress-fill");
      if (line) line.style.transform = `scaleX(${p})`;
    };

    const publishNativePosition = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      setProgress(scrollY / max);
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      lenis?.destroy();
      lenis = null;
    };

    const start = () => {
      stop();
      const reduced = media.matches;
      setReducedMotion(reduced);

      // Donor: cursor/theme-slider-poster-match-530e.
      // Keep the proven low-lerp Lenis input smoothing at the scroll boundary;
      // do not import that branch's theme/story/simulator architecture.
      lenis = new Lenis({
        lerp: reduced ? 1 : 0.085,
        smoothWheel: !reduced,
      });

      lenis.on("scroll", ({ progress }) => {
        setProgress(Math.max(0, Math.min(1, progress)));
      });

      const loop = (time: number) => {
        lenis?.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
      publishNativePosition();
    };

    const resize = () => {
      lenis?.resize();
      publishNativePosition();
    };

    const unsubscribe = subscribe(apply);
    start();
    addEventListener("resize", resize);
    media.addEventListener("change", start);

    return () => {
      stop();
      unsubscribe();
      removeEventListener("resize", resize);
      media.removeEventListener("change", start);
    };
  }, []);

  return null;
}
