"use client";
// Lazily loaded (?sim=1 only, after story progress 0.78). Mounts the one live
// rig (same OfficialDuck/DuckScene) under the last authored plate, plus the
// simulator HUD. All behaviour lives in LiveSimController.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { DuckStage } from "@/components/duck/DuckStage";
import { ExperienceProvider, useExperience } from "@/components/providers/ExperienceProvider";
import { LiveSimController } from "@/lib/sim/live-controller";
import { SimDirector } from "./SimDirector";
import styles from "./LiveSimLayer.module.css";
import "./live-sim.css";

declare global {
  interface Window {
    __QUACKLES_SIM__?: {
      getState: () => ReturnType<LiveSimController["getState"]>;
      enter: () => void;
      exit: () => void;
      debug: { live: (opacity: number | null, storyProgress?: number) => void; robotOnly: (enabled: boolean) => void; renderer: () => ReturnType<LiveSimController["debugRenderer"]>; grade: LiveSimController["setDebugGrade"] };
    };
  }
}

const PAD = [
  ["up", "▲", "Walk forward", styles.up],
  ["left", "◀", "Turn left", styles.left],
  ["down", "▼", "Walk back", styles.down],
  ["right", "▶", "Turn right", styles.right],
] as const;

function LiveSim() {
  const { poseRef, ready, webgl } = useExperience();
  const [controller] = useState(() => new LiveSimController(typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches));
  const canvas = useRef<HTMLDivElement>(null);
  const hud = useRef<HTMLDivElement>(null);
  const view = useSyncExternalStore(controller.subscribe, controller.getHud, controller.getHud);

  useEffect(() => {
    const frame = canvas.current?.closest<HTMLElement>(".poster-frame");
    if (!frame || !canvas.current || !hud.current) return;
    controller.attach({ frame, canvas: canvas.current, hud: hud.current, poseRef });
    window.__QUACKLES_SIM__ = {
      getState: () => controller.getState(),
      enter: () => controller.enter(),
      exit: () => controller.exit(),
      debug: { live: (opacity, storyProgress) => controller.setDebugLive(opacity, storyProgress), robotOnly: (enabled) => controller.setRobotOnly(enabled), renderer: () => controller.debugRenderer(), grade: (overrides) => controller.setDebugGrade(overrides) },
    };
    return () => {
      delete window.__QUACKLES_SIM__;
      controller.detach();
    };
  }, [controller, poseRef]);

  useEffect(() => { controller.setLiveReady(Boolean(ready && webgl)); }, [controller, ready, webgl]);

  const inSim = view.phase === "sim";
  return (
    <>
      <div ref={canvas} className={`${styles.canvas} sim-live-layer`} data-testid="sim-live-layer" aria-hidden={view.phase === "story"}>
        <DuckStage>
          <SimDirector controller={controller} />
        </DuckStage>
      </div>
      <div ref={hud} className={styles.hud}>
        {view.canEnter && (
          <button type="button" className={`${styles.button} ${styles.enter}`} data-sim-action="enter" data-testid="sim-enter">
            {view.reduced ? "Open the simulator" : "Scroll on — or drive it"}
          </button>
        )}
        {view.phase !== "story" && (
          <button type="button" className={`${styles.button} ${styles.back}`} data-sim-action="back" data-testid="sim-back">
            ← Back to story
          </button>
        )}
        {view.loading && <div className={styles.status} role="status">{view.error ? "Simulator unavailable" : "Loading physics…"}</div>}
        {inSim && (
          <>
            <div className={styles.hint}>Arrows / WASD walk · drag orbit · scroll zoom · Esc exits</div>
            <div className={styles.pad} role="group" aria-label="Walk controls">
              {PAD.map(([dir, glyph, label, cls]) => (
                <button key={dir} type="button" className={`${styles.button} ${cls}`} data-sim-action="pad" data-sim-pad={dir} data-testid={`sim-dpad-${dir}`} aria-label={label}>
                  {glyph}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function LiveSimLayer() {
  return (
    <ExperienceProvider>
      <LiveSim />
    </ExperienceProvider>
  );
}
