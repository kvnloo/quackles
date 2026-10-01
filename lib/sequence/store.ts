import { THEME_IDS, type SequenceManifest, type ThemeId } from "./manifest";
import { PREVIEW } from "../preview";
import { previewStartTheme } from "./preview-policy";

type State = { progress: number; theme: number; target: number; presented: number; reducedMotion: boolean };
const START = previewStartTheme(PREVIEW);
let state: State = { progress: 0, theme: START, target: START, presented: START, reducedMotion: false };
let manifest: SequenceManifest | null = null;
let displayedTheme = -1;
let animation = 0;
const listeners = new Set<() => void>();
export const snapshot = () => state;
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function mix(a: string, b: string, t: number) {
  const value = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const first = value(a), second = value(b);
  return `#${first.map((v, i) => Math.round(v + (second[i] - v) * t).toString(16).padStart(2, "0")).join("")}`;
}
function publish(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}
export function applyPalette(theme: number) {
  if (manifest && theme !== displayedTheme) {
    const { indices, mix: fraction } = themeIndices(theme);
    const a = manifest.themes[indices[0]].palette, b = manifest.themes[indices[indices.length - 1]].palette;
    const root = document.documentElement;
    const paper = mix(a.paper, b.paper, fraction);
    const ink = mix(a.ink, b.ink, fraction);
    root.style.setProperty("--paper", paper);
    root.style.setProperty("--paper-deep", mix(a.deep, b.deep, fraction));
    root.style.setProperty("--ink", ink);
    root.style.setProperty("--cobalt", mix(a.cobalt, b.cobalt, fraction));
    root.style.setProperty("--background", paper);
    root.style.setProperty("--foreground", ink);
    root.dataset.tone = THEME_IDS[Math.round(indices[0] + fraction)];
    displayedTheme = theme;
  }
}
export function configure(manifestValue: SequenceManifest) {
  manifest = manifestValue;
  displayedTheme = -1;
  const preferred = Math.max(0, THEME_IDS.indexOf(manifestValue.defaultTheme));
  const theme = allowed.includes(preferred) ? preferred : allowed[0];
  publish({ ...state, theme, target: theme, presented: theme });
}
export function setProgress(progress: number) { publish({ ...state, progress: Math.max(0, Math.min(1, progress)) }); }
const MAX_THEME = THEME_IDS.length - 1;
/** Theme indices this build may show (preview config); drag/select/default stay inside [first, last]. */
let allowed: number[] = THEME_IDS.map((_, index) => index);
export function setThemeRange(indices: number[]) {
  const next = [...new Set(indices)].filter((index) => Number.isInteger(index) && index >= 0 && index <= MAX_THEME).sort((a, b) => a - b);
  if (next.length) allowed = next;
}
const clampTheme = (value: number, fallback: number) => (Number.isNaN(value) ? fallback : Math.max(allowed[0], Math.min(allowed[allowed.length - 1], value)));
/** Valid THEME_IDS indices (1 or 2) and blend for a possibly-fractional theme. */
export function themeIndices(theme: number): { indices: number[]; mix: number } {
  const t = clampTheme(theme, 0);
  const low = Math.floor(t), high = Math.min(MAX_THEME, Math.ceil(t)), mix = t - low;
  return low === high || mix < 1e-9 ? { indices: [low], mix: 0 } : { indices: [low, high], mix };
}
export function presentTheme(value: number) {
  const presented = clampTheme(value, state.presented);
  if (Math.abs(presented - state.presented) < 0.0001) return;
  publish({ ...state, presented });
}
export function setReducedMotion(reducedMotion: boolean) {
  if (reducedMotion) cancelAnimationFrame(animation);
  publish({ ...state, reducedMotion, theme: reducedMotion ? state.target : state.theme, presented: reducedMotion ? state.target : state.presented });
}
export function dragTheme(theme: number) {
  cancelAnimationFrame(animation);
  const next = clampTheme(theme, state.theme);
  publish({ ...state, theme: next, target: next });
}
export function selectTheme(id: ThemeId) {
  cancelAnimationFrame(animation);
  const target = THEME_IDS.indexOf(id), from = state.theme;
  if (!allowed.includes(target)) return;
  publish({ ...state, target });
  if (state.reducedMotion) { publish({ ...state, theme: target }); return; }
  const started = performance.now();
  const tick = (now: number) => {
    // rAF timestamps are frame-start times and can predate `started`: clamp p to [0,1] or the ease undershoots out of range.
    const p = Math.max(0, Math.min(1, (now - started) / 180)), eased = 1 - (1 - p) ** 3;
    publish({ ...state, theme: from + (target - from) * eased });
    if (p < 1) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
}
