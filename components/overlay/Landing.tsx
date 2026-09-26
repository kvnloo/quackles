"use client";

import { FeelEngine } from "@/components/feel/FeelEngine";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterNav } from "@/components/poster/PosterNav";
import { TextSelect } from "@/components/poster/TextSelect";
import { ThemeControl } from "@/components/poster/ThemeControl";
import { HeroInspection } from "@/components/sequence/HeroInspection";
import { InspectionViewfinder } from "@/components/sequence/InspectionViewfinder";
import { SequenceFrame } from "@/components/sequence/SequenceFrame";
import { SequencePlayer } from "@/components/sequence/SequencePlayer";
import { SequenceScroll } from "@/components/sequence/SequenceScroll";

export function Landing() {
  return (
    <main id="top" className="experience-shell" data-testid="experience">
      <TextSelect />
      <SequenceScroll />
      <HeroInspection />
      <FeelEngine />

      <div className="poster-stage">
        <SequenceFrame>
          <SequencePlayer />
          <InspectionViewfinder />
          <PosterNav />
          <PosterHeroCopy />
          <PosterBeats />

          <div className="scene-hud" aria-label="Scene controls and interaction hints">
            <ThemeControl />
            <div className="interaction-hints" aria-hidden>
              <span className="interaction-hint interaction-hint-theme">
                DRAG ← → TO CHANGE SCENE COLOR
              </span>
              <span className="interaction-hint interaction-hint-inspect">
                SCROLL ↑ OR CLICK TO INSPECT
              </span>
              <span className="interaction-hint interaction-hint-specs">
                SCROLL ↓ TO SEE SPECS
              </span>
            </div>
            <div className="scroll-progress" aria-hidden>
              <div className="scroll-progress-fill" />
            </div>
          </div>
        </SequenceFrame>
      </div>

      <div className="scroll-space" aria-hidden />
    </main>
  );
}
