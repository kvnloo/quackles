/**
 * Cast configuration. This module only exists in cast-enabled builds' graphs (see next.config.ts).
 *
 * CAST_APP_ID: the Custom Web Receiver application id from the Google Cast SDK Developer Console.
 * GitHub Pages builds pass no env, so the id is set HERE (docs/CAST.md, step 4); NEXT_PUBLIC_CAST_APP_ID overrides
 * it for local builds. Until a real id is set the Cast button stays hidden; `?castAppId=XXXXXXXX` lets the owner try
 * a freshly registered id on the live preview without a commit.
 */
import { BUILD_SHA } from "../build-info";

export const CAST_APP_ID_PLACEHOLDER = "00000000";
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
export function castAppId(search: string): string | null {
  const override = new URLSearchParams(search).get("castAppId")?.toUpperCase();
  if (override && APP_ID.test(override)) return override;
  return APP_ID.test(CAST_APP_ID) && CAST_APP_ID !== CAST_APP_ID_PLACEHOLDER ? CAST_APP_ID : null;
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
