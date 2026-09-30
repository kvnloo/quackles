/**
 * Quackles Cast state protocol (pure; no DOM, no Cast SDK).
 *
 * The TV runs its own copy of the engine and fetches plates + deep-zoom tiles straight from the network; the phone
 * only sends this small state. Every state message is a FULL state (~90 bytes), so a lost or reordered message is
 * never corrupting: the receiver keeps the newest by seq and interpolates between them with a fixed delay.
 *
 * Wire form (JSON text, or the parsed object when CAF's JSON namespace delivers it):
 *   state  {"v":1,"k":"s","i":sid,"n":seq,"t":senderMs,"s":[progress,theme,zoom,focusX,focusY,flags],"f":1?,"pv"?,"b"?}
 *   hello  {"v":1,"k":"h","b":build}           receiver -> sender: "send me a snapshot" (connect / resync)
 * f=1 marks a snapshot (sent on connect and on hello); pv (preview id) and b (build SHA, asset-version parity)
 * ride only on snapshots.
 */

export const CAST_NAMESPACE = "urn:x-cast:ai.quackles.state";
export const PROTOCOL_VERSION = 1;
/** Highest theme index (THEME_IDS.length - 1; a contract test pins the parity). */
export const THEME_MAX = 4;
/** Engine cap (lib/sequence/inspection.ts MAX_ZOOM_CAP). */
export const ZOOM_MAX = 24;
/** Sender cap. Frames are coalesced to the display frame and at most this many messages leave per second. */
export const SEND_HZ = 30;
/** Receiver playout delay: a sample is shown this long after it would ideally arrive, which absorbs network jitter. */
export const RECEIVER_DELAY_MS = 80;
/** Longest span the receiver interpolates across; a longer gap means the sender was idle, not moving slowly. */
const MAX_INTERP_MS = 1.5 * (1000 / SEND_HZ);

export type CastView = {
  progress: number;
  /** Fractional theme index (a drag between two scenes is a blend). */
  theme: number;
  zoom: number;
  focusX: number;
  focusY: number;
  inspecting: boolean;
};
export type StateMessage = {
  kind: "state";
  /** Sender session id (a new page load = a new session). */
  sid: string;
  seq: number;
  /** Sender clock, ms (performance.timeOrigin + performance.now()). */
  t: number;
  snapshot: boolean;
  view: CastView;
  preview?: string;
  build?: string;
};
export type HelloMessage = { kind: "hello"; build: string };
export type CastMessage = StateMessage | HelloMessage;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const round = (value: number, places: number) => {
  const k = 10 ** places;
  return Math.round(value * k) / k;
};
const QUANTA = { progress: 5, theme: 4, zoom: 4, focus: 5 } as const;

export function clampView(view: CastView): CastView {
  return {
    progress: clamp(view.progress, 0, 1),
    theme: clamp(view.theme, 0, THEME_MAX),
    zoom: clamp(view.zoom, 1, ZOOM_MAX),
    focusX: clamp(view.focusX, 0, 1),
    focusY: clamp(view.focusY, 0, 1),
    inspecting: view.inspecting,
  };
}

function quantised(view: CastView) {
  const v = clampView(view);
  return [
    round(v.progress, QUANTA.progress),
    round(v.theme, QUANTA.theme),
    round(v.zoom, QUANTA.zoom),
    round(v.focusX, QUANTA.focus),
    round(v.focusY, QUANTA.focus),
    v.inspecting ? 1 : 0,
  ];
}

/** Equal at wire precision (a change below one quantum is not worth a message). */
export function sameView(a: CastView, b: CastView) {
  const x = quantised(a), y = quantised(b);
  return x.every((value, i) => value === y[i]);
}

export function encode(message: CastMessage): string {
  if (message.kind === "hello") return JSON.stringify({ v: PROTOCOL_VERSION, k: "h", b: message.build });
  const wire: Record<string, unknown> = {
    v: PROTOCOL_VERSION,
    k: "s",
    i: message.sid,
    n: message.seq,
    t: round(message.t, 1),
    s: quantised(message.view),
  };
  if (message.snapshot) wire.f = 1;
  if (message.preview !== undefined) wire.pv = message.preview;
  if (message.build !== undefined) wire.b = message.build;
  return JSON.stringify(wire);
}

const shortText = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Never throws. Returns null for anything that is not a well-formed v1 message; clamps in-range. */
export function decode(raw: unknown): CastMessage | null {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try { data = JSON.parse(raw); } catch { return null; }
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const m = data as Record<string, unknown>;
  if (m.v !== PROTOCOL_VERSION) return null;
  if (m.k === "h") return shortText(m.b, 64) ? { kind: "hello", build: m.b as string } : null;
  if (m.k !== "s") return null;
  if (!shortText(m.i, 64) || !Number.isInteger(m.n) || (m.n as number) < 0 || !finite(m.t)) return null;
  if (!Array.isArray(m.s) || m.s.length !== 6 || !m.s.every(finite)) return null;
  if (m.pv !== undefined && !shortText(m.pv, 64)) return null;
  if (m.b !== undefined && !shortText(m.b, 64)) return null;
  const [progress, theme, zoom, focusX, focusY, flags] = m.s as number[];
  const message: StateMessage = {
    kind: "state",
    sid: m.i as string,
    seq: m.n as number,
    t: m.t,
    snapshot: m.f === 1,
    view: clampView({ progress, theme, zoom, focusX, focusY, inspecting: (flags & 1) === 1 }),
  };
  if (m.pv !== undefined) message.preview = m.pv as string;
  if (m.b !== undefined) message.build = m.b as string;
  return message;
}

/**
 * Receiver-side ordering. Same session: only a higher seq is accepted (duplicates/late packets are stale).
 * A different session (the phone reloaded, or another phone) takes over only with a snapshot, so a straggler
 * from an old session cannot yank the TV back. The very first message a receiver sees is adopted.
 */
export class SeqGate {
  private sid: string | null = null;
  private seq = -1;
  accept(message: StateMessage): "accept" | "reset" | "stale" {
    if (this.sid === null || (message.sid !== this.sid && message.snapshot)) {
      this.sid = message.sid;
      this.seq = message.seq;
      return "reset";
    }
    if (message.sid !== this.sid || message.seq <= this.seq) return "stale";
    this.seq = message.seq;
    return "accept";
  }
}

/**
 * Sender pacing. Call tick() once per display frame with the current view. Returns the view to send (or null):
 * only on change (or after force()), never more often than SEND_HZ, and a throttled change stays pending so the
 * final state of a gesture is always delivered.
 */
export class Pacer {
  private last: CastView | null = null;
  private lastAt = -Infinity;
  private forced = false;
  pending = false;
  private readonly minIntervalMs: number;
  constructor(minIntervalMs = 1000 / SEND_HZ) { this.minIntervalMs = minIntervalMs; }
  force() { this.forced = true; this.pending = true; }
  tick(now: number, view: CastView): CastView | null {
    const changed = this.forced || !this.last || !sameView(view, this.last);
    if (!changed) { this.pending = false; return null; }
    if (now - this.lastAt < this.minIntervalMs - 0.5) { this.pending = true; return null; }
    this.last = view; this.lastAt = now; this.forced = false; this.pending = false;
    return view;
  }
}

type Sample = { t: number; view: CastView };

/**
 * Receiver playout buffer. The sender->receiver clock offset (plus the best-case one-way latency) is estimated as
 * the minimum of (receivedAt - sentAt) over a sliding window; the playhead runs at (now - offset - delay) in SENDER
 * time, so jitter up to roughly (delay - send interval) never shows as stutter. Beyond the newest sample it holds.
 */
export class JitterBuffer {
  private samples: Sample[] = [];
  private offsets: number[] = [];
  private readonly delayMs: number;
  private readonly window: number;
  constructor(options: { delayMs?: number; window?: number } = {}) {
    this.delayMs = options.delayMs ?? RECEIVER_DELAY_MS;
    this.window = options.window ?? 64;
  }
  get size() { return this.samples.length; }
  /** Best estimate of (receiver clock - sender clock + minimum latency), ms. */
  get offset() { return this.offsets.length ? Math.min(...this.offsets) : 0; }
  reset() { this.samples = []; this.offsets = []; }
  push(t: number, receivedAt: number, view: CastView) {
    this.offsets.push(receivedAt - t);
    if (this.offsets.length > this.window) this.offsets.shift();
    let i = this.samples.length;
    while (i > 0 && this.samples[i - 1].t > t) i--;
    this.samples.splice(i, 0, { t, view });
    if (this.samples.length > this.window) this.samples.shift();
  }
  sample(now: number): CastView | null {
    const list = this.samples;
    if (!list.length) return null;
    const playhead = now - this.offset - this.delayMs;
    if (playhead <= list[0].t) return list[0].view;
    const last = list[list.length - 1];
    if (playhead >= last.t) {
      if (list.length > 2) list.splice(0, list.length - 2);
      return last.view;
    }
    let b = 1;
    while (list[b].t < playhead) b++;
    const a = list[b - 1], next = list[b];
    if (b > 1) list.splice(0, b - 1);
    const start = Math.max(a.t, next.t - MAX_INTERP_MS);
    const u = playhead <= start ? 0 : (playhead - start) / (next.t - start);
    return interpolate(a.view, next.view, u);
  }
}

export function interpolate(a: CastView, b: CastView, u: number): CastView {
  const k = clamp(u, 0, 1);
  const lerp = (x: number, y: number) => x + (y - x) * k;
  return {
    progress: lerp(a.progress, b.progress),
    theme: lerp(a.theme, b.theme),
    zoom: a.zoom * (b.zoom / a.zoom) ** k,
    focusX: lerp(a.focusX, b.focusX),
    focusY: lerp(a.focusY, b.focusY),
    inspecting: k >= 1 ? b.inspecting : a.inspecting,
  };
}
