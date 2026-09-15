export const THEME_STORAGE_KEY = "microduck-theme";
export const DEFAULT_THEME_T = 0.5;

export type SceneLights = {
  ambient: string;
  ambientIntensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  key: string;
  keyIntensity: number;
  rim: string;
  rimIntensity: number;
  fill: string;
  fillIntensity: number;
  shadow: string;
  shadowOpacity: number;
  exposure: number;
  envIntensity: number;
  clearcoat: number;
  bg: string;
};

export type PaperTheme = {
  paper: string;
  paperDeep: string;
  ink: string;
  cobalt: string;
  stone: string;
  stoneDark: string;
  stoneTop: string;
  arch: string;
  orb0: string;
  orb1: string;
  orb2: string;
  orb3: string;
  grainOpacity: number;
  grainBlend: string;
  bustBlend: string;
  handsPlateBlend: string;
  plinthFilter: string;
  lights: SceneLights;
};

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHex(rgb: [number, number, number]) {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, "0")
    )
    .join("")}`;
}

function lerpHex(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}

const WHITE: PaperTheme = {
  paper: "#f6f4ef",
  paperDeep: "#e4e0d6",
  ink: "#1a1c22",
  cobalt: "#2a4dff",
  stone: "#ebe6dc",
  stoneDark: "#cfc8bb",
  stoneTop: "#f4f1ea",
  arch: "#ffffff",
  orb0: "#d7e2ff",
  orb1: "#6f8cff",
  orb2: "#2a4dff",
  orb3: "#101a6a",
  grainOpacity: 0.07,
  grainBlend: "multiply",
  bustBlend: "multiply",
  handsPlateBlend: "multiply",
  plinthFilter: "none",
  lights: {
    ambient: "#f7f4ee",
    ambientIntensity: 0.78,
    hemiSky: "#fffdf8",
    hemiGround: "#d8d2c6",
    hemiIntensity: 0.62,
    key: "#ffffff",
    keyIntensity: 2.05,
    rim: "#3d6bff",
    rimIntensity: 0.38,
    fill: "#ffffff",
    fillIntensity: 0.46,
    shadow: "#8a8274",
    shadowOpacity: 0.22,
    exposure: 1.22,
    envIntensity: 0.48,
    clearcoat: 0.28,
    bg: "#f6f4ef",
  },
};

const POSTER: PaperTheme = {
  paper: "#f3ece2",
  paperDeep: "#d4cbb8",
  ink: "#16204a",
  cobalt: "#2f5bff",
  stone: "#d8cfc0",
  stoneDark: "#b7ad93",
  stoneTop: "#e8e0d0",
  arch: "#f7f2ea",
  orb0: "#c5d4ff",
  orb1: "#4d74ff",
  orb2: "#2f5bff",
  orb3: "#0e1f7a",
  grainOpacity: 0.11,
  grainBlend: "multiply",
  bustBlend: "multiply",
  handsPlateBlend: "multiply",
  plinthFilter: "none",
  lights: {
    ambient: "#f3ece2",
    ambientIntensity: 0.62,
    hemiSky: "#f6f0e6",
    hemiGround: "#b7ad93",
    hemiIntensity: 0.58,
    key: "#fff8ee",
    keyIntensity: 1.85,
    rim: "#2f5bff",
    rimIntensity: 0.42,
    fill: "#ffffff",
    fillIntensity: 0.38,
    shadow: "#6a5a40",
    shadowOpacity: 0.28,
    exposure: 1.12,
    envIntensity: 0.32,
    clearcoat: 0.22,
    bg: "#f3ece2",
  },
};

const DARK: PaperTheme = {
  paper: "#0b101c",
  paperDeep: "#06080f",
  ink: "#efe6d6",
  cobalt: "#4d78ff",
  stone: "#2a2926",
  stoneDark: "#161513",
  stoneTop: "#3a3834",
  arch: "#1a2236",
  orb0: "#8aa4ff",
  orb1: "#3d6bff",
  orb2: "#2f5bff",
  orb3: "#070c28",
  grainOpacity: 0.16,
  grainBlend: "overlay",
  bustBlend: "multiply",
  handsPlateBlend: "multiply",
  plinthFilter: "brightness(0.55) saturate(0.7)",
  lights: {
    ambient: "#141a2c",
    ambientIntensity: 0.28,
    hemiSky: "#2a3a66",
    hemiGround: "#0a0c12",
    hemiIntensity: 0.42,
    key: "#e8eeff",
    keyIntensity: 1.55,
    rim: "#4d78ff",
    rimIntensity: 0.72,
    fill: "#8aa4ff",
    fillIntensity: 0.28,
    shadow: "#020308",
    shadowOpacity: 0.45,
    exposure: 1.04,
    envIntensity: 0.18,
    clearcoat: 0.34,
    bg: "#0b101c",
  },
};

function mixTheme(a: PaperTheme, b: PaperTheme, t: number): PaperTheme {
  const s = clamp01(t);
  return {
    paper: lerpHex(a.paper, b.paper, s),
    paperDeep: lerpHex(a.paperDeep, b.paperDeep, s),
    ink: lerpHex(a.ink, b.ink, s),
    cobalt: lerpHex(a.cobalt, b.cobalt, s),
    stone: lerpHex(a.stone, b.stone, s),
    stoneDark: lerpHex(a.stoneDark, b.stoneDark, s),
    stoneTop: lerpHex(a.stoneTop, b.stoneTop, s),
    arch: lerpHex(a.arch, b.arch, s),
    orb0: lerpHex(a.orb0, b.orb0, s),
    orb1: lerpHex(a.orb1, b.orb1, s),
    orb2: lerpHex(a.orb2, b.orb2, s),
    orb3: lerpHex(a.orb3, b.orb3, s),
    grainOpacity: lerp(a.grainOpacity, b.grainOpacity, s),
    grainBlend: s < 0.55 ? a.grainBlend : b.grainBlend,
    bustBlend: a.bustBlend,
    handsPlateBlend: a.handsPlateBlend,
    plinthFilter: s < 0.55 ? a.plinthFilter : b.plinthFilter,
    lights: {
      ambient: lerpHex(a.lights.ambient, b.lights.ambient, s),
      ambientIntensity: lerp(a.lights.ambientIntensity, b.lights.ambientIntensity, s),
      hemiSky: lerpHex(a.lights.hemiSky, b.lights.hemiSky, s),
      hemiGround: lerpHex(a.lights.hemiGround, b.lights.hemiGround, s),
      hemiIntensity: lerp(a.lights.hemiIntensity, b.lights.hemiIntensity, s),
      key: lerpHex(a.lights.key, b.lights.key, s),
      keyIntensity: lerp(a.lights.keyIntensity, b.lights.keyIntensity, s),
      rim: lerpHex(a.lights.rim, b.lights.rim, s),
      rimIntensity: lerp(a.lights.rimIntensity, b.lights.rimIntensity, s),
      fill: lerpHex(a.lights.fill, b.lights.fill, s),
      fillIntensity: lerp(a.lights.fillIntensity, b.lights.fillIntensity, s),
      shadow: lerpHex(a.lights.shadow, b.lights.shadow, s),
      shadowOpacity: lerp(a.lights.shadowOpacity, b.lights.shadowOpacity, s),
      exposure: lerp(a.lights.exposure, b.lights.exposure, s),
      envIntensity: lerp(a.lights.envIntensity, b.lights.envIntensity, s),
      clearcoat: lerp(a.lights.clearcoat, b.lights.clearcoat, s),
      bg: lerpHex(a.lights.bg, b.lights.bg, s),
    },
  };
}

export function themeAt(t: number): PaperTheme {
  const x = clamp01(t);
  if (x <= 0.5) return mixTheme(WHITE, POSTER, x / 0.5);
  return mixTheme(POSTER, DARK, (x - 0.5) / 0.5);
}

export function themeLabel(t: number) {
  if (t < 0.25) return "White";
  if (t > 0.75) return "Dark";
  return "Poster";
}

export function readStoredTheme(): number {
  if (typeof window === "undefined") return DEFAULT_THEME_T;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw == null) return DEFAULT_THEME_T;
    const n = Number(raw);
    if (!Number.isFinite(n)) return DEFAULT_THEME_T;
    return clamp01(n);
  } catch {
    return DEFAULT_THEME_T;
  }
}

const themeListeners = new Set<() => void>();
let themeSnapshot = DEFAULT_THEME_T;

if (typeof window !== "undefined") {
  themeSnapshot = readStoredTheme();
}

export function getThemeSnapshot() {
  return themeSnapshot;
}

export function subscribeTheme(listener: () => void) {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

export function persistTheme(t: number) {
  const next = Math.min(1, Math.max(0, t));
  themeSnapshot = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, String(next));
  } catch {
    /* private mode */
  }
  themeListeners.forEach((fn) => fn());
}

export function applyThemeCss(theme: PaperTheme, t: number, el: HTMLElement = document.documentElement) {
  const inkRgb = hexToRgb(theme.ink).join(" ");
  const cobaltRgb = hexToRgb(theme.cobalt).join(" ");
  el.style.setProperty("--paper", theme.paper);
  el.style.setProperty("--paper-deep", theme.paperDeep);
  el.style.setProperty("--ink", theme.ink);
  el.style.setProperty("--cobalt", theme.cobalt);
  el.style.setProperty("--stone", theme.stone);
  el.style.setProperty("--stone-dark", theme.stoneDark);
  el.style.setProperty("--stone-top", theme.stoneTop);
  el.style.setProperty("--arch", theme.arch);
  el.style.setProperty("--orb-0", theme.orb0);
  el.style.setProperty("--orb-1", theme.orb1);
  el.style.setProperty("--orb-2", theme.orb2);
  el.style.setProperty("--orb-3", theme.orb3);
  el.style.setProperty("--grain-opacity", String(theme.grainOpacity));
  el.style.setProperty("--grain-blend", theme.grainBlend);
  el.style.setProperty("--bust-blend", theme.bustBlend);
  el.style.setProperty("--hands-plate-blend", theme.handsPlateBlend);
  el.style.setProperty("--plinth-filter", theme.plinthFilter);
  el.style.setProperty("--background", theme.paper);
  el.style.setProperty("--foreground", theme.ink);
  el.style.setProperty("--card", theme.paper);
  el.style.setProperty("--card-foreground", theme.ink);
  el.style.setProperty("--popover", theme.paper);
  el.style.setProperty("--popover-foreground", theme.ink);
  el.style.setProperty("--primary", theme.cobalt);
  el.style.setProperty("--primary-foreground", theme.paper);
  el.style.setProperty("--secondary", theme.stone);
  el.style.setProperty("--secondary-foreground", theme.ink);
  el.style.setProperty("--muted", theme.stone);
  el.style.setProperty("--muted-foreground", theme.ink);
  el.style.setProperty("--accent", theme.paperDeep);
  el.style.setProperty("--accent-foreground", theme.ink);
  el.style.setProperty("--border", `rgb(${cobaltRgb} / 22%)`);
  el.style.setProperty("--input", `rgb(${inkRgb} / 14%)`);
  el.style.setProperty("--ring", theme.cobalt);
  el.style.setProperty("--sidebar", theme.paper);
  el.style.setProperty("--sidebar-foreground", theme.ink);
  el.style.setProperty("--sidebar-primary", theme.cobalt);
  el.style.setProperty("--accent-trim", theme.cobalt);
  el.dataset.themeT = String(t);
  el.dataset.paper = t < 0.33 ? "white" : t > 0.66 ? "dark" : "poster";
}
