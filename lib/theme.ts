export type ToneId = "paper" | "cobalt" | "ink";

type Palette = { paper: string; deep: string; ink: string; cobalt: string };

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
  if (t < 0.33) return "Paper";
  if (t < 0.66) return "Cobalt";
  return "Ink";
}

export function paletteAt(t: number): Palette {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? mixPal(PAPER, COBALT, x / 0.5) : mixPal(COBALT, INK, (x - 0.5) / 0.5);
}

export function applyThemeT(t: number) {
  if (typeof document === "undefined") return;
  const pal = paletteAt(t);
  const rootEl = document.documentElement;
  rootEl.style.setProperty("--paper", pal.paper);
  rootEl.style.setProperty("--paper-deep", pal.deep);
  rootEl.style.setProperty("--ink", pal.ink);
  rootEl.style.setProperty("--cobalt", pal.cobalt);
  rootEl.style.setProperty("--background", pal.paper);
  rootEl.style.setProperty("--foreground", pal.ink);
  rootEl.dataset.tone = t < 0.33 ? "paper" : t < 0.66 ? "cobalt" : "ink";
}

export const DEFAULT_TONE: ToneId = "paper";
