"use client";

import { useEffect, useState } from "react";
import { DuckStage } from "@/components/duck/DuckStage";
import { DesktopExperienceController } from "@/components/experience/DesktopExperienceController";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterPlates } from "@/components/poster/PosterChrome";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterNav } from "@/components/poster/PosterNav";
import { ThemeControl } from "@/components/poster/ThemeControl";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { SequenceFrame } from "@/components/sequence/SequenceFrame";
import { SequencePlayer } from "@/components/sequence/SequencePlayer";
import { SequenceScroll } from "@/components/sequence/SequenceScroll";
import { FeelEngine } from "@/components/feel/FeelEngine";

function MobileSequenceLanding() {
  return (
    <main id="top" className="phone-shell" data-testid="experience">
      <SequenceScroll />
      <FeelEngine />
      <div className="poster-stage">
        <SequenceFrame>
          <SequencePlayer />
          <PosterNav />
          <PosterHeroCopy />
          <PosterBeats />
        </SequenceFrame>
        <div className="scene-dock">
          <ThemeControl />
          <div className="scroll-line">
            <span>SCROLL TO EXPLORE</span>
            <span aria-hidden>↓</span>
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

function DesktopLiveLanding() {
  return (
    <ExperienceProvider>
      <main
        id="top"
        className="desktop-shell"
        data-phase="inspect"
        data-testid="desktop-experience"
      >
        <DesktopExperienceController />
        <div className="poster-stage">
          <div className="poster-frame" data-testid="scene">
            <PosterPlates />
            <div className="duck-slot">
              <DuckStage />
            </div>
            <PosterNav />
            <PosterHeroCopy />
            <PosterBeats />
          </div>
          <div className="scene-dock">
            <ThemeControl />
            <div className="scroll-line">
              <span className="desktop-scroll-copy">
                SCROLL UP TO INSPECT · DOWN TO PULL BACK
              </span>
              <span className="desktop-phase-copy" aria-live="polite">
                INSPECT
              </span>
            </div>
            <div className="scroll-progress">
              <div className="scroll-progress-fill" />
            </div>
          </div>
        </div>
      </main>
    </ExperienceProvider>
  );
}

export function Landing() {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const media = matchMedia("(min-width: 900px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return desktop ? <DesktopLiveLanding /> : <MobileSequenceLanding />;
}
