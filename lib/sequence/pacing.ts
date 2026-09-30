/**
 * Story pacing: page scroll fraction -> authored story progress.
 *
 * Plates, camera poses and copy beats are all keyed on authored progress; this
 * map only decides how much page scroll each part of the story gets.
 * KNOTS are [scroll, story] pairs, strictly increasing, from (0,0) to (1,1).
 */
export const KNOTS: readonly (readonly [number, number])[] = [[0, 0], [1, 1]];

function through(value: number, from: 0 | 1, to: 0 | 1): number {
  const v = Math.max(0, Math.min(1, value));
  let i = 1;
  while (i < KNOTS.length - 1 && KNOTS[i][from] < v) i++;
  const a = KNOTS[i - 1], b = KNOTS[i];
  const span = b[from] - a[from];
  return span <= 0 ? b[to] : a[to] + ((v - a[from]) / span) * (b[to] - a[to]);
}
/** Authored story progress shown at a page scroll fraction. */
export function storyAt(scroll: number): number { return through(scroll, 0, 1); }
/** Page scroll fraction that shows an authored story progress (inverse of storyAt). */
export function scrollAt(story: number): number { return through(story, 1, 0); }
