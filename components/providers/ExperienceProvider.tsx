"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import { poseAt, poseAtInto, type Pose } from "@/lib/pose";
import { publishPose } from "@/lib/probe";

type Experience = {
  progressRef: MutableRefObject<number>;
  poseRef: MutableRefObject<Pose>;
  lenisRef: MutableRefObject<Lenis | null>;
  ready: boolean;
  setReady: (v: boolean) => void;
  webgl: boolean | null;
  setWebgl: (v: boolean) => void;
  reducedMotion: boolean;
};

const ExperienceContext = createContext<Experience | null>(null);

function applyProgress(
  progressRef: MutableRefObject<number>,
  poseRef: MutableRefObject<Pose>,
  next: number
) {
  progressRef.current = next;
  poseAtInto(poseRef.current, next);
  publishPose(next, poseRef.current);
  document.documentElement.style.setProperty("--p", next.toFixed(4));
  window.__QUACKLES_INVALIDATE__?.();
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const progressRef = useRef(0);
  const poseRef = useRef<Pose>(poseAt(0));
  const lenisRef = useRef<Lenis | null>(null);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const lenis = new Lenis({
      autoRaf: false,
      lerp: reducedMotion ? 1 : 0.14,
      smoothWheel: !reducedMotion,
      syncTouch: true,
      touchMultiplier: 1.15,
      respectReducedMotion: true,
    });
    lenisRef.current = lenis;
    window.__QUACKLES_LENIS__ = lenis;
    lenis.on("scroll", (instance) => {
      applyProgress(progressRef, poseRef, instance.progress);
    });
    applyProgress(progressRef, poseRef, 0);

    let raf = 0;
    const loop = (time: number) => {
      if (!window.__QUACKLES_LENIS_FROM_R3F__) lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (window.__QUACKLES_LENIS__ === lenis) window.__QUACKLES_LENIS__ = undefined;
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [reducedMotion]);

  const value = useMemo(
    () => ({
      progressRef,
      poseRef,
      lenisRef,
      ready,
      setReady,
      webgl,
      setWebgl,
      reducedMotion,
    }),
    [ready, webgl, reducedMotion]
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error("useExperience must be used inside ExperienceProvider");
  return ctx;
}
