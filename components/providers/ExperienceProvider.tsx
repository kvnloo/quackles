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
import { ensureProbe, publishPose } from "@/lib/probe";
import { getThemeSnapshot, getThemeTarget } from "@/lib/theme";
import {
  setProgress as setSequenceProgress,
  snapshot as sequenceSnapshot,
  subscribe as subscribeSequence,
} from "@/lib/sequence/store";

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
  const [reducedMotion, setReducedMotionState] = useState(false);

  const ready = rigReady && setReady && environmentReady;

  useEffect(() => {
    const sync = () => {
      const current = sequenceSnapshot();
      progressRef.current = current.progress;
      setReducedMotionState((previous) =>
        previous === current.reducedMotion ? previous : current.reducedMotion,
      );

      const poseProgress = current.reducedMotion
        ? current.progress < 0.56
          ? 0
          : 1
        : current.progress;

      poseAtInto(poseRef.current, poseProgress);
      if (current.reducedMotion) {
        poseRef.current.jump = 0;
        poseRef.current.crouch = 0;
      }

      publishPose(current.progress, poseRef.current);
      const probe = ensureProbe();
      if (probe) {
        probe.reducedMotion = current.reducedMotion;
        probe.ready = Boolean(ready && webgl);
      }
      window.__QUACKLES_INVALIDATE__?.();
    };

    sync();
    return subscribeSequence(sync);
  }, [ready, webgl]);

  useEffect(() => {
    window.__QUACKLES_DEBUG__ = {
      setProgress: (p) => {
        const next = Math.max(0, Math.min(1, p));
        const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
        scrollTo({ top: next * max, behavior: "instant" });
        setSequenceProgress(next);
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
        if (!window.__QUACKLES_SET_SHADOWS__) throw new Error("Scene is not ready");
        await window.__QUACKLES_SET_SHADOWS__(enabled);
      },
    };
    return () => {
      delete window.__QUACKLES_DEBUG__;
    };
  }, []);

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
