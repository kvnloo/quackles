/**
 * Cast transports: the real Google Cast SDK (CAF) and a same-origin BroadcastChannel shim with the SAME interface,
 * so the headless tests drive the exact sender/receiver code paths. Loaded lazily (never in the first-load bundle).
 */
import { CAST_NAMESPACE } from "./protocol";
import { RECEIVER_SDK, SENDER_SDK } from "./config";

export type SessionState = "unavailable" | "idle" | "connecting" | "connected";
export interface SenderTransport {
  onState(listener: (state: SessionState) => void): void;
  onMessage(listener: (raw: unknown) => void): void;
  /** Must be called from a user gesture (opens the Cast device picker). */
  start(): void;
  stop(): void;
  send(raw: string): void;
  dispose(): void;
}
export interface ReceiverTransport {
  onMessage(listener: (raw: unknown, senderId: string | undefined) => void): void;
  /** A sender joined (or rejoined): the receiver asks it for a snapshot. */
  onSender(listener: (senderId: string | undefined) => void): void;
  send(raw: string, senderId?: string): void;
  start(): void;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.append(script);
  });
}

// ---------------------------------------------------------------- BroadcastChannel shim (tests; same machine only)
const BC_NAME = "quackles-cast-shim";
type ShimPacket = { to: "receiver" | "sender"; raw: string; from?: string };
/** Optional simulated network: ?castNetDelay=ms&castNetJitter=ms (uniform) on the receiving page. */
function shimDelay(search: string) {
  const params = new URLSearchParams(search);
  const delay = Number(params.get("castNetDelay") ?? 0) || 0;
  const jitter = Number(params.get("castNetJitter") ?? 0) || 0;
  return () => delay + Math.random() * jitter;
}

export function shimSender(): SenderTransport {
  const channel = new BroadcastChannel(BC_NAME);
  const id = `bc-${Math.random().toString(36).slice(2, 8)}`;
  const delay = shimDelay(location.search);
  let state: SessionState = "idle";
  let stateListener: (state: SessionState) => void = () => {};
  let messageListener: (raw: unknown) => void = () => {};
  const set = (next: SessionState) => { state = next; stateListener(next); };
  channel.onmessage = (event: MessageEvent<ShimPacket>) => {
    if (event.data?.to !== "sender" || state !== "connected") return;
    const raw = event.data.raw;
    window.setTimeout(() => messageListener(raw), delay());
  };
  return {
    onState(listener) { stateListener = listener; listener(state); },
    onMessage(listener) { messageListener = listener; },
    start() { set("connecting"); window.setTimeout(() => set("connected"), 30); },
    stop() { set("idle"); },
    send(raw) { if (state === "connected") channel.postMessage({ to: "receiver", raw, from: id } satisfies ShimPacket); },
    dispose() { channel.close(); },
  };
}

export function shimReceiver(): ReceiverTransport {
  const channel = new BroadcastChannel(BC_NAME);
  const delay = shimDelay(location.search);
  let messageListener: (raw: unknown, senderId: string | undefined) => void = () => {};
  let senderListener: (senderId: string | undefined) => void = () => {};
  return {
    onMessage(listener) { messageListener = listener; },
    onSender(listener) { senderListener = listener; },
    send(raw) { channel.postMessage({ to: "sender", raw } satisfies ShimPacket); },
    start() {
      channel.onmessage = (event: MessageEvent<ShimPacket>) => {
        if (event.data?.to !== "receiver") return;
        const { raw, from } = event.data;
        const wait = delay();
        if (wait <= 0) messageListener(raw, from);
        else window.setTimeout(() => messageListener(raw, from), wait);
      };
      senderListener(undefined);
    },
  };
}

// ---------------------------------------------------------------- Google Cast (CAF) — minimal typed surface
type Listener<E> = (event: E) => void;
type CafSession = {
  addMessageListener(namespace: string, listener: (namespace: string, message: string) => void): void;
  sendMessage(namespace: string, message: string): Promise<unknown>;
};
type CafContext = {
  setOptions(options: { receiverApplicationId: string; autoJoinPolicy: string }): void;
  addEventListener(type: string, listener: Listener<{ castState?: string; sessionState?: string }>): void;
  getCurrentSession(): CafSession | null;
  getCastState(): string;
  requestSession(): Promise<unknown>;
  endCurrentSession(stopCasting: boolean): void;
};
type SenderGlobals = {
  cast: { framework: { CastContext: { getInstance(): CafContext }; CastContextEventType: Record<string, string> } };
  chrome: { cast: { AutoJoinPolicy: Record<string, string> } };
  __onGCastApiAvailable?: (available: boolean) => void;
};

/** Loads the Web Sender SDK (only ever called in a Cast-capable Chrome, after first paint, at idle). */
export async function cafSender(appId: string): Promise<SenderTransport | null> {
  const w = window as unknown as SenderGlobals;
  const available = new Promise<boolean>((resolve) => { w.__onGCastApiAvailable = resolve; });
  try { await loadScript(SENDER_SDK); } catch { return null; }
  if (!(await available)) return null;
  const framework = w.cast.framework;
  const context = framework.CastContext.getInstance();
  context.setOptions({ receiverApplicationId: appId, autoJoinPolicy: w.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED });
  let stateListener: (state: SessionState) => void = () => {};
  let messageListener: (raw: unknown) => void = () => {};
  let attached: CafSession | null = null;
  let disposed = false;
  const map: Record<string, SessionState> = { NO_DEVICES_AVAILABLE: "unavailable", NOT_CONNECTED: "idle", CONNECTING: "connecting", CONNECTED: "connected" };
  const sync = () => {
    if (disposed) return;
    const state = map[context.getCastState()] ?? "unavailable";
    const session = context.getCurrentSession();
    if (session && session !== attached) {
      attached = session;
      session.addMessageListener(CAST_NAMESPACE, (_namespace, message) => { if (!disposed) messageListener(message); });
    }
    if (!session) attached = null;
    // "connected" only once the message channel is attached, so the first thing the sender does is a snapshot.
    stateListener(state === "connected" && !attached ? "connecting" : state);
  };
  context.addEventListener(framework.CastContextEventType.CAST_STATE_CHANGED, sync);
  context.addEventListener(framework.CastContextEventType.SESSION_STATE_CHANGED, sync);
  return {
    onState(listener) { stateListener = listener; sync(); },
    onMessage(listener) { messageListener = listener; },
    start() { void context.requestSession().catch(() => sync()); },
    stop() { context.endCurrentSession(true); },
    send(raw) { void attached?.sendMessage(CAST_NAMESPACE, raw).catch(() => {}); },
    dispose() { disposed = true; },
  };
}

type ReceiverGlobals = {
  cast: {
    framework: {
      CastReceiverContext: { getInstance(): {
        addCustomMessageListener(namespace: string, listener: Listener<{ data: unknown; senderId: string }>): void;
        addEventListener(type: string, listener: Listener<{ senderId: string; reason?: string }>): void;
        sendCustomMessage(namespace: string, senderId: string | undefined, data: unknown): void;
        getSenders(): unknown[];
        start(options: object): void;
        stop(): void;
      } };
      CastReceiverOptions: new () => Record<string, unknown>;
      system: { EventType: Record<string, string>; MessageType: Record<string, string>; DisconnectReason: Record<string, string> };
    };
  };
};

/** Receiver side of CAF: a custom namespace, no media players, and our own idle policy. */
export async function cafReceiver(): Promise<ReceiverTransport> {
  await loadScript(RECEIVER_SDK);
  const { framework } = (window as unknown as ReceiverGlobals).cast;
  const context = framework.CastReceiverContext.getInstance();
  const system = framework.system;
  let messageListener: (raw: unknown, senderId: string | undefined) => void = () => {};
  let senderListener: (senderId: string | undefined) => void = () => {};
  let lonely = 0;
  return {
    onMessage(listener) { messageListener = listener; },
    onSender(listener) { senderListener = listener; },
    send(raw, senderId) { context.sendCustomMessage(CAST_NAMESPACE, senderId, JSON.parse(raw)); },
    start() {
      context.addCustomMessageListener(CAST_NAMESPACE, (event) => messageListener(event.data, event.senderId));
      context.addEventListener(system.EventType.SENDER_CONNECTED, (event) => {
        window.clearTimeout(lonely);
        senderListener(event.senderId);
      });
      context.addEventListener(system.EventType.SENDER_DISCONNECTED, (event) => {
        if (context.getSenders().length) return;
        // "Stop casting" on the phone ends the app now; a dropped/reloading phone gets a minute to rejoin.
        if (event.reason === system.DisconnectReason.REQUESTED_BY_SENDER) context.stop();
        else lonely = window.setTimeout(() => { if (!context.getSenders().length) context.stop(); }, 60_000);
      });
      const options = new framework.CastReceiverOptions();
      options.customNamespaces = { [CAST_NAMESPACE]: system.MessageType.JSON };
      options.skipPlayersLoad = true; // no media element: do not download MPL/Shaka onto the device
      options.disableIdleTimeout = true; // CAF would otherwise close a media-less app after 5 minutes
      options.statusText = "Quackles";
      context.start(options);
    },
  };
}
