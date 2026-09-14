"use client";

import dynamic from "next/dynamic";
import { ExperienceProvider, useExperience } from "@/components/providers/ExperienceProvider";
import { NavBar } from "@/components/overlay/NavBar";
import { StoryOverlay } from "@/components/overlay/StoryOverlay";

const DuckCanvas = dynamic(
  () => import("@/components/duck/DuckCanvas").then((m) => m.DuckCanvas),
  { ssr: false }
);

function Hatch() {
  const { ready } = useExperience();
  if (ready) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background"
      aria-hidden
    >
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
    <div className="pointer-events-none fixed bottom-0 left-0 right-0 z-30 overflow-hidden border-t border-border/60 bg-background/40 py-2 backdrop-blur-md">
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

function AppShell() {
  return (
    <>
      <Hatch />
      <NavBar />
      <div className="fixed inset-0 z-0">
        <DuckCanvas />
      </div>
      <div className="grain pointer-events-none fixed inset-0 z-10" />
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
