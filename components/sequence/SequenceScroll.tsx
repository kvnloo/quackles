"use client";
import { useEffect } from "react";
import { setProgress, setReducedMotion, snapshot, subscribe } from "@/lib/sequence/store";

function interval(value: number, start: number, end: number) {
  const p = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return p * p * (3 - 2 * p);
}
export function applyStoryProgress(p: number) {
  const opacity = (selector: string, value: number) => { const node = document.querySelector<HTMLElement>(selector); if (node) node.style.opacity = String(value); };
  opacity(".hero-copy", 1 - interval(p, .03, .13));
  opacity(".jump-copy", interval(p, .19, .24) * (1 - interval(p, .53, .56)));
  opacity(".explode-copy", interval(p, .56, .61) * (1 - interval(p, .7, .76)));
  opacity(".specs-copy", interval(p, .9, .97));
}
export function SequenceScroll() {
  useEffect(() => {
    let pending = 0;
    const apply = () => {
      const p = snapshot().progress;
      const line = document.querySelector<HTMLElement>(".scroll-progress-fill");
      if (line) line.style.transform = `scaleX(${p})`;
    };
    const read = () => { pending = 0; setProgress(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight)); };
    const schedule = () => { if (!pending) pending = requestAnimationFrame(read); };
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const reduced = () => setReducedMotion(media.matches);
    const unsubscribe = subscribe(apply);
    reduced(); read();
    addEventListener("scroll", schedule, { passive: true }); addEventListener("resize", schedule);
    media.addEventListener("change", reduced);
    return () => { cancelAnimationFrame(pending); unsubscribe(); removeEventListener("scroll", schedule); removeEventListener("resize", schedule); media.removeEventListener("change", reduced); };
  }, []);
  return null;
}
