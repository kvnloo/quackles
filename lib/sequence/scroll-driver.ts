"use client";

import Lenis from "lenis";

type ScrollProgressListener = (progress: number) => void;

type ScrollDriverOptions = {
  reducedMotion: boolean;
  onProgress: ScrollProgressListener;
};

export type ScrollDriver = {
  destroy: () => void;
  resize: () => void;
};

/**
 * Narrow adapter around the smooth-scroll donor.
 *
 * The rest of Quackles consumes normalized progress only. This deliberately
 * keeps Lenis out of the sequence store, camera choreography, themes, and
 * simulator so the input feel can evolve independently of product state.
 */
export function createScrollDriver({
  reducedMotion,
  onProgress,
}: ScrollDriverOptions): ScrollDriver {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const publishNativePosition = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    onProgress(clamp(scrollY / max));
  };

  const lenis = new Lenis({
    autoRaf: false,
    lerp: reducedMotion ? 1 : 0.085,
    smoothWheel: !reducedMotion,
  });

  const onLenisScroll = ({ progress }: { progress: number }) => {
    onProgress(clamp(progress));
  };

  lenis.on("scroll", onLenisScroll);

  let raf = 0;
  const tick = (time: number) => {
    lenis.raf(time);
    raf = requestAnimationFrame(tick);
  };

  publishNativePosition();
  raf = requestAnimationFrame(tick);

  return {
    resize() {
      lenis.resize();
      publishNativePosition();
    },
    destroy() {
      cancelAnimationFrame(raf);
      lenis.destroy();
    },
  };
}
