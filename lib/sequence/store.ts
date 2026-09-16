import { THEME_IDS, type SequenceManifest, type ThemeId } from "./manifest";

type State = { progress: number; theme: number; target: number; reducedMotion: boolean };
let state: State = { progress: 0, theme: 1, target: 1, reducedMotion: false };
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
    const low = Math.floor(theme), high = Math.ceil(theme), fraction = theme - low;
    const a = manifest.themes[low].palette, b = manifest.themes[high].palette;
    const root = document.documentElement;
    root.style.setProperty("--paper", mix(a.paper, b.paper, fraction));
    root.style.setProperty("--paper-deep", mix(a.deep, b.deep, fraction));
    root.style.setProperty("--ink", mix(a.ink, b.ink, fraction));
    root.style.setProperty("--cobalt", mix(a.cobalt, b.cobalt, fraction));
    root.dataset.tone = THEME_IDS[Math.round(theme)];
    displayedTheme = theme;
  }
}
export function configure(manifestValue: SequenceManifest) { manifest = manifestValue; displayedTheme = -1; publish({ ...state }); }
export function setProgress(progress: number) { publish({ ...state, progress: Math.max(0, Math.min(1, progress)) }); }
export function setReducedMotion(reducedMotion: boolean) {
  if (reducedMotion) cancelAnimationFrame(animation);
  publish({ ...state, reducedMotion, theme: reducedMotion ? state.target : state.theme });
}
export function dragTheme(theme: number) {
  cancelAnimationFrame(animation);
  publish({ ...state, theme: Math.max(0, Math.min(4, theme)) });
}
export function selectTheme(id: ThemeId) {
  cancelAnimationFrame(animation);
  const target = THEME_IDS.indexOf(id), from = state.theme;
  publish({ ...state, target });
  if (state.reducedMotion) { publish({ ...state, theme: target }); return; }
  const started = performance.now();
  const tick = (now: number) => {
    const p = Math.min(1, (now - started) / 180), eased = 1 - (1 - p) ** 3;
    publish({ ...state, theme: from + (target - from) * eased });
    if (p < 1) animation = requestAnimationFrame(tick);
  };
  animation = requestAnimationFrame(tick);
}
