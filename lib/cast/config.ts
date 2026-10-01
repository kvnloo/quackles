/**
 * Cast configuration. This module only exists in cast-enabled builds' graphs (see next.config.ts).
 *
 * Two modes, both behind the same Cast button:
 *  - basic (no setup): Google's public Default Media Receiver (CC1AD845) shows the current scene as a still image,
 *    re-loaded when the theme or story frame changes. Zoom is not mirrored.
 *  - custom (one-time setup, docs/CAST.md): the Quackles receiver at /cast-receiver/ runs the engine on the TV and
 *    mirrors story, theme and zoom live.
 * CAST_APP_ID is the registered Custom Web Receiver id. GitHub Pages builds pass no env, so it is set HERE;
 * NEXT_PUBLIC_CAST_APP_ID overrides it for local builds and `?castAppId=XXXXXXXX` for a single page load.
 */
import { BUILD_SHA } from "../build-info";

export const CAST_APP_ID_PLACEHOLDER = "00000000";
/** Google's Default Media Receiver: public, no registration (chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID). */
export const DEFAULT_MEDIA_RECEIVER_APP_ID = "CC1AD845";
export const CAST_DOCS_URL = "https://github.com/kvnloo/quackles/blob/preview/chromecast/docs/CAST.md";
/** Custom mode: the Quackles receiver says hello on connect; silence this long means the wrong App ID/URL/device. */
export const RECEIVER_HELLO_TIMEOUT_MS = 8000;
export const CAST_APP_ID = process.env.NEXT_PUBLIC_CAST_APP_ID || CAST_APP_ID_PLACEHOLDER;
/** Which Pages channel this build is (derived from the base path: /quackles, /quackles/nightly, /quackles/preview/<id>). */
export const CAST_PREVIEW_ID = previewIdFromBasePath(process.env.NEXT_PUBLIC_BASE_PATH || "");
export function previewIdFromBasePath(basePath: string): string {
  const match = basePath.match(/\/(?:preview\/)?([^/]+)$/);
  return match && /\/(preview\/[^/]+|nightly)$/.test(basePath) ? match[1] : "production";
}
export const CAST_BUILD = BUILD_SHA;

export const RECEIVER_SDK = "https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js";
export const SENDER_SDK = "https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1";

/** "caf" = the real Google Cast SDK; "bc" = a same-origin BroadcastChannel shim with the same interface (headless tests). */
export type CastTransportKind = "caf" | "bc";
export function castTransportKind(search: string): CastTransportKind {
  return new URLSearchParams(search).get("castTransport") === "bc" ? "bc" : "caf";
}

const APP_ID = /^[A-F0-9]{8}$/;
const registered = (id: string | null | undefined) => !!id && APP_ID.test(id) && id !== CAST_APP_ID_PLACEHOLDER && id !== DEFAULT_MEDIA_RECEIVER_APP_ID;
export type CastMode = { kind: "basic"; appId: typeof DEFAULT_MEDIA_RECEIVER_APP_ID } | { kind: "custom"; appId: string };

/** A registered id (URL override first, then config) selects the live custom receiver; anything else is basic mode. */
export function castMode(search: string, configured: string = CAST_APP_ID): CastMode {
  const override = new URLSearchParams(search).get("castAppId")?.toUpperCase();
  if (registered(override)) return { kind: "custom", appId: override! };
  const own = configured?.toUpperCase();
  if (registered(own)) return { kind: "custom", appId: own };
  return { kind: "basic", appId: DEFAULT_MEDIA_RECEIVER_APP_ID };
}

const MESSAGES: Record<string, string> = {
  timeout: "The TV didn't respond in time. Try again.",
  receiver_unavailable: "No Cast device found. Is the TV on the same Wi-Fi?",
  session_error: "Couldn't start casting on the TV. Try again.",
  channel_error: "Lost the connection to the TV.",
  load_media_failed: "The TV couldn't load the picture.",
  api_not_initialized: "Casting isn't ready yet. Reload the page and try again.",
  extension_missing: "Casting isn't available in this browser.",
  extension_not_compatible: "Casting isn't available in this browser.",
  invalid_parameter: "The TV rejected the cast request.",
  sdk_unavailable: "Google Cast couldn't load in this browser.",
  receiver_silent: "The Quackles TV app didn't answer. Check the App ID and receiver URL (docs/CAST.md).",
};
/** chrome.cast.ErrorCode (string or {code}) -> a short visible message; the user cancelling the picker stays silent. */
export function castErrorMessage(error: unknown): string | null {
  const code = typeof error === "string" ? error : typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : "";
  if (code === "cancel") return null;
  return MESSAGES[code] ?? "Casting failed. Try again.";
}

/**
 * The Web Sender SDK only works in Chrome (desktop + Android). iOS browsers (CriOS included) and other Chromium
 * brands have no Cast; loading the SDK there would be wasted bytes.
 */
export function castCapableBrowser(userAgent: string, hasChromeObject: boolean): boolean {
  if (!hasChromeObject) return false;
  if (/iPhone|iPad|iPod|CriOS|EdgiOS|FxiOS/.test(userAgent)) return false;
  if (/Edg\/|EdgA\/|OPR\/|SamsungBrowser|YaBrowser|HeadlessChrome/.test(userAgent)) return false;
  return /\bChrome\/\d+/.test(userAgent);
}

/** True on the receiver route (the TV). Used by the cast-build engine seams (lib/cast/engine/*). */
export function isReceiverPath(pathname: string): boolean {
  return /\/cast-receiver\/?$/.test(pathname);
}
