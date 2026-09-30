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
 * Two-stage smoothing (lifted from the theme-slider line: Lenis lerp .085 then
 * a ~84 ms camera ease): Lenis sets a target, a frame-rate-independent follower
 * publishes progress. Resize keeps story progress, not the pixel offset.
 */
const FOLLOW_MS = 85;

export function createScrollDriver({
  reducedMotion,
  onProgress,
}: ScrollDriverOptions): ScrollDriver {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);

  let target = clamp(scrollY / maxScroll());
  let shown = target;
  let last = 0;
  const publish = (value: number) => { shown = value; onProgress(value); };

  const lenis = new Lenis({
    autoRaf: false,
    lerp: reducedMotion ? 1 : 0.085,
    smoothWheel: !reducedMotion,
  });

  lenis.on("scroll", ({ progress }: { progress: number }) => {
    target = clamp(progress);
    if (reducedMotion) publish(target);
  });

  let raf = 0;
  let restartRaf = 0;
  const tick = (time: number) => {
    lenis.raf(time);
    if (!reducedMotion) {
      const dt = last ? Math.min(100, time - last) : 16.7;
      const next = Math.abs(target - shown) < 2e-5 ? target : target + (shown - target) * Math.exp(-dt / FOLLOW_MS);
      if (next !== shown) publish(next);
    }
    last = time;
    raf = requestAnimationFrame(tick);
  };

  publish(target);
  raf = requestAnimationFrame(tick);

  return {
    resize() {
      const keep = target;
      lenis.resize();
      lenis.scrollTo(keep * maxScroll(), { immediate: true, force: true });
      target = keep;
      publish(shown);
    },
    scrollToTop() {
      // A hero-boundary claim can occur from inside the same wheel dispatch that
      // Lenis observes. Quiesce Lenis for the remainder of that frame so stale
      // virtual-scroll state cannot re-apply a fractional story offset after an
      // immediate reset, then resume normal story scrolling on the next frame.
      lenis.stop();
      lenis.scrollTo(0, { immediate: true, force: true });
      target = 0;
      publish(0);
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
