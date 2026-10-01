"use client";
// Phone-side Cast button (cast builds only). Nothing loads until the page has painted and the browser is idle, and
// only in a Cast-capable Chrome. The button shows whenever the Cast SDK reports devices, with or without a registered
// App ID (no App ID = basic mode on Google's Default Media Receiver). It is portalled into the poster frame and
// absolutely positioned, so it never shifts layout; notices (basic-mode note, errors) sit under it.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { castCapableBrowser, castMode, castTransportKind, type CastMode } from "@/lib/cast/config";
import type { CastNotice, SenderControl } from "@/lib/cast/sender";
import type { SessionState } from "@/lib/cast/transport";
import styles from "./cast.module.css";

const LABEL: Record<SessionState, string> = {
  unavailable: "Cast",
  idle: "Cast to a TV",
  connecting: "Connecting to the TV",
  connected: "Casting to the TV. Stop casting",
};
const NOTICE_MS = { info: 12000, error: 9000 };

export function CastSender() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<SessionState>("unavailable");
  const [notice, setNotice] = useState<CastNotice | null>(null);
  const control = useRef<SenderControl | null>(null);
  useEffect(() => {
    const kind = castTransportKind(location.search);
    if (kind === "caf" && !castCapableBrowser(navigator.userAgent, "chrome" in window)) return;
    // The test shim always speaks the live protocol; the real SDK picks basic or custom from the App ID.
    const mode: CastMode = kind === "bc" ? { kind: "custom", appId: "shim" } : castMode(location.search);
    let cancelled = false, idle = 0, fallback = 0;
    const boot = () => {
      void import("@/lib/cast/sender").then(async ({ startCastSender }) => {
        if (cancelled) return;
        const started = await startCastSender({
          kind, mode,
          onState: (next) => { if (!cancelled) setState(next); },
          onNotice: (next) => { if (!cancelled) setNotice(next); },
        });
        if (cancelled) { started?.dispose(); return; }
        control.current = started;
        if (started) setHost(document.querySelector<HTMLElement>(".poster-frame"));
      }).catch((error: unknown) => console.warn("cast unavailable", error));
    };
    const whenIdle = () => {
      removeEventListener("quackles:base-painted", whenIdle);
      window.clearTimeout(fallback);
      if (idle || cancelled) return;
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(boot, { timeout: 2000 }) : window.setTimeout(boot, 300);
    };
    addEventListener("quackles:base-painted", whenIdle);
    fallback = window.setTimeout(whenIdle, 4000);
    return () => {
      cancelled = true;
      removeEventListener("quackles:base-painted", whenIdle);
      window.clearTimeout(fallback);
      if (idle) { if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle); else window.clearTimeout(idle); }
      control.current?.dispose();
      control.current = null;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS[notice.kind]);
    return () => window.clearTimeout(timer);
  }, [notice]);
  if (!host) return null;
  const connected = state === "connected";
  return createPortal(
    <>
      {state !== "unavailable" && (
        <button
          type="button"
          className={styles.button}
          data-testid="cast-button"
          data-state={state}
          aria-label={LABEL[state]}
          aria-pressed={connected}
          title={LABEL[state]}
          onClick={() => (connected ? control.current?.stop() : control.current?.start())}
        >
          <svg viewBox="0 0 24 24" aria-hidden focusable="false">
            <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z" />
            {connected && <path d="M19 7H5v1.63c3.96 1.28 7.09 4.41 8.37 8.37H19V7z" />}
          </svg>
        </button>
      )}
      {notice && (
        <p className={styles.notice} data-testid="cast-notice" data-kind={notice.kind} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
          {notice.href && <> <a href={notice.href} target="_blank" rel="noopener noreferrer">Setup</a></>}
          <button type="button" className={styles.dismiss} aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </p>
      )}
    </>,
    host,
  );
}
