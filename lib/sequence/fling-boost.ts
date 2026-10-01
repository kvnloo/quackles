"use client";

/**
 * A/B preview/scroll-boost: touch fling momentum carries ~1.8x as far.
 *
 * The drag is untouched: while a finger is down this does nothing, so the
 * page (and the story, which publishes from the scroll event) tracks the
 * finger 1:1. After lift the browser's own fling keeps running, and every
 * frame this adds GAIN x the distance the fling moved that frame. The fling's
 * own curve (Android's or Chrome's, whatever the device uses) is kept, only
 * stretched. The gain ramps in over RAMP_MS so the page does not visibly kick
 * at the moment of lift. Chrome lets script scroll on top of a running fling
 * (it neither cancels nor fights it), so this is additive, not scroll-jacking.
 * A new touch, wheel or key stops it at once; it also stops at the page ends.
 */
const GAIN = 0.95;
const RAMP_MS = 90;
const STILL_PX_S = 150;

export type FlingBoost = { destroy: () => void };

export function createFlingBoost(): FlingBoost {
  let samples: [t: number, y: number][] = [];
  let raf = 0;

  const stop = () => { cancelAnimationFrame(raf); raf = 0; };
  const record = (event: TouchEvent) => {
    if (event.touches.length !== 1) { samples = []; return; }
    const t = event.timeStamp;
    samples.push([t, event.touches[0].clientY]);
    samples = samples.filter(([s]) => t - s <= 200);
  };
  const release = (now: number) => {
    const recent = samples.filter(([t]) => now - t <= 100);
    if (recent.length < 2) return 0;
    const [t0, y0] = recent[0], [t1, y1] = recent[recent.length - 1];
    return t1 > t0 ? (-(y1 - y0) / (t1 - t0)) * 1000 : 0;
  };

  function boost(dir: number) {
    let lastY = scrollY, start = 0, still = 0;
    const step = (now: number) => {
      if (!start) start = now;
      const native = scrollY - lastY;                   // what the fling moved since our last frame
      still = native === 0 ? still + 1 : 0;
      if (Math.sign(native) === -dir || still >= 4) { raf = 0; return; }
      const gain = GAIN * Math.min(1, (now - start) / RAMP_MS);
      if (native) scrollBy(0, native * gain);
      lastY = scrollY;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  const onTouchStart = (event: TouchEvent) => { stop(); samples = []; record(event); };
  const onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length) return;
    const v = release(event.timeStamp);
    samples = [];
    const zoomed = (visualViewport?.scale ?? 1) > 1.01 || document.querySelector('[data-inspecting="true"]') !== null;
    if (Math.abs(v) >= STILL_PX_S && !zoomed) boost(Math.sign(v));
  };

  addEventListener("touchstart", onTouchStart, { passive: true });
  addEventListener("touchmove", record, { passive: true });
  addEventListener("touchend", onTouchEnd, { passive: true });
  addEventListener("touchcancel", onTouchEnd, { passive: true });
  addEventListener("wheel", stop, { passive: true });
  addEventListener("keydown", stop, { passive: true });

  return {
    destroy() {
      stop();
      removeEventListener("touchstart", onTouchStart);
      removeEventListener("touchmove", record);
      removeEventListener("touchend", onTouchEnd);
      removeEventListener("touchcancel", onTouchEnd);
      removeEventListener("wheel", stop);
      removeEventListener("keydown", stop);
    },
  };
}
