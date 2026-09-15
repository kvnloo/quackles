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
import { poseAt, poseAtInto, type Pose } from "@/lib/pose";
import { publishPose } from "@/lib/probe";
import { readScrollProgress } from "@/lib/scroll";

type Experience = {
  progressRef: MutableRefObject<number>;
  poseRef: MutableRefObject<Pose>;
  ready: boolean;
  setReady: (v: boolean) => void;
  webgl: boolean | null;
  setWebgl: (v: boolean) => void;
  reducedMotion: boolean;
};

const ExperienceContext = createContext<Experience | null>(null);

function applyScroll(progressRef: MutableRefObject<number>, poseRef: MutableRefObject<Pose>) {
  const next = readScrollProgress();
  progressRef.current = next;
  poseAtInto(poseRef.current, next);
  publishPose(next, poseRef.current);
  document.documentElement.style.setProperty("--p", next.toFixed(4));
  window.__QUACKLES_INVALIDATE__?.();
}

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const progressRef = useRef(0);
  const poseRef = useRef<Pose>(poseAt(0));
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
    const onScroll = () => applyScroll(progressRef, poseRef);
    applyScroll(progressRef, poseRef);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const value = useMemo(
    () => ({
      progressRef,
      poseRef,
      ready,
      setReady,
      webgl,
      setWebgl,
      reducedMotion,
    }),
    [ready, webgl, reducedMotion],
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error("useExperience must be used inside ExperienceProvider");
  return ctx;
}
