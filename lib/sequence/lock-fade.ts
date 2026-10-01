/** Sharp-lock dissolve. The plate underlay and the sharp master are independently rendered (registered only to ~0.35 plate px),
 * so an instant swap reads as a small snap at high zoom. A short dissolve on FIRST appearance hides it; repaints of an
 * already-visible layer never re-fade; reduced motion is instant. */
export const LOCK_FADE_MS = 160;
export function lockFadeMs(reducedMotion: boolean): number { return reducedMotion ? 0 : LOCK_FADE_MS; }

/** Call BEFORE painting a fresh (previously hidden) detail canvas. */
export function armLockFade(canvas: HTMLElement, reducedMotion: boolean) {
  if (lockFadeMs(reducedMotion) === 0) { canvas.style.transition = "none"; canvas.style.opacity = "1"; return; }
  canvas.style.transition = "none"; canvas.style.opacity = "0";
}
/** Call AFTER painting it. */
export function startLockFade(canvas: HTMLElement, reducedMotion: boolean) {
  const ms = lockFadeMs(reducedMotion); if (ms === 0) return;
  void canvas.offsetWidth; // commit opacity:0 before transitioning
  canvas.style.transition = `opacity ${ms}ms ease-out`; canvas.style.opacity = "1";
}
