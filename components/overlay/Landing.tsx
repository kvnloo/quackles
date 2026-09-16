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
  return <main id="top" className="phone-shell" data-testid="experience">
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
        <div className="scroll-line"><span>SCROLL TO EXPLORE</span><span aria-hidden>↓</span></div>
        <div className="scroll-progress"><div className="scroll-progress-fill" /></div>
      </div>
    </div>
    <div className="scroll-space" aria-hidden />
    <footer className="credit">MICRODUCK BY POLLEN ROBOTICS <span>FAN STUDY</span></footer>
  </main>;
}
