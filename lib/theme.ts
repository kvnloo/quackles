export type ToneId = "paper" | "cobalt" | "ink";

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
  exposure: number;
  bg: string;
};

const PAPER: Palette = { paper: "#efe8dc", deep: "#cfc6b4", ink: "#16204a", cobalt: "#2f5bff" };
const COBALT: Palette = { paper: "#2f5bff", deep: "#1c3ad4", ink: "#f4efe6", cobalt: "#f7f2ea" };
const INK: Palette = { paper: "#12162a", deep: "#0b1020", ink: "#efe8dc", cobalt: "#7d97ff" };

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
}

function mixHex(a: string, b: string, t: number) {
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

export function themeLabel(t: number) {
  if (t < 0.33) return "White";
  if (t < 0.66) return "Cobalt";
  return "Dark";
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

export function lightsAt(t: number): SceneLights {
  const pal = paletteAt(t);
  const x = Math.min(1, Math.max(0, t));
  if (x < 0.5) {
    const s = x / 0.5;
    return {
      ambient: mixHex("#f4eee4", "#dbe2ff", s),
      ambientIntensity: 0.82 - s * 0.12,
      key: mixHex("#fff8ee", "#e8eeff", s),
      keyIntensity: 1.55 - s * 0.15,
      fill: mixHex("#ffffff", "#8aa4ff", s),
      fillIntensity: 0.32 + s * 0.2,
      exposure: 1.08,
      bg: pal.paper,
    };
  }
  const s = (x - 0.5) / 0.5;
  return {
    ambient: mixHex("#dbe2ff", "#141a2c", s),
    ambientIntensity: 0.7 - s * 0.38,
    key: mixHex("#e8eeff", "#c8d4ff", s),
    keyIntensity: 1.4 - s * 0.25,
    fill: mixHex("#8aa4ff", "#4d78ff", s),
    fillIntensity: 0.52,
    exposure: 1.04,
    bg: pal.paper,
  };
}

let themeSnapshot = 0;
const themeListeners = new Set<() => void>();

export function getThemeSnapshot() {
  return themeSnapshot;
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
  const rootEl = document.documentElement;
  rootEl.style.setProperty("--paper", pal.paper);
  rootEl.style.setProperty("--paper-deep", pal.deep);
  rootEl.style.setProperty("--ink", pal.ink);
  rootEl.style.setProperty("--cobalt", pal.cobalt);
  rootEl.style.setProperty("--background", pal.paper);
  rootEl.style.setProperty("--foreground", pal.ink);
  rootEl.dataset.tone = next < 0.33 ? "paper" : next < 0.66 ? "cobalt" : "ink";
  themeListeners.forEach((fn) => fn());
}
