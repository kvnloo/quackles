export type ThemeRelease = { from: number; to: number; start: number };

const EASE_MS = 180;

function ease(t: number) {
  const p = Math.min(1, Math.max(0, t));
  return 1 - (1 - p) ** 3;
}

/** Visible theme. A zoom does not move until the tiles for that move are decoded. */
export function syncedTheme(input: {
  requested: number;
  held: number;
  ready: boolean[];
  now: number;
  release: ThemeRelease | null;
}): { theme: number; release: ThemeRelease | null } {
  const low = Math.max(0, Math.floor(input.requested));
  const high = Math.min(input.ready.length - 1, Math.ceil(input.requested));
  if (!(input.ready[low] && input.ready[high])) return { theme: input.held, release: null };
  if (input.release && input.release.to === input.requested) {
    const p = (input.now - input.release.start) / EASE_MS;
    const theme = input.release.from + (input.release.to - input.release.from) * ease(p);
    return p < 1 ? { theme, release: input.release } : { theme: input.requested, release: null };
  }
  if (Math.abs(input.requested - input.held) < 0.001) return { theme: input.requested, release: null };
  if (Math.abs(input.requested - Math.round(input.requested)) > 0.001) return { theme: input.requested, release: null };
  return { theme: input.held, release: { from: input.held, to: input.requested, start: input.now } };
}
