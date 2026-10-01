/**
 * Phone side. Lazily imported by components/cast/CastSender.tsx.
 *  - custom mode: streams the engine's own state (story progress, theme, inspection camera) to the Quackles receiver;
 *    the phone's rendering is untouched.
 *  - basic mode (no App ID): loads the current scene as a still on Google's Default Media Receiver, debounced.
 */
import { snapshot, subscribe } from "../sequence/store";
import { inspectionSnapshot, subscribeInspection } from "../sequence/inspection";
import { parseManifest, type SequenceManifest } from "../sequence/manifest";
import { assetPath } from "../paths";
import { encode, decode, Pacer, type CastView } from "./protocol";
import { castMedia, MediaDebounce, type CastMedia } from "./media";
import { CAST_BUILD, CAST_DOCS_URL, CAST_PREVIEW_ID, RECEIVER_HELLO_TIMEOUT_MS, castErrorMessage, type CastMode, type CastTransportKind } from "./config";
import { cafSender, shimSender, type SenderTransport, type SessionState } from "./transport";

export type CastNotice = { kind: "info" | "error"; text: string; href?: string };
type SenderDebug = { getState: () => { mode: CastMode["kind"]; state: SessionState; sent: number; bytes: number; maxBytes: number; loads: number; log: { t: number; view: CastView }[] } };
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

export const BASIC_NOTE: CastNotice = {
  kind: "info",
  text: "Basic cast: the TV shows stills that follow theme and story. Zoom isn't mirrored; live sync needs a one-time setup.",
  href: CAST_DOCS_URL,
};

let manifestJob: Promise<SequenceManifest> | null = null;
function loadManifest() {
  // Same URL the engine fetched, so this is a cache hit; parseManifest makes plate URLs absolute (base path included).
  manifestJob ??= fetch(assetPath(`/preview-scene/sequence/manifest.json?v=${encodeURIComponent(CAST_BUILD)}`))
    .then((response) => { if (!response.ok) throw new Error(`manifest ${response.status}`); return response.json().then((json) => parseManifest(json, response.url)); })
    .catch((error) => { manifestJob = null; throw error; });
  return manifestJob;
}

export async function startCastSender(options: {
  kind: CastTransportKind;
  mode: CastMode;
  onState: (state: SessionState) => void;
  onNotice: (notice: CastNotice | null) => void;
}): Promise<SenderControl | null> {
  const { mode } = options;
  const transport: SenderTransport | null = options.kind === "bc" ? shimSender() : await cafSender(mode.appId);
  if (!transport) return null;
  const sid = Math.random().toString(36).slice(2, 10);
  const pacer = new Pacer();
  const debounce = new MediaDebounce();
  let seq = 0, raf = 0, connected = false, snapshotNext = true, state: SessionState = "unavailable", disposed = false;
  let sent = 0, bytes = 0, maxBytes = 0, loads = 0, mediaTimer = 0, helloTimer = 0, helloSeen = false;
  const log: { t: number; view: CastView }[] = [];
  const error = (code: unknown) => { const text = castErrorMessage(code); if (text && !disposed) options.onNotice({ kind: "error", text }); };

  // ---- custom mode: state stream
  const frame = () => {
    raf = 0;
    if (!connected || mode.kind !== "custom") return;
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
  const schedule = () => { if (!raf && connected && mode.kind === "custom") raf = requestAnimationFrame(frame); };
  const resync = () => { snapshotNext = true; pacer.force(); schedule(); };

  // ---- basic mode: debounced stills
  let shown: CastMedia | null = null, latest: CastMedia | null = null;
  const load = (media: CastMedia) => {
    loads++;
    shown = media;
    transport.loadMedia(media).catch((code) => { if (shown === media) error(code ?? "load_media_failed"); });
  };
  const offerMedia = (force: boolean) => {
    if (!connected || mode.kind !== "basic") return;
    void loadManifest().then((manifest) => {
      if (!connected || disposed) return;
      const media = castMedia(manifest, snapshot());
      latest = media;
      if (debounce.offer(media.key, performance.now(), force) === media.key) { load(media); return; }
      window.clearTimeout(mediaTimer);
      const at = debounce.nextDueAt();
      if (at === null) return;
      mediaTimer = window.setTimeout(() => {
        if (!connected || disposed) return;
        const key = debounce.due(performance.now());
        if (key && latest?.key === key) load(latest); // the pending key is always the latest offered one
      }, Math.max(0, at - performance.now()) + 5);
    }).catch(() => error("load_media_failed"));
  };

  transport.onMessage((raw) => {
    if (decode(raw)?.kind !== "hello") return;
    // The hello may beat the CONNECTED cast state (it is sent on SENDER_CONNECTED): remember it for this session.
    helloSeen = true;
    window.clearTimeout(helloTimer); helloTimer = 0;
    resync();
  });
  transport.onState((next) => {
    state = next;
    const was = connected;
    connected = next === "connected";
    if (connected && !was) {
      if (mode.kind === "custom") {
        resync();
        window.clearTimeout(helloTimer);
        if (options.kind === "caf" && !helloSeen) helloTimer = window.setTimeout(() => error("receiver_silent"), RECEIVER_HELLO_TIMEOUT_MS);
      } else {
        options.onNotice(BASIC_NOTE);
        offerMedia(true);
      }
    }
    if (!connected && was) { window.clearTimeout(helloTimer); window.clearTimeout(mediaTimer); shown = null; helloSeen = false; }
    options.onState(next);
  });
  const storyChanged = () => { schedule(); offerMedia(false); };
  const unsubscribeStory = subscribe(storyChanged);
  const unsubscribeCamera = subscribeInspection(schedule);
  window.__QUACKLES_CAST_SENDER__ = { getState: () => ({ mode: mode.kind, state, sent, bytes, maxBytes, loads, log: log.slice() }) };
  return {
    start: () => { if (!connected) helloSeen = false; options.onNotice(null); transport.start().catch(error); },
    stop: () => transport.stop(),
    dispose() {
      disposed = true; cancelAnimationFrame(raf); connected = false;
      window.clearTimeout(helloTimer); window.clearTimeout(mediaTimer);
      unsubscribeStory(); unsubscribeCamera(); transport.dispose();
      delete window.__QUACKLES_CAST_SENDER__;
    },
  };
}
