"use client";
import { PosterNav } from "@/components/poster/PosterNav";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { ThemeControl } from "@/components/poster/ThemeControl";
import { SequenceFrame } from "@/components/sequence/SequenceFrame";
import { SequencePlayer } from "@/components/sequence/SequencePlayer";
import { SequenceScroll } from "@/components/sequence/SequenceScroll";
import { FeelEngine } from "@/components/feel/FeelEngine";

export function Landing() {
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
          <p className="credit">
            FAN STUDY · MICRODUCK IN FRAME{" "}
            <span>NOT NOUS / NOT POLLEN · 2026</span>
          </p>
        </div>
      </div>
      <div className="scroll-space" aria-hidden />
    </main>
  );
}
