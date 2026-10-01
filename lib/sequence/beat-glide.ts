"use client";

import { scrollAt } from "./pacing";

/**
 * A/B preview/scroll-beats: after a touch fling (or a moving drag release) the
 * page glides on to the next story beat in the direction of motion.
 *
 * While the finger is down nothing here runs: the drag is the browser's own
 * native scroll, 1:1. After lift the native momentum runs first; once it slows
 * below HANDOFF_PX_S (or ends) the glide takes over at the page's current
 * velocity (no speed step) and eases to the beat. Chrome does not let script
 * cancel a compositor fling, so the glide sets the page position every frame
 * until it lands; what is left of the native fling tail is overridden, not
 * added. A release with the finger held still (< STILL_PX_S) is respected:
 * no glide. Any new touch, wheel or key stops the glide at once.
 *
 * Beats are authored story progress (hero, jump, explode, inspect) plus the
 * page end; positions go through the pacing map, so they stay right if the
 * story length or knots change.
 */
export const BEATS = [0, 0.4, 0.7, 0.92, 1] as const;
const STILL_PX_S = 150;
const HANDOFF_PX_S = 1400;

export type BeatGlide = { destroy: () => void; gliding: () => boolean };

export function createBeatGlide(): BeatGlide {
  const maxScroll = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
  let coasting = false;          // after lift, native momentum in flight, glide not started
  let dir = 0;
  let samples: [t: number, y: number][] = [];
  let glideRaf = 0;
  let watchRaf = 0;

  const inspecting = () =>
    (visualViewport?.scale ?? 1) > 1.01 || document.querySelector('[data-inspecting="true"]') !== null;
  // Release velocity of the page (px/s, + = down the story) from the finger's last 100 ms.
  const velocity = (now: number) => {
    const recent = samples.filter(([t]) => now - t <= 100);
    if (recent.length < 2) return 0;
    const [t0, y0] = recent[0], [t1, y1] = recent[recent.length - 1];
    return t1 > t0 ? (-(y1 - y0) / (t1 - t0)) * 1000 : 0;
  };
  const record = (event: TouchEvent) => {
    if (event.touches.length !== 1) { samples = []; return; }
    const t = event.timeStamp;
    samples.push([t, event.touches[0].clientY]);
    samples = samples.filter(([s]) => t - s <= 200);
  };

  const stop = () => {
    cancelAnimationFrame(glideRaf); cancelAnimationFrame(watchRaf);
    glideRaf = watchRaf = 0; coasting = false;
  };

  function targetFrom(y: number, d: number, v: number): number | null {
    const max = maxScroll();
    const beats = BEATS.map((b) => Math.round(scrollAt(b) * max));
    const ahead = d > 0 ? beats.filter((b) => b > y + 2) : beats.filter((b) => b < y - 2).reverse();
    // The nearest beat ahead that the glide can reach without overshooting at this speed.
    for (const b of ahead) if (Math.abs(b - y) >= Math.abs(v) * 0.12) return b;
    return ahead.at(-1) ?? null;
  }

  function glide(y0: number, v0: number, target: number) {
    const D = target - y0;
    const T = Math.min(1.2, Math.max(0.35, Math.abs(D) / 1600 + 0.25));          // s
    const speed = Math.min(Math.max(0, v0 * Math.sign(D)), (2.5 * Math.abs(D)) / T);  // toward the beat, px/s
    const vt = Math.sign(D) * speed * T;                                            // start velocity x T (px)
    let t0 = 0;
    const step = (now: number) => {
      if (!t0) t0 = now;
      const s = Math.min(1, (now - t0) / 1000 / T);
      // Cubic Hermite: start at y0 with velocity v, end at target at rest (monotone: |vT| <= 3|D|).
      const h10 = s * s * s - 2 * s * s + s, h01 = -2 * s * s * s + 3 * s * s;
      scrollTo(0, y0 + vt * h10 + D * h01);
      glideRaf = s < 1 ? requestAnimationFrame(step) : 0;
      if (!glideRaf) hold(target);
    };
    glideRaf = requestAnimationFrame(step);
  }

  // Keep the page on the beat while what is left of the native fling dies out.
  function hold(target: number) {
    let quiet = 0;
    const step = () => {
      if (Math.abs(scrollY - target) > 0.5) { scrollTo(0, target); quiet = 0; } else quiet++;
      watchRaf = quiet < 12 ? requestAnimationFrame(step) : 0;
    };
    watchRaf = requestAnimationFrame(step);
  }

  // After lift: watch the native momentum and hand off once it is slow enough.
  function watch() {
    let lastY = scrollY, lastT = performance.now(), still = 0;
    const step = (now: number) => {
      const dt = Math.max(1, now - lastT), v = ((scrollY - lastY) / dt) * 1000;
      still = scrollY === lastY ? still + 1 : 0;
      lastY = scrollY; lastT = now;
      const slow = Math.sign(v) !== dir || Math.abs(v) < HANDOFF_PX_S || still >= 3;
      if (slow) {
        watchRaf = 0; coasting = false;
        const target = targetFrom(scrollY, dir, v);
        if (target !== null) glide(scrollY, Math.sign(v) === dir ? v : 0, target);
        return;
      }
      watchRaf = requestAnimationFrame(step);
    };
    watchRaf = requestAnimationFrame(step);
  }

  const onTouchStart = (event: TouchEvent) => { stop(); samples = []; record(event); };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length) return;
    const v = velocity(event.timeStamp);
    samples = [];
    if (Math.abs(v) < STILL_PX_S || inspecting()) return;
    dir = Math.sign(v); coasting = true;
    watch();
  };
  const onOther = () => stop();

  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchend", onTouchEnd, { passive: true });
  addEventListener("touchcancel", onTouchEnd, { passive: true });
  addEventListener("touchmove", record, { passive: true });
  addEventListener("wheel", onOther, { passive: true });
  addEventListener("keydown", onOther, { passive: true });

  return {
    gliding: () => coasting || glideRaf !== 0,
    destroy() {
      stop();
      removeEventListener("touchstart", onTouchStart);
      removeEventListener("touchend", onTouchEnd);
      removeEventListener("touchcancel", onTouchEnd);
      removeEventListener("touchmove", record);
      removeEventListener("wheel", onOther);
      removeEventListener("keydown", onOther);
    },
  };
}
