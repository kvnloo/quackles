"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider, useExperience } from "@/components/providers/ExperienceProvider";
import { PosterNav } from "@/components/poster/PosterNav";
import { PosterBack, PosterFront } from "@/components/poster/PosterChrome";
import { PosterHeroCopy } from "@/components/poster/PosterHeroCopy";
import { StoryOverlay } from "@/components/overlay/StoryOverlay";
import { CanvasGuard } from "@/components/duck/CanvasGuard";
import { DuckFallback } from "@/components/duck/DuckFallback";
import { SimulatorFrame } from "@/components/sim/SimulatorFrame";
import { playMorph } from "@/lib/sim/morph";
import { assetPath } from "@/lib/paths";

const DuckStage = dynamic(
  () => import("@/components/duck/DuckStage").then((module) => module.DuckStage),
  { ssr: false }
);

function Hatch() {
  return (
    <div className="hatch-overlay" aria-hidden>
      <div className="text-center">
        <div className="mx-auto mb-4 size-10 rounded-full border-2 border-[color:var(--cobalt)] border-t-transparent animate-spin" />
        <p className="font-label text-[10px] uppercase tracking-[0.28em] text-[color:var(--cobalt)]">
          hatching the duck
        </p>
      </div>
    </div>
  );
}

function PaperGrain() {
  const { progress } = useExperience();
  const morph = playMorph(progress);
  return (
    <div
      className="paper-grain pointer-events-none absolute inset-0 z-10"
      style={{ opacity: 1 - morph }}
    />
  );
}

function DuckSlot() {
  const { progress } = useExperience();
  const t = Math.min(1, progress / 0.14);
  return (
    <div
      className="absolute z-[12] overflow-hidden"
      style={{
        top: `${16 * (1 - t)}%`,
        left: `${16 * (1 - t)}%`,
        right: `${2 * (1 - t)}%`,
        bottom: `${28.2 * (1 - t)}%`,
        transform: "none",
      }}
    >
      <CanvasGuard fallback={<DuckFallback />}>
        <DuckStage />
      </CanvasGuard>
    </div>
  );
}

function AppShell() {
  return (
    <div
      className="phone-shell"
      style={{ ["--stone-url" as string]: `url("${assetPath("/poster/stone.jpg")}")` }}
    >
      <div className="poster-stage">
        <Hatch />
        <PosterNav />
        <PosterBack />
        <DuckSlot />
        <PosterFront />
        <PosterHeroCopy />
        <SimulatorFrame />
        <PaperGrain />
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
