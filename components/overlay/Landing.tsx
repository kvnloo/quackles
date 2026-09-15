"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { PosterNav } from "@/components/poster/PosterNav";
import { HeroCopy } from "@/components/overlay/HeroCopy";
import { StoryOverlay } from "@/components/overlay/StoryOverlay";
import { CanvasGuard } from "@/components/duck/CanvasGuard";
import { DuckFallback } from "@/components/duck/DuckFallback";

const DuckStage = dynamic(
  () => import("@/components/duck/DuckStage").then((module) => module.DuckStage),
  { ssr: false }
);

function AppShell() {
  return (
    <div className="phone-shell">
      <div className="poster-stage">
        <div className="stage-floor" aria-hidden />
        <div className="duck-slot">
          <CanvasGuard fallback={<DuckFallback />}>
            <DuckStage />
          </CanvasGuard>
        </div>
        <PosterNav />
        <HeroCopy />
      </div>
      <main id="top" className="poster-story">
        <StoryOverlay />
      </main>
    </div>
  );
}

export function Landing() {
  return (
    <ExperienceProvider>
      <AppShell />
    </ExperienceProvider>
  );
}
