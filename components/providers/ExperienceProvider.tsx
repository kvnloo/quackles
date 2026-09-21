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
import { DESKTOP_EXPERIENCE } from "@/lib/desktop-experience";
import { clamp01, poseAt, poseAtInto, type Pose } from "@/lib/pose";
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
  const progressRef = useRef(0);
  const poseRef = useRef(poseAt(0));
  const [rigReady, setRigReady] = useState(false);
  const [setReady, setSetReady] = useState(false);
  const [environmentReady, setEnvironmentReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const ready = rigReady && setReady && environmentReady;

  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const plates = document.querySelector<HTMLElement>(".poster-plates");
    const canvas = document.querySelector<HTMLElement>(".duck-slot");
    const active = Boolean(ready && webgl);
    const q = ensureProbe();
    if (q) {
      q.ready = active;
      q.reducedMotion = reducedMotion;
    }
    if (plates) plates.style.visibility = active ? "hidden" : "visible";
    if (canvas) canvas.style.visibility = active ? "visible" : "hidden";

    window.__QUACKLES_DEBUG__ = {
      setProgress(progress) {
        const p = clamp01(progress);
        if (window.__QUACKLES_DESKTOP__) {
          window.__QUACKLES_DESKTOP__.setZoom(
            DESKTOP_EXPERIENCE.nearZoom +
              p *
                (DESKTOP_EXPERIENCE.farZoom -
                  DESKTOP_EXPERIENCE.nearZoom),
          );
          return;
        }
        progressRef.current = p;
        poseAtInto(poseRef.current, p);
        publishPose(p, poseRef.current);
        window.__QUACKLES_INVALIDATE__?.();
      },
      getState: () => ensureProbe(),
      getAuditState: () => window.__QUACKLES_AUDIT__?.() ?? null,
      getSetAudit: () => window.__QUACKLES_SET_AUDIT__?.() ?? null,
      prepareAudit: async () => {
        await window.__QUACKLES_PREPARE_AUDIT__?.();
      },
      getThemeAudit: () => ({
        target: getThemeTarget(),
        current: getThemeSnapshot(),
        robot: ensureProbe()?.robotTheme ?? null,
        set: ensureProbe()?.setTheme ?? null,
      }),
      failCanvas: () => window.__QUACKLES_FAIL_CANVAS__?.(),
      setShadows: async (enabled) => {
        if (!window.__QUACKLES_SET_SHADOWS__)
          throw new Error("Scene is not ready");
        await window.__QUACKLES_SET_SHADOWS__(enabled);
      },
    };

    return () => {
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
