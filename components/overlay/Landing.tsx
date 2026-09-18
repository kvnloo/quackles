"use client";
import dynamic from "next/dynamic";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { PosterNav } from "@/components/poster/PosterNav";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterPlates } from "@/components/poster/PosterChrome";
import { ThemeControl } from "@/components/poster/ThemeControl";
import { CanvasGuard } from "@/components/duck/CanvasGuard";
const DuckStage = dynamic(
  () => import("@/components/duck/DuckStage").then((m) => m.DuckStage),
  { ssr: false },
);
export function Landing() {
  return (
    <ExperienceProvider>
      <main id="top" className="phone-shell" data-testid="experience">
        <div className="poster-stage">
          <div className="poster-frame" data-testid="scene">
            <PosterPlates />
            <div className="duck-slot">
              <CanvasGuard fallback={null}>
                <DuckStage />
              </CanvasGuard>
            </div>
            <PosterNav />
            <PosterHeroCopy />
            <PosterBeats />
          </div>
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
    </ExperienceProvider>
  );
}
