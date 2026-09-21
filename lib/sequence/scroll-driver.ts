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
  scrollToTop: () => void;
};

/**
 * Narrow adapter around the smooth-scroll donor.
 *
 * Product state consumes normalized 0..1 progress only. Lenis stays isolated
 * from sequence state, camera choreography, themes, and simulator ownership.
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

  lenis.on("scroll", ({ progress }: { progress: number }) => {
    onProgress(clamp(progress));
  });

  let raf = 0;
  let restartRaf = 0;
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
    scrollToTop() {
      // A hero-boundary claim can occur from inside the same wheel dispatch that
      // Lenis observes. Quiesce Lenis for the remainder of that frame so stale
      // virtual-scroll state cannot re-apply a fractional story offset after an
      // immediate reset, then resume normal story scrolling on the next frame.
      lenis.stop();
      lenis.scrollTo(0, { immediate: true, force: true });
      onProgress(0);
      cancelAnimationFrame(restartRaf);
      restartRaf = requestAnimationFrame(() => {
        restartRaf = 0;
        lenis.start();
      });
    },
    destroy() {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(restartRaf);
      lenis.destroy();
    },
  };
}
