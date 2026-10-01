/* Test double for the Google Cast Web Sender SDK (served in place of cast_sender.js?loadCastFramework=1 by
 * scripts/cast-sender-e2e-browser.mjs). Headless only; never shipped.
 *
 * Surface and behaviour follow Google's documented API:
 *  - https://developers.google.com/cast/docs/web_sender/integrate (__onGCastApiAvailable, CastContext.setOptions,
 *    AutoJoinPolicy, the cast button states)
 *  - https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastContext
 *    (getInstance, setOptions [throws without receiverApplicationId; no events before options], getCastState,
 *    getSessionState, getCurrentSession, requestSession(): Promise resolving null / rejecting with chrome.cast.ErrorCode
 *    [throws before setOptions], endCurrentSession(stopCasting), add/removeEventListener)
 *  - https://developers.google.com/cast/docs/reference/web_sender/cast.framework.CastSession
 *    (loadMedia(LoadRequest): Promise<?ErrorCode>, sendMessage(namespace, Object|string): Promise<?ErrorCode>,
 *    addMessageListener(namespace, function(namespace, message: string)), getSessionState, getCastDevice, endSession)
 *  - https://developers.google.com/cast/docs/reference/web_sender/cast.framework (CastState NO_DEVICES_AVAILABLE |
 *    NOT_CONNECTED | CONNECTING | CONNECTED; SessionState; CastContextEventType CAST_STATE_CHANGED "caststatechanged",
 *    SESSION_STATE_CHANGED "sessionstatechanged"; CastStateEventData {castState}; SessionStateEventData {session,
 *    sessionState, errorCode})
 *  - https://developers.google.com/cast/docs/reference/web_sender/chrome.cast (ErrorCode values, AutoJoinPolicy)
 *  - https://developers.google.com/cast/docs/reference/web_sender/chrome.cast.media.MediaInfo / LoadRequest /
 *    PhotoMediaMetadata / Image
 *
 * Test hooks (window.__castFake): setDevices(bool), receive(namespace, message), endFromReceiver() (the TV/other
 * sender stops the app), and knobs seeded from window.__castFakeInit:
 *   requestOutcome: "connect" | ErrorCode (rejects) | "resolve:<ErrorCode>" (the documented resolve-with-code path)
 *   loadOutcome:    "ok" | ErrorCode (rejects) | "resolve:<ErrorCode>"
 *   resume:         true = a session for the configured app already runs (auto-join, ORIGIN_SCOPED): after
 *                   setOptions the context reports SESSION_RESUMED + CONNECTED without requestSession
 *   helloOnStart:   a namespace; the receiver says hello on it right after SESSION_STARTED, BEFORE the cast state
 *                   becomes CONNECTED (an event order the documentation does not rule out)
 * Overlapping requestSession calls reject the later one with session_error, like a second picker cannot open.
 */
(() => {
  const init = window.__castFakeInit || {};
  const fake = (window.__castFake = {
    calls: [], loads: [], messages: [], options: null,
    requestOutcome: init.requestOutcome || "connect",
    loadOutcome: init.loadOutcome || "ok",
    setDevices: null, receive: null,
  });
  const CastState = { NO_DEVICES_AVAILABLE: "NO_DEVICES_AVAILABLE", NOT_CONNECTED: "NOT_CONNECTED", CONNECTING: "CONNECTING", CONNECTED: "CONNECTED" };
  const SessionState = { NO_SESSION: "NO_SESSION", SESSION_STARTING: "SESSION_STARTING", SESSION_STARTED: "SESSION_STARTED", SESSION_START_FAILED: "SESSION_START_FAILED", SESSION_ENDING: "SESSION_ENDING", SESSION_ENDED: "SESSION_ENDED", SESSION_RESUMED: "SESSION_RESUMED" };
  const CastContextEventType = { CAST_STATE_CHANGED: "caststatechanged", SESSION_STATE_CHANGED: "sessionstatechanged" };
  const ErrorCode = { CANCEL: "cancel", TIMEOUT: "timeout", API_NOT_INITIALIZED: "api_not_initialized", INVALID_PARAMETER: "invalid_parameter", EXTENSION_NOT_COMPATIBLE: "extension_not_compatible", EXTENSION_MISSING: "extension_missing", RECEIVER_UNAVAILABLE: "receiver_unavailable", SESSION_ERROR: "session_error", CHANNEL_ERROR: "channel_error", LOAD_MEDIA_FAILED: "load_media_failed" };
  const AutoJoinPolicy = { TAB_AND_ORIGIN_SCOPED: "tab_and_origin_scoped", ORIGIN_SCOPED: "origin_scoped", PAGE_SCOPED: "page_scoped" };
  const MetadataType = { GENERIC: 0, MOVIE: 1, TV_SHOW: 2, MUSIC_TRACK: 3, PHOTO: 4 };
  const StreamType = { BUFFERED: "BUFFERED", LIVE: "LIVE", OTHER: "OTHER" };
  class Image { constructor(url) { this.url = url; this.height = null; this.width = null; } }
  class GenericMediaMetadata { constructor() { this.metadataType = this.type = MetadataType.GENERIC; this.title = undefined; this.subtitle = undefined; this.images = undefined; } }
  class PhotoMediaMetadata { constructor() { this.metadataType = this.type = MetadataType.PHOTO; this.title = undefined; this.artist = undefined; this.location = undefined; this.images = undefined; this.width = undefined; this.height = undefined; } }
  class MediaInfo { constructor(contentId, contentType) { this.contentId = contentId; this.contentType = contentType; this.streamType = StreamType.BUFFERED; this.metadata = null; this.duration = null; } }
  class LoadRequest { constructor(mediaInfo) { this.type = "LOAD"; this.media = mediaInfo; this.autoplay = true; this.currentTime = null; } }

  const listeners = new Map();
  const emit = (type, data) => { for (const fn of [...(listeners.get(type) || [])]) fn({ type, ...data }); };
  let castState = CastState.NO_DEVICES_AVAILABLE, sessionState = SessionState.NO_SESSION, session = null, configured = false, pending = false;
  const devices = { on: init.devices !== false };
  const setCast = (next) => { if (next === castState) return; castState = next; if (configured) emit(CastContextEventType.CAST_STATE_CHANGED, { castState }); };
  const setSession = (next, extra = {}) => { sessionState = next; if (configured) emit(CastContextEventType.SESSION_STATE_CHANGED, { session, sessionState, errorCode: null, ...extra }); };

  class CastSession {
    constructor(appId) { this.appId = appId; this.messageListeners = new Map(); }
    getSessionId() { return "fake-session"; }
    getSessionState() { return sessionState; }
    getCastDevice() { return { friendlyName: "Living Room TV", deviceId: "fake-device" }; }
    getApplicationMetadata() { return { applicationId: this.appId, name: this.appId === "CC1AD845" ? "Default Media Receiver" : "Quackles" }; }
    loadMedia(request) {
      if (!(request instanceof LoadRequest)) throw new Error("loadMedia requires a chrome.cast.media.LoadRequest");
      fake.loads.push({ at: performance.timeOrigin + performance.now(), contentId: request.media.contentId, contentType: request.media.contentType, streamType: request.media.streamType, metadata: request.media.metadata && JSON.parse(JSON.stringify(request.media.metadata)), autoplay: request.autoplay });
      if (fake.loadOutcome === "ok") return Promise.resolve(null);
      if (fake.loadOutcome.startsWith("resolve:")) return Promise.resolve(fake.loadOutcome.slice(8));
      return Promise.reject(fake.loadOutcome);
    }
    sendMessage(namespace, data) {
      if (typeof namespace !== "string" || !namespace.startsWith("urn:x-cast:")) return Promise.reject(ErrorCode.INVALID_PARAMETER);
      fake.messages.push({ at: performance.timeOrigin + performance.now(), namespace, data: typeof data === "string" ? data : JSON.stringify(data) });
      return Promise.resolve(null);
    }
    addMessageListener(namespace, listener) { if (!this.messageListeners.has(namespace)) this.messageListeners.set(namespace, new Set()); this.messageListeners.get(namespace).add(listener); }
    removeMessageListener(namespace, listener) { this.messageListeners.get(namespace)?.delete(listener); }
    endSession(stopCasting) { CastContext.getInstance().endCurrentSession(stopCasting); }
  }
  let instance = null;
  class CastContext {
    static getInstance() { return instance || (instance = new CastContext()); }
    setOptions(options) {
      fake.calls.push(["setOptions", options && options.receiverApplicationId, options && options.autoJoinPolicy]);
      if (!options || !options.receiverApplicationId) throw new Error("receiverApplicationId is required");
      fake.options = { receiverApplicationId: options.receiverApplicationId, autoJoinPolicy: options.autoJoinPolicy };
      configured = true;
      // Discovery runs once configured: devices on the network show up shortly after.
      setTimeout(() => {
        if (init.resume && devices.on) {
          session = new CastSession(fake.options.receiverApplicationId);
          setSession(SessionState.SESSION_RESUMED); setCast(CastState.CONNECTED);
          return;
        }
        setCast(devices.on ? CastState.NOT_CONNECTED : CastState.NO_DEVICES_AVAILABLE);
      }, 40);
    }
    getCastState() { return castState; }
    getSessionState() { return sessionState; }
    getCurrentSession() { return session; }
    requestSession() {
      fake.calls.push(["requestSession"]);
      if (!configured) throw new Error("requestSession called before setOptions");
      if (castState === CastState.NO_DEVICES_AVAILABLE) return Promise.reject(ErrorCode.RECEIVER_UNAVAILABLE);
      if (pending) return Promise.reject(ErrorCode.SESSION_ERROR);
      if (fake.requestOutcome === ErrorCode.CANCEL) return new Promise((_, reject) => setTimeout(() => reject(ErrorCode.CANCEL), 30)); // user closed the picker
      if (fake.requestOutcome.startsWith("resolve:")) return new Promise((resolve) => setTimeout(() => resolve(fake.requestOutcome.slice(8)), 60));
      pending = true;
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          setSession(SessionState.SESSION_STARTING); setCast(CastState.CONNECTING);
          setTimeout(() => {
            pending = false;
            if (fake.requestOutcome === "connect") {
              session = new CastSession(fake.options.receiverApplicationId);
              setSession(SessionState.SESSION_STARTED);
              if (init.helloOnStart) fake.receive(init.helloOnStart, JSON.stringify({ v: 1, k: "h", b: "receiver" }));
              setCast(CastState.CONNECTED); resolve(null);
            } else {
              setSession(SessionState.SESSION_START_FAILED, { errorCode: fake.requestOutcome }); setCast(CastState.NOT_CONNECTED); reject(fake.requestOutcome);
            }
          }, 120);
        }, 60); // picker
      });
    }
    endCurrentSession(stopCasting) {
      fake.calls.push(["endCurrentSession", stopCasting]);
      if (!session) return;
      setSession(SessionState.SESSION_ENDING); session = null; setSession(SessionState.SESSION_ENDED); setCast(CastState.NOT_CONNECTED);
    }
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); }
    removeEventListener(type, handler) { listeners.get(type)?.delete(handler); }
  }
  fake.setDevices = (on) => { devices.on = on; if (!session) setCast(on ? CastState.NOT_CONNECTED : CastState.NO_DEVICES_AVAILABLE); };
  fake.endFromReceiver = () => { if (!session) return; session = null; setSession(SessionState.SESSION_ENDED); setCast(CastState.NOT_CONNECTED); };
  fake.receive = (namespace, message) => { for (const fn of session?.messageListeners.get(namespace) || []) fn(namespace, message); };

  window.chrome = window.chrome || {};
  window.chrome.cast = { AutoJoinPolicy, ErrorCode, isAvailable: true, media: { MediaInfo, LoadRequest, PhotoMediaMetadata, GenericMediaMetadata, Image, MetadataType, StreamType, DEFAULT_MEDIA_RECEIVER_APP_ID: "CC1AD845" } };
  window.cast = { framework: { CastContext, CastSession, CastState, SessionState, CastContextEventType, VERSION: "fake-1.0" } };
  setTimeout(() => { if (typeof window.__onGCastApiAvailable === "function") window.__onGCastApiAvailable(true); }, 0);
})();
