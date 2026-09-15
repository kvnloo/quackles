"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider, useExperience } from "@/components/providers/ExperienceProvider";
import { NavBar } from "@/components/overlay/NavBar";
import { StoryOverlay } from "@/components/overlay/StoryOverlay";
import { CanvasGuard } from "@/components/duck/CanvasGuard";
import { DuckFallback } from "@/components/duck/DuckFallback";
import { SimulatorFrame } from "@/components/sim/SimulatorFrame";
import { playMorph } from "@/lib/sim/morph";

const DuckStage = dynamic(
  () => import("@/components/duck/DuckStage").then((module) => module.DuckStage),
  { ssr: false }
);

function Hatch() {
  return (
    <div className="hatch-overlay" aria-hidden>
      <div className="text-center">
        <div className="mx-auto mb-5 size-16 rounded-full border-2 border-[color:var(--accent-trim)] border-t-transparent animate-spin" />
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-muted-foreground">
          hatching the duck
        </p>
      </div>
    </div>
  );
}

function Marquee() {
  const { progress } = useExperience();
  const morph = playMorph(progress);
  const bits = [
    "15 motors",
    "25 cm",
    "under 800 g",
    "50 Hz policy loop",
    "open-source software",
    "$399 intro",
    "Cream · Graphite · Lavender · Sky",
    "sim2real",
  ];
  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 overflow-hidden border-t border-border/60 bg-background/40 py-2 backdrop-blur-md transition-opacity duration-500"
      style={{ opacity: 1 - morph }}
    >
      <div className="flex w-max animate-[marquee_32s_linear_infinite] gap-10 px-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {[...bits, ...bits].map((b, i) => (
          <span key={`${b}-${i}`} className="flex items-center gap-10">
            {b}
            <span className="text-[color:var(--accent-trim)]">★</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Grain() {
  const { progress } = useExperience();
  const morph = playMorph(progress);
  return (
    <div
      className="grain pointer-events-none fixed inset-0 z-10"
      style={{ opacity: 1 - morph }}
    />
  );
}

function AppShell() {
  return (
    <>
      <Hatch />
      <NavBar />
      <div className="fixed inset-0 z-0">
        <CanvasGuard fallback={<DuckFallback />}>
          <DuckStage />
        </CanvasGuard>
      </div>
      <SimulatorFrame />
      <Grain />
      <main id="top" className="relative z-20">
        <StoryOverlay />
      </main>
      <Marquee />
    </>
  );
}

export function Landing() {
  return (
    <ExperienceProvider>
      <AppShell />
    </ExperienceProvider>
  );
}
