"use client";
// The TV. Same engine (SequencePlayer + poster chrome) in "receiver mode": no input handlers, no scroll, a
// full-screen 16:9 stage, and state that arrives from the phone over the Cast custom-message channel.
import { useEffect, useRef, useState } from "react";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterNav } from "@/components/poster/PosterNav";
import { SequencePlayer } from "@/components/sequence/SequencePlayer";
import { castTransportKind } from "@/lib/cast/config";
import type { ReceiverStatus } from "@/lib/cast/receiver";
import { THEME_IDS } from "@/lib/sequence/manifest";
import { snapshot, subscribe } from "@/lib/sequence/store";
import styles from "./cast.module.css";

export function CastReceiver() {
  const frame = useRef<HTMLDivElement>(null), theme = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<ReceiverStatus | null>(null);
  useEffect(() => {
    const node = frame.current, camera = node?.querySelector<HTMLElement>(".sequence-camera");
    if (!node || !camera) return;
    const root = document.documentElement;
    root.style.overflow = "hidden";
    root.dataset.castReceiver = "true";
    let stop: (() => void) | null = null, cancelled = false;
    void import("@/lib/cast/receiver").then(({ startCastReceiver }) =>
      startCastReceiver({ kind: castTransportKind(location.search), frame: node, camera, onStatus: (next) => { if (!cancelled) setStatus(next); } }),
    ).then((dispose) => { if (cancelled) dispose(); else stop = dispose; }).catch((error: unknown) => console.error("cast receiver failed to start", error));
    let shown = "";
    const unsubscribe = subscribe(() => {
      const id = THEME_IDS[Math.round(snapshot().presented)] ?? "";
      if (id !== shown && theme.current) { shown = id; theme.current.textContent = id; }
    });
    return () => { cancelled = true; stop?.(); unsubscribe(); root.style.overflow = ""; delete root.dataset.castReceiver; };
  }, []);
  return (
    <main className={`experience-shell ${styles.receiver}`} data-testid="cast-receiver">
      <div className="poster-stage">
        <div className={`${styles.bar} ${styles.left}`} aria-hidden>
          <span className={styles.wordmark}>Quackles</span>
          <span>Microduck</span>
        </div>
        <div ref={frame} className="poster-frame" data-testid="scene">
          <SequencePlayer />
          <PosterNav />
          <PosterHeroCopy />
          <PosterBeats />
        </div>
        <div className={`${styles.bar} ${styles.right}`} aria-live="polite">
          <span ref={theme} />
          <span data-testid="cast-status">{status?.connected ? "Live from your phone" : "Waiting for your phone"}</span>
          {status?.buildMatch === false && <span>Phone is on another version</span>}
        </div>
      </div>
    </main>
  );
}
