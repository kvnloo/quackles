"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider, useExperience } from "@/components/providers/ExperienceProvider";
import { PosterNav } from "@/components/poster/PosterNav";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { CanvasGuard } from "@/components/duck/CanvasGuard";
import { DuckFallback } from "@/components/duck/DuckFallback";

const DuckStage = dynamic(
  () => import("@/components/duck/DuckStage").then((module) => module.DuckStage),
  { ssr: false },
);

function Hatch() {
  const { ready } = useExperience();
  if (ready) return null;
  return (
    <div className="hatch-overlay" aria-hidden>
      <p>hatching</p>
    </div>
  );
}

function AppShell() {
  return (
    <div className="phone-shell">
      <div className="poster-stage">
        <div className="stage-bg" aria-hidden />
        <Hatch />
        <div className="duck-slot">
          <CanvasGuard fallback={<DuckFallback />}>
            <DuckStage />
          </CanvasGuard>
        </div>
        <PosterNav />
        <PosterHeroCopy />
      </div>
      <main id="top" className="poster-story">
        <PosterBeats />
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
