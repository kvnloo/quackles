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
 *
 * Touch, keyboard and scrollbar are the browser's native scroll and momentum
 * (Lenis does not sync touch). Their scroll event publishes the page position
 * directly, so the story moves 1:1 with the finger and stops when the page
 * stops (v0's feel; factory.ai's model; ISSUES.md I4: one stage at most).
 *
 * Wheel input alone keeps the desktop two-stage glide (Lenis lerp .085, then a
 * frame-rate-independent 85 ms follower), unchanged from 0f32b13.
 *
 * The animation-frame loop runs only while a wheel glide or the follower is in
 * flight, so the page requests no frames at rest. Resize keeps story progress,
 * not the pixel offset.
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
    syncTouch: false,
  });

  let raf = 0;
  let restartRaf = 0;
  // The last input decides the path: a wheel keeps the glide (and its follower
  // tail) smooth; touch or keys hand the story straight back to the page.
  let wheeling = false;
  const gliding = () => lenis.isScrolling === "smooth";
  const wake = () => { if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
  const onWheel = () => { wheeling = true; wake(); };
  const onDirect = () => { wheeling = false; };

  lenis.on("scroll", ({ progress }: { progress: number }) => {
    target = clamp(progress);
    if (reducedMotion || !(wheeling || gliding())) publish(target);
    else wake();
  });

  function tick(time: number) {
    // raf stays set while this frame runs, so a scroll emitted from inside
    // lenis.raf() cannot schedule a second loop. After an idle gap, Lenis would
    // see the whole gap as one frame and jump the glide: give it one frame.
    if (!last) lenis.time = time - 1000 / 60;
    lenis.raf(time);
    if (!reducedMotion && shown !== target) {
      const dt = last ? Math.min(100, time - last) : 16.7;
      publish(Math.abs(target - shown) < 2e-5 ? target : target + (shown - target) * Math.exp(-dt / FOLLOW_MS));
    }
    last = time;
    raf = gliding() || shown !== target ? requestAnimationFrame(tick) : 0;
  }

  // Lenis only advances a wheel glide from raf(): wake the loop on wheel input.
  addEventListener("wheel", onWheel, { passive: true });
  addEventListener("touchstart", onDirect, { passive: true });
  addEventListener("keydown", onDirect, { passive: true });

  publish(target);

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
      removeEventListener("wheel", onWheel);
      removeEventListener("touchstart", onDirect);
      removeEventListener("keydown", onDirect);
      lenis.destroy();
    },
  };
}
