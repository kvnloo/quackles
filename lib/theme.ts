/** Live tokens from https://hermes-agent.nousresearch.com/ (fetched 2026-09-15). */

export type ToneId = "paper" | "cobalt" | "ink";
export type ThemeStateId = "white" | "poster" | "dark";

export type ThemeState = {
  id: ThemeStateId;
  tone: ToneId;
  label: string;
  t: number;
};

type Palette = {
  paper: string;
  deep: string;
  ink: string;
  cobalt: string;
};

export type SceneLights = {
  ambient: string;
  ambientIntensity: number;
  key: string;
  keyIntensity: number;
  fill: string;
  fillIntensity: number;
  rim: string;
  rimIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  envIntensity: number;
  exposure: number;
  bg: string;
};

/** White / paper: --hermes-paper on --hermes-color-blue type. */
const PAPER: Palette = { paper: "#e5e1d8", deep: "#ddd9d0", ink: "#0000f2", cobalt: "#0000f2" };
/** Poster: --hermes-bg #0000f2, --hermes-fg #f2f2f2. Default. */
const COBALT: Palette = { paper: "#0000f2", deep: "#0000c2", ink: "#f2f2f2", cobalt: "#f2f2f2" };
/** Dark: --hermes-blue-dark-80 / -90, accent --hermes-blue-light-40. */
const INK: Palette = { paper: "#090b10", deep: "#050609", ink: "#f2f2f2", cobalt: "#6666f6" };

export const THEME_STATES: readonly ThemeState[] = [
  { id: "white", tone: "paper", label: "White", t: 0 },
  { id: "poster", tone: "cobalt", label: "Blue", t: 0.5 },
  { id: "dark", tone: "ink", label: "Dark", t: 1 },
] as const;

export const DEFAULT_THEME_ID: ThemeStateId = "white";
export const DEFAULT_THEME_T = 0;
/** Hermes --default-transition-timing-function, 300–400ms. */
export const THEME_LERP_MS = 360;

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

export function mixHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}

function mixPal(a: Palette, b: Palette, t: number): Palette {
  return {
    paper: mixHex(a.paper, b.paper, t),
    deep: mixHex(a.deep, b.deep, t),
    ink: mixHex(a.ink, b.ink, t),
    cobalt: mixHex(a.cobalt, b.cobalt, t),
  };
}

function mixNum(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** cubic-bezier(0.4, 0, 0.2, 1) */
export function easeHermes(x: number) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let t = x;
  for (let i = 0; i < 6; i++) {
    const current = cubic(0.4, 0.2, t);
    const deriv = cubicDeriv(0.4, 0.2, t);
    if (Math.abs(deriv) < 1e-6) break;
    t -= (current - x) / deriv;
  }
  return cubic(0, 1, t);
}

function cubic(p1: number, p2: number, t: number) {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  const a = 1 - c - b;
  return ((a * t + b) * t + c) * t;
}

function cubicDeriv(p1: number, p2: number, t: number) {
  const c = 3 * p1;
  const b = 3 * (p2 - p1) - c;
  const a = 1 - c - b;
  return (3 * a * t + 2 * b) * t + c;
}

export function themeStateById(id: ThemeStateId) {
  return THEME_STATES.find((s) => s.id === id) ?? THEME_STATES[1];
}

export function nearestThemeState(t: number) {
  let best = THEME_STATES[1];
  let dist = Infinity;
  for (const state of THEME_STATES) {
    const d = Math.abs(state.t - t);
    if (d < dist) {
      best = state;
      dist = d;
    }
  }
  return best;
}

export function themeLabel(t: number) {
  return nearestThemeState(t).label;
}

export function plateWeights(t: number) {
  const x = Math.min(1, Math.max(0, t));
  if (x <= 0.5) {
    const s = x / 0.5;
    return { white: 1 - s, cobalt: s, dark: 0 };
  }
  const s = (x - 0.5) / 0.5;
  return { white: 0, cobalt: 1 - s, dark: s };
}

export function paletteAt(t: number): Palette {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? mixPal(PAPER, COBALT, x / 0.5) : mixPal(COBALT, INK, (x - 0.5) / 0.5);
}

const LIGHT_WHITE: SceneLights = {
  ambient: "#f4f1ea",
  ambientIntensity: 0.38,
  key: "#fff7ee",
  keyIntensity: 2.65,
  fill: "#c5ccff",
  fillIntensity: 0.62,
  rim: "#8f9dff",
  rimIntensity: 1.15,
  hemiSky: "#fffaf4",
  hemiGround: "#d8d4cc",
  hemiIntensity: 0.72,
  envIntensity: 1.05,
  exposure: 1.16,
  bg: PAPER.paper,
};

const LIGHT_POSTER: SceneLights = {
  ambient: "#3d3dff",
  ambientIntensity: 0.32,
  key: "#f7f7ff",
  keyIntensity: 2.35,
  fill: "#0000f2",
  fillIntensity: 0.78,
  rim: "#7a7aff",
  rimIntensity: 1.35,
  hemiSky: "#9a9aff",
  hemiGround: "#0000c2",
  hemiIntensity: 0.48,
  envIntensity: 0.88,
  exposure: 1.1,
  bg: COBALT.paper,
};

const LIGHT_DARK: SceneLights = {
  ambient: "#10103a",
  ambientIntensity: 0.22,
  key: "#e4e6ff",
  keyIntensity: 2.05,
  fill: "#2a2aff",
  fillIntensity: 0.55,
  rim: "#6666f6",
  rimIntensity: 1.55,
  hemiSky: "#3a3a80",
  hemiGround: "#000018",
  hemiIntensity: 0.28,
  envIntensity: 0.62,
  exposure: 1.02,
  bg: INK.paper,
};

function mixLights(a: SceneLights, b: SceneLights, t: number): SceneLights {
  return {
    ambient: mixHex(a.ambient, b.ambient, t),
    ambientIntensity: mixNum(a.ambientIntensity, b.ambientIntensity, t),
    key: mixHex(a.key, b.key, t),
    keyIntensity: mixNum(a.keyIntensity, b.keyIntensity, t),
    fill: mixHex(a.fill, b.fill, t),
    fillIntensity: mixNum(a.fillIntensity, b.fillIntensity, t),
    rim: mixHex(a.rim, b.rim, t),
    rimIntensity: mixNum(a.rimIntensity, b.rimIntensity, t),
    hemiSky: mixHex(a.hemiSky, b.hemiSky, t),
    hemiGround: mixHex(a.hemiGround, b.hemiGround, t),
    hemiIntensity: mixNum(a.hemiIntensity, b.hemiIntensity, t),
    envIntensity: mixNum(a.envIntensity, b.envIntensity, t),
    exposure: mixNum(a.exposure, b.exposure, t),
    bg: mixHex(a.bg, b.bg, t),
  };
}

export function lightsAt(t: number): SceneLights {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? mixLights(LIGHT_WHITE, LIGHT_POSTER, x / 0.5) : mixLights(LIGHT_POSTER, LIGHT_DARK, (x - 0.5) / 0.5);
}

let themeSnapshot = DEFAULT_THEME_T;
let themeTarget = DEFAULT_THEME_T;
let animFrame = 0;
const themeListeners = new Set<() => void>();

export function getThemeSnapshot() {
  return themeSnapshot;
}

export function getThemeTarget() {
  return themeTarget;
}

export function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export function applyThemeT(t: number) {
  if (typeof document === "undefined") return;
  const next = Math.min(1, Math.max(0, t));
  themeSnapshot = next;
  const pal = paletteAt(next);
  const tone = nearestThemeState(next).tone;
  const rootEl = document.documentElement;
  rootEl.style.setProperty("--paper", pal.paper);
  rootEl.style.setProperty("--paper-deep", pal.deep);
  rootEl.style.setProperty("--ink", pal.ink);
  rootEl.style.setProperty("--cobalt", pal.cobalt);
  rootEl.style.setProperty("--background", pal.paper);
  rootEl.style.setProperty("--foreground", pal.ink);
  rootEl.dataset.tone = tone;
  themeListeners.forEach((fn) => fn());
}

export function animateThemeTo(target: number, ms = THEME_LERP_MS) {
  if (typeof document === "undefined") return;
  themeTarget = Math.min(1, Math.max(0, target));
  const from = themeSnapshot;
  const reduce =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || ms <= 0) {
    applyThemeT(themeTarget);
    return;
  }
  if (animFrame) cancelAnimationFrame(animFrame);
  const start = performance.now();
  const tick = (now: number) => {
    const u = Math.min(1, (now - start) / ms);
    applyThemeT(from + (themeTarget - from) * easeHermes(u));
    if (u < 1) animFrame = requestAnimationFrame(tick);
    else animFrame = 0;
  };
  animFrame = requestAnimationFrame(tick);
}

export function selectTheme(id: ThemeStateId) {
  animateThemeTo(themeStateById(id).t);
}

/** Compat aliases if a poster agent still imports the old names. */
export const applyThemeCss = applyThemeT;
export function themeAt(t: number) {
  return { lights: lightsAt(t), ...paletteAt(t) };
}
