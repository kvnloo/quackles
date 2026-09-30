/**
 * Story pacing: page scroll fraction -> authored story progress.
 *
 * Plates, camera poses and copy beats are all keyed on authored progress; this
 * map only decides how much page scroll each part of the story gets.
 * KNOTS are [scroll, story] pairs, strictly increasing, from (0,0) to (1,1):
 * one per plate, placed so that page scroll per span is proportional to the
 * measured on-screen motion of that span (mean p90 optical flow, plus a 10%
 * dwell floor) inside each authored segment. Phase anchors stay fixed
 * (.08 .30 .56 .62 .84 .92). Source: process/analysis/scroll/plates/retime.json.
 */
export const KNOTS: readonly (readonly [number, number])[] = [
  [0.0, 0], [0.08, 0.08], [0.0907, 0.09], [0.1036, 0.1], [0.1183, 0.11], [0.1343, 0.12],
  [0.1498, 0.13], [0.1656, 0.14], [0.1808, 0.15], [0.1955, 0.16], [0.2099, 0.17], [0.2242, 0.18],
  [0.2486, 0.2], [0.2706, 0.22], [0.2877, 0.24], [0.3, 0.3], [0.3044, 0.34], [0.3178, 0.36],
  [0.3497, 0.38], [0.3834, 0.4], [0.4137, 0.42], [0.4344, 0.45], [0.4552, 0.48], [0.4853, 0.5],
  [0.5183, 0.52], [0.547, 0.54], [0.56, 0.56], [0.5685, 0.58], [0.5882, 0.6], [0.6031, 0.61],
  [0.62, 0.62], [0.6296, 0.63], [0.64, 0.64], [0.6511, 0.65], [0.663, 0.66], [0.6752, 0.67],
  [0.6871, 0.68], [0.699, 0.69], [0.7114, 0.7], [0.724, 0.71], [0.7367, 0.72], [0.75, 0.73],
  [0.762, 0.74], [0.7738, 0.75], [0.7845, 0.76], [0.7948, 0.77], [0.8043, 0.78], [0.8181, 0.8],
  [0.8304, 0.82], [0.84, 0.84], [0.92, 0.92], [1.0, 1],
];

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
