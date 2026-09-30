/**
 * TV side. Remote state is played out through a fixed-latency jitter buffer and applied through the SAME engine
 * stores the phone's input handlers write (story progress, theme, inspection camera); the engine then fetches its
 * own plates and tiles from the network with the receiver perf profile (lib/cast/engine/perf-profile.ts).
 */
import { dragTheme, setProgress, snapshot } from "../sequence/store";
import { inspectionSnapshot, setInspectionState } from "../sequence/inspection";
import { inspectionCrop } from "../sequence/render";
import { decode, encode, JitterBuffer, RECEIVER_DELAY_MS, SeqGate, type CastView } from "./protocol";
import { CAST_BUILD, CAST_PREVIEW_ID, type CastTransportKind } from "./config";
import { cafReceiver, shimReceiver } from "./transport";

export type ReceiverStatus = { connected: boolean; buildMatch: boolean | null; previewMatch: boolean | null };
type ReceiverDebug = {
  getState: () => {
    received: number; stale: number; resets: number; offsetMs: number; delayMs: number;
    senderBuild: string | null; buildMatch: boolean | null; applied: CastView | null;
    log: { at: number; view: CastView }[];
  };
};
declare global { interface Window { __QUACKLES_CAST__?: ReceiverDebug } }

const now = () => performance.timeOrigin + performance.now();
/** The camera counts as moving until it has been still this long (the engine defers decodes while it moves). */
const STILL_MS = 120;

export async function startCastReceiver(options: {
  kind: CastTransportKind;
  frame: HTMLElement;
  camera: HTMLElement;
  onStatus: (status: ReceiverStatus) => void;
}): Promise<() => void> {
  const { frame, camera } = options;
  const transport = options.kind === "bc" ? shimReceiver() : await cafReceiver();
  const gate = new SeqGate();
  const buffer = new JitterBuffer({ delayMs: RECEIVER_DELAY_MS });
  let received = 0, stale = 0, resets = 0, raf = 0, stopped = false;
  let senderBuild: string | null = null, buildMatch: boolean | null = null, previewMatch: boolean | null = null;
  let applied: CastView | null = null, movingUntil = 0;
  let rect = frame.getBoundingClientRect();
  const log: { at: number; view: CastView }[] = [];
  const resize = new ResizeObserver(() => { rect = frame.getBoundingClientRect(); if (applied) place(applied); });
  resize.observe(frame);

  const place = (view: CastView) => {
    frame.dataset.inspecting = view.inspecting || view.zoom > 1.002 ? "true" : "false";
    if (view.zoom <= 1.0005) { camera.style.transform = "none"; camera.style.transformOrigin = "0 0"; return; }
    // Same camera mapping as components/sequence/HeroInspection.tsx (normalised to the 2:3 frame on both screens).
    const crop = inspectionCrop(view.zoom, view.focusX, view.focusY);
    camera.style.transformOrigin = "0 0";
    camera.style.transform = `matrix(${view.zoom}, 0, 0, ${view.zoom}, ${-crop.x * view.zoom * rect.width}, ${-crop.y * view.zoom * rect.height})`;
  };

  const apply = (view: CastView, at: number) => {
    const story = snapshot();
    if (Math.abs(story.progress - view.progress) > 1e-6) setProgress(view.progress);
    if (Math.abs(story.theme - view.theme) > 1e-5 || Math.abs(story.target - view.theme) > 1e-5) dragTheme(view.theme);
    const moved = !applied || Math.abs(applied.zoom - view.zoom) > 1e-5 || Math.abs(applied.focusX - view.focusX) > 1e-6 || Math.abs(applied.focusY - view.focusY) > 1e-6;
    if (moved && applied) movingUntil = at + STILL_MS;
    const moving = at < movingUntil;
    const active = view.inspecting || view.zoom > 1.002;
    const camera = inspectionSnapshot();
    if (moved || camera.cameraMoving !== moving || camera.active !== active) {
      setInspectionState({
        active, zoom: view.zoom, targetZoom: view.zoom, zoomVelocity: 0,
        focusX: view.focusX, focusY: view.focusY, targetFocusX: view.focusX, targetFocusY: view.focusY,
        focusVelocityX: 0, focusVelocityY: 0, cameraMoving: moving, dragging: false,
      });
    }
    if (moved || !applied || applied.inspecting !== view.inspecting) place(view);
    applied = view;
    log.push({ at, view }); if (log.length > 4000) log.shift();
  };

  const tick = () => {
    raf = 0;
    if (stopped) return;
    const at = now();
    const view = buffer.sample(at);
    // Holding still (same sample object) costs nothing beyond letting the "moving" flag expire.
    if (view && (view !== applied || inspectionSnapshot().cameraMoving)) apply(view, at);
    raf = requestAnimationFrame(tick);
  };

  transport.onMessage((raw) => {
    const message = decode(raw);
    if (!message || message.kind !== "state") return;
    const verdict = gate.accept(message);
    if (verdict === "stale") { stale++; return; }
    if (verdict === "reset") { buffer.reset(); resets++; }
    received++;
    buffer.push(message.t, now(), message.view);
    if (message.snapshot) {
      senderBuild = message.build ?? null;
      buildMatch = senderBuild === null ? null : senderBuild === CAST_BUILD;
      previewMatch = message.preview === undefined ? null : message.preview === CAST_PREVIEW_ID;
      options.onStatus({ connected: true, buildMatch, previewMatch });
    }
  });
  transport.onSender((senderId) => transport.send(encode({ kind: "hello", build: CAST_BUILD }), senderId));
  window.__QUACKLES_CAST__ = {
    getState: () => ({ received, stale, resets, offsetMs: buffer.offset, delayMs: RECEIVER_DELAY_MS, senderBuild, buildMatch, applied, log: log.slice() }),
  };
  transport.start();
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true; cancelAnimationFrame(raf); resize.disconnect();
    delete window.__QUACKLES_CAST__;
  };
}
