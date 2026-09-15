"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type MutableRefObject,
  type ReactNode,
} from "react";
import Lenis from "lenis";
import { POSES, poseAt, type Pose } from "@/lib/pose";
import { COLORWAYS, type ColorwayId } from "@/lib/colorways";
import { detectWebGL } from "@/lib/webgl";
import {
  applyThemeCss,
  DEFAULT_THEME_T,
  getThemeSnapshot,
  persistTheme,
  subscribeTheme,
  themeAt,
  type PaperTheme,
} from "@/lib/theme";

type Experience = {
  progress: number;
  progressRef: MutableRefObject<number>;
  poseRef: MutableRefObject<Pose>;
  colorway: ColorwayId;
  setColorway: (id: ColorwayId) => void;
  ready: boolean;
  setReady: (v: boolean) => void;
  webgl: boolean | null;
  setWebgl: (v: boolean) => void;
  reducedMotion: boolean;
  mobile: boolean;
  sectionCount: number;
  themeT: number;
  setThemeT: (t: number) => void;
  theme: PaperTheme;
};

const ExperienceContext = createContext<Experience | null>(null);

export function ExperienceProvider({ children }: { children: ReactNode }) {
  const progressRef = useRef(0);
  const poseRef = useRef<Pose>(poseAt(0));
  const [progress, setProgress] = useState(0);
  const [colorway, setColorway] = useState<ColorwayId>(COLORWAYS[0].id);
  const [ready, setReady] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mobile, setMobile] = useState(false);
  const themeT = useSyncExternalStore(subscribeTheme, getThemeSnapshot, () => DEFAULT_THEME_T);
  const theme = useMemo(() => themeAt(themeT), [themeT]);

  const setThemeT = useCallback((t: number) => {
    persistTheme(t);
  }, []);

  useEffect(() => {
    applyThemeCss(theme, themeT);
  }, [theme, themeT]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const widthMq = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setReducedMotion(mq.matches);
      setMobile(widthMq.matches);
    };
    sync();
    mq.addEventListener("change", sync);
    widthMq.addEventListener("change", sync);
    return () => {
      mq.removeEventListener("change", sync);
      widthMq.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    const probe = window.setTimeout(() => {
      setWebgl(detectWebGL());
    }, 0);
    const failsafe = window.setTimeout(() => setReady(true), 800);
    return () => {
      window.clearTimeout(probe);
      window.clearTimeout(failsafe);
    };
  }, []);

  useEffect(() => {
    const lenis = new Lenis({
      lerp: reducedMotion ? 1 : 0.085,
      smoothWheel: !reducedMotion,
    });

    let lastUi = 0;
    const onScroll = ({ progress: p }: { progress: number }) => {
      const next = Math.min(1, Math.max(0, p));
      progressRef.current = next;
      poseRef.current = poseAt(next);
      const now = performance.now();
      if (now - lastUi > 32) {
        lastUi = now;
        setProgress(next);
      }
    };

    lenis.on("scroll", onScroll);

    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reducedMotion]);

  const value = useMemo(
    () => ({
      progress,
      progressRef,
      poseRef,
      colorway,
      setColorway,
      ready,
      setReady,
      webgl,
      setWebgl,
      reducedMotion,
      mobile,
      sectionCount: POSES.length,
      themeT,
      setThemeT,
      theme,
    }),
    [progress, colorway, ready, webgl, reducedMotion, mobile, themeT, setThemeT, theme]
  );

  return <ExperienceContext.Provider value={value}>{children}</ExperienceContext.Provider>;
}

export function useExperience() {
  const ctx = useContext(ExperienceContext);
  if (!ctx) throw new Error("useExperience must be used inside ExperienceProvider");
  return ctx;
}
