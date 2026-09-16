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
import {
  clamp01,
  interval,
  poseAt,
  poseAtInto,
  type Pose,
} from "@/lib/pose";
import { getThemeSnapshot, getThemeTarget } from "@/lib/theme";
import { ensureProbe, publishPose } from "@/lib/probe";
type Experience = {
  progressRef: MutableRefObject<number>;
  poseRef: MutableRefObject<Pose>;
  ready: boolean;
  setRigReady: (v: boolean) => void;
  setSetReady: (v: boolean) => void;
  setEnvironmentReady: (v: boolean) => void;
  webgl: boolean | null;
  setWebgl: (v: boolean) => void;
  reducedMotion: boolean;
};
const Context = createContext<Experience | null>(null);
export function ExperienceProvider({ children }: { children: ReactNode }) {
  const progressRef = useRef(0),
    poseRef = useRef(poseAt(0));
  const [rigReady, setRigReady] = useState(false),
    [setReady, setSetReady] = useState(false),
    [environmentReady, setEnvironmentReady] = useState(false),
    [webgl, setWebgl] = useState<boolean | null>(null),
    [reducedMotion, setReducedMotion] = useState(false);
  const ready = rigReady && setReady && environmentReady;
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    let frame = 0,
      max = 1;
    const plates = document.querySelector<HTMLElement>(".poster-plates");
    const canvas = document.querySelector<HTMLElement>(".duck-slot");
    const copy = document.querySelector<HTMLElement>(".hero-copy");
    const explodeCopy = document.querySelector<HTMLElement>(".explode-copy");
    const jumpCopy = document.querySelector<HTMLElement>(".jump-copy");
    const specs = document.querySelector<HTMLElement>(".specs-copy");
    const progress = document.querySelector<HTMLElement>(
      ".scroll-progress-fill",
    );
    const apply = (p: number) => {
      p = clamp01(p);
      progressRef.current = p;
      poseAtInto(poseRef.current, p);
      if (reducedMotion) {
        poseAtInto(poseRef.current, p < 0.56 ? 0 : 1);
        poseRef.current.jump = 0;
        poseRef.current.crouch = 0;
      }
      publishPose(p, poseRef.current);
      const q = ensureProbe();
      if (q) q.reducedMotion = reducedMotion;
      const active = Boolean(ready && webgl);
      if (q) q.ready = active;
      if (plates) plates.style.visibility = active ? "hidden" : "visible";
      if (canvas) canvas.style.visibility = active ? "visible" : "hidden";
      if (copy) copy.style.opacity = String(1 - interval(p, 0.03, 0.13));
      if (explodeCopy)
        explodeCopy.style.opacity = String(
          interval(p, 0.56, 0.61) * (1 - interval(p, 0.7, 0.76)),
        );
      if (jumpCopy)
        jumpCopy.style.opacity = String(
          interval(p, 0.19, 0.24) * (1 - interval(p, 0.53, 0.56)),
        );
      if (specs) specs.style.opacity = String(interval(p, 0.9, 0.97));
      if (progress) progress.style.transform = `scaleX(${p})`;
      window.__QUACKLES_INVALIDATE__?.();
    };
    const measure = () => {
      max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    };
    const read = () => {
      frame = 0;
      apply(scrollY / max);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    const resize = () => {
      measure();
      schedule();
    };
    measure();
    read();
    window.__QUACKLES_DEBUG__ = {
      setProgress: (p) => {
        scrollTo({ top: clamp01(p) * max, behavior: "instant" });
        apply(clamp01(p));
      },
      getState: () => ensureProbe(),
      getAuditState: () => window.__QUACKLES_AUDIT__?.() ?? null,
      getSetAudit: () => window.__QUACKLES_SET_AUDIT__?.() ?? null,
      prepareAudit: async () => { await window.__QUACKLES_PREPARE_AUDIT__?.(); },
      getThemeAudit: () => ({ target: getThemeTarget(), current: getThemeSnapshot(), robot: ensureProbe()?.robotTheme ?? null, set: ensureProbe()?.setTheme ?? null }),
      failCanvas: () => window.__QUACKLES_FAIL_CANVAS__?.(),
      setShadows: async (enabled) => {
        if (!window.__QUACKLES_SET_SHADOWS__) throw new Error("Scene is not ready");
        await window.__QUACKLES_SET_SHADOWS__(enabled);
      },
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("scroll", schedule);
      removeEventListener("resize", resize);
      delete window.__QUACKLES_DEBUG__;
    };
  }, [ready, webgl, reducedMotion]);
  const value = useMemo(
    () => ({
      progressRef,
      poseRef,
      ready,
      setRigReady,
      setSetReady,
      setEnvironmentReady,
      webgl,
      setWebgl,
      reducedMotion,
    }),
    [ready, webgl, reducedMotion],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useExperience() {
  const value = useContext(Context);
  if (!value) throw new Error("ExperienceProvider is required");
  return value;
}
