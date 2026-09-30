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
import { SimFlagGate } from "@/components/sim/SimFlagGate";
import { PREVIEW } from "@/lib/preview";

/** lib/preview.ts: `story: false` drops the scroll story (driver, copy, beats, scroll space); `scenes` gates theme hints. */
const STORY = PREVIEW.story;
const THEMES = PREVIEW.scenes !== "mushroom" && PREVIEW.scenes.length > 1;

export function Landing() {
  return (
    <main id="top" className="experience-shell" data-testid="experience" data-preview={PREVIEW.id}>
      <TextSelect />
      {STORY && <SequenceScroll />}
      <HeroInspection />
      <FeelEngine />

      <div className="poster-stage">
        <SequenceFrame>
          <SequencePlayer />
          <SimFlagGate />
          <InspectionViewfinder />
          <PosterNav />
          {STORY && <PosterHeroCopy />}
          {STORY && <PosterBeats />}

          <div className="scene-hud" aria-label="Scene controls and interaction hints">
            <ThemeControl />
            <div className="interaction-hints" aria-hidden>
              {THEMES && <span className="interaction-hint interaction-hint-theme">
                DRAG ← → TO CHANGE SCENE COLOR
              </span>}
              {PREVIEW.zoom !== "none" && <span className="interaction-hint interaction-hint-inspect">
                SCROLL ↑ OR CLICK TO INSPECT
              </span>}
              {STORY && <span className="interaction-hint interaction-hint-specs">
                SCROLL ↓ TO SEE SPECS
              </span>}
            </div>
            {STORY && <div className="scroll-progress" aria-hidden>
              <div className="scroll-progress-fill" />
            </div>}
          </div>
        </SequenceFrame>
      </div>

      {STORY && <div className="scroll-space" aria-hidden />}
    </main>
  );
}
