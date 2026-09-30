/**
 * Phone side. Reads the engine's own state (story progress, theme, inspection camera) and sends it; the phone's
 * rendering is untouched (no buffer, no extra work on its frame path beyond one comparison per frame while casting).
 * Lazily imported by components/cast/CastSender.tsx.
 */
import { snapshot, subscribe } from "../sequence/store";
import { inspectionSnapshot, subscribeInspection } from "../sequence/inspection";
import { encode, decode, Pacer, type CastView } from "./protocol";
import { CAST_BUILD, CAST_PREVIEW_ID, type CastTransportKind } from "./config";
import { cafSender, shimSender, type SenderTransport, type SessionState } from "./transport";

type SenderDebug = { getState: () => { state: SessionState; sent: number; bytes: number; maxBytes: number; log: { t: number; view: CastView }[] } };
declare global { interface Window { __QUACKLES_CAST_SENDER__?: SenderDebug } }

export type SenderControl = { start(): void; stop(): void; dispose(): void };

const now = () => performance.timeOrigin + performance.now();

export function currentView(): CastView {
  const story = snapshot(), camera = inspectionSnapshot();
  return {
    progress: story.progress,
    theme: story.theme,
    zoom: camera.zoom,
    focusX: camera.focusX,
    focusY: camera.focusY,
    inspecting: camera.active,
    reducedMotion: story.reducedMotion,
  };
}

export async function startCastSender(options: { kind: CastTransportKind; appId: string | null; onState: (state: SessionState) => void }): Promise<SenderControl | null> {
  const transport: SenderTransport | null = options.kind === "bc" ? shimSender() : options.appId ? await cafSender(options.appId) : null;
  if (!transport) return null;
  const sid = Math.random().toString(36).slice(2, 10);
  const pacer = new Pacer();
  let seq = 0, raf = 0, connected = false, snapshotNext = true, state: SessionState = "unavailable";
  let sent = 0, bytes = 0, maxBytes = 0;
  const log: { t: number; view: CastView }[] = [];

  const frame = () => {
    raf = 0;
    if (!connected) return;
    const view = pacer.tick(performance.now(), currentView());
    if (view) {
      const t = now();
      const raw = encode({ kind: "state", sid, seq: seq++, t, snapshot: snapshotNext, view, ...(snapshotNext ? { preview: CAST_PREVIEW_ID, build: CAST_BUILD } : {}) });
      transport.send(raw);
      snapshotNext = false;
      sent++; bytes += raw.length; maxBytes = Math.max(maxBytes, raw.length);
      log.push({ t, view }); if (log.length > 2000) log.shift();
    }
    if (pacer.pending) schedule();
  };
  const schedule = () => { if (!raf && connected) raf = requestAnimationFrame(frame); };
  const resync = () => { snapshotNext = true; pacer.force(); schedule(); };

  transport.onMessage((raw) => { if (decode(raw)?.kind === "hello") resync(); });
  transport.onState((next) => {
    state = next;
    const was = connected;
    connected = next === "connected";
    if (connected && !was) resync();
    options.onState(next);
  });
  const unsubscribeStory = subscribe(schedule);
  const unsubscribeCamera = subscribeInspection(schedule);
  window.__QUACKLES_CAST_SENDER__ = { getState: () => ({ state, sent, bytes, maxBytes, log: log.slice() }) };
  return {
    start: () => transport.start(),
    stop: () => transport.stop(),
    dispose() {
      cancelAnimationFrame(raf); connected = false;
      unsubscribeStory(); unsubscribeCamera(); transport.dispose();
      delete window.__QUACKLES_CAST_SENDER__;
    },
  };
}
