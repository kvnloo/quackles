"use client";
// Main-bundle gate for the native simulator. Without ?sim=1 it renders nothing
// and loads nothing. With the flag it waits until story progress reaches
// SIM_LIVE_PROGRESS, then imports the live layer at idle priority.
import { useEffect, useState, type ComponentType } from "react";
import { snapshot, subscribe } from "@/lib/sequence/store";
import { SIM_LIVE_PROGRESS, simFlagEnabled } from "@/lib/sim/flag";

export function SimFlagGate() {
  const [Layer, setLayer] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!simFlagEnabled(location.search)) return;
    let cancelled = false;
    let idle = 0;
    let unsubscribe: (() => void) | null = null;
    const start = () => {
      void import("./LiveSimLayer").then((module) => {
        if (!cancelled) setLayer(() => module.LiveSimLayer);
      });
    };
    const check = () => {
      if (idle || snapshot().progress < SIM_LIVE_PROGRESS) return;
      unsubscribe?.();
      unsubscribe = null;
      idle = typeof requestIdleCallback === "function" ? requestIdleCallback(start, { timeout: 1500 }) : window.setTimeout(start, 200);
    };
    unsubscribe = subscribe(check);
    check();
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (idle) { if (typeof cancelIdleCallback === "function") cancelIdleCallback(idle); else clearTimeout(idle); }
    };
  }, []);
  return Layer ? <Layer /> : null;
}
