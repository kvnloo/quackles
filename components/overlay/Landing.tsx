"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider } from "@/components/providers/ExperienceProvider";
import { PosterNav } from "@/components/poster/PosterNav";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { PosterBeats } from "@/components/poster/PosterBeats";
import { PosterMarks, PosterPlates } from "@/components/poster/PosterChrome";
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
        <PosterPlates />
        <div className="duck-slot">
          <CanvasGuard fallback={<DuckFallback />}>
            <DuckStage />
          </CanvasGuard>
        </div>
        <PosterNav />
        <PosterHeroCopy />
        <PosterMarks />
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
