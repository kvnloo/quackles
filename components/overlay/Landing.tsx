"use client";

import { useEffect, useState } from "react";
import { DuckStage } from "@/components/duck/DuckStage";
import { CinematicHandoffController } from "@/components/experience/CinematicHandoffController";
import { FeelEngine } from "@/components/feel/FeelEngine";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterNav } from "@/components/poster/PosterNav";
import { ThemeControl } from "@/components/poster/ThemeControl";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { HeroInspection } from "@/components/sequence/HeroInspection";
import { InspectionViewfinder } from "@/components/sequence/InspectionViewfinder";
import { SequenceFrame } from "@/components/sequence/SequenceFrame";
import { SequencePlayer } from "@/components/sequence/SequencePlayer";
import { SequenceScroll } from "@/components/sequence/SequenceScroll";

function DesktopLiveLayer() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const media = matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setEnabled(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  if (!enabled) return null;

  return (
    <>
      <CinematicHandoffController />
      <div
        className="duck-slot cinematic-live-rig"
        data-testid="cinematic-live-rig"
        aria-hidden
      >
        <DuckStage />
      </div>
    </>
  );
}

function Experience() {
  return (
    <main id="top" className="phone-shell" data-testid="experience">
      <SequenceScroll />
      <HeroInspection />
      <FeelEngine />
      <div className="poster-stage">
        <SequenceFrame>
          <SequencePlayer />
          <DesktopLiveLayer />
          <InspectionViewfinder />
          <PosterNav />
          <PosterHeroCopy />
          <PosterBeats />
        </SequenceFrame>
        <div className="scene-dock">
          <ThemeControl />
          <div className="scroll-line">
            <span className="cinematic-scroll-copy">↑ INSPECT · ↓ EXPLORE</span>
            <span className="cinematic-phase-copy" aria-live="polite">↕</span>
          </div>
          <div className="scroll-progress">
            <div className="scroll-progress-fill" />
          </div>
        </div>
      </div>
      <div className="scroll-space" aria-hidden />
      <footer className="credit">
        MICRODUCK BY POLLEN ROBOTICS <span>FAN STUDY</span>
      </footer>
    </main>
  );
}

export function Landing() {
  return (
    <ExperienceProvider>
      <Experience />
    </ExperienceProvider>
  );
}
