"use client";

import type { ReactNode } from "react";
import { POSTER } from "@/lib/poster";
import { assetPath } from "@/lib/paths";
import { useExperience } from "@/components/providers/ExperienceProvider";

function CropMarks({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <span className="absolute -left-px -top-px h-5 w-5 border-l-[1.5px] border-t-[1.5px] border-[color:var(--cobalt)]" />
      <span className="absolute -right-px -top-px h-5 w-5 border-r-[1.5px] border-t-[1.5px] border-[color:var(--cobalt)]" />
      <span className="absolute -bottom-px -left-px h-5 w-5 border-b-[1.5px] border-l-[1.5px] border-[color:var(--cobalt)]" />
      <span className="absolute -bottom-px -right-px h-5 w-5 border-b-[1.5px] border-r-[1.5px] border-[color:var(--cobalt)]" />
    </div>
  );
}

function Globe() {
  return (
    <svg viewBox="0 0 64 64" className="size-[34px] text-[color:var(--cobalt)]" aria-hidden>
      <circle cx="32" cy="32" r="19" fill="none" stroke="currentColor" strokeWidth="2.3" />
      <ellipse cx="32" cy="32" rx="8" ry="19" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M13 32h38M17 22h30M17 42h30" fill="none" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function Leaf() {
  return (
    <svg viewBox="0 0 72 96" className="h-[4.6rem] w-14 text-[#1f6a3a]" aria-hidden>
      <path
        d="M38 92C8 64 4 28 26 4c22 12 36 34 32 62-10 10-16 16-20 26z"
        fill="currentColor"
        opacity="0.88"
      />
      <path d="M28 16c8 18 14 36 14 62" fill="none" stroke="#0d3b1e" strokeWidth="1.4" />
    </svg>
  );
}

function Fade({
  children,
  className,
  z,
}: {
  children: ReactNode;
  className: string;
  z: number;
}) {
  const { progress } = useExperience();
  const fade = Math.max(0, 1 - Math.max(0, progress - 0.02) * 6);
  return (
    <div className={className} style={{ opacity: fade, zIndex: z }} aria-hidden>
      {children}
    </div>
  );
}

export function PosterBack() {
  return (
    <Fade className="pointer-events-none absolute inset-0 overflow-hidden" z={8}>
      <div className="poster-arch" />
      <div className="poster-blue-frame" />
      <div className="poster-leaf">
        <Leaf />
      </div>
      <div className="poster-bust">
        <CropMarks className="absolute inset-0" />
        <div className="poster-bust-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetPath("/poster/bust.jpg")} alt="" />
          <div className="poster-halftone" />
        </div>
      </div>
      <p className="poster-right-stamp">
        {POSTER.rightStamp.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </Fade>
  );
}

export function PosterFront() {
  return (
    <Fade className="pointer-events-none absolute inset-0 overflow-visible" z={16}>
      <div className="poster-globe">
        <Globe />
        <p>
          {POSTER.globeCaption.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      </div>
      <div className="poster-orb-wrap">
        <div className="poster-orb-cube">
          <span className="poster-orb-cube-top" />
          <span className="poster-orb-cube-face" />
        </div>
        <div className="poster-orb">
          <span className="poster-orb-shine" />
          <span className="poster-orb-caustic" />
        </div>
      </div>
      <div className="poster-plinth poster-plinth-main">
        <span className="plinth-lid" />
        <span className="plinth-flank" />
        <p className="font-display text-[1.85rem] leading-[0.8] tracking-tight text-[color:var(--ink)]">
          {POSTER.plinth[0]}
          <br />
          {POSTER.plinth[1]}
        </p>
        <span className="mt-2 block h-8 w-[2px] bg-[color:var(--cobalt)]" />
        <p className="mt-2 max-w-[6.5rem] font-label text-[9px] font-semibold uppercase leading-[1.35] tracking-[0.16em] text-[color:var(--ink)]/70">
          Pollen
          <br />
          Robotics
        </p>
      </div>
      <div className="poster-plinth poster-plinth-side">
        <span className="plinth-lid" />
        <span className="plinth-flank" />
        <div className="poster-hands-plate">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="poster-hands" src={assetPath("/poster/hands.png")} alt="" />
        </div>
      </div>
      <div className="poster-plinth poster-plinth-right">
        <span className="plinth-lid" />
        <p className="max-w-[8.2rem] ml-auto font-label text-[10px] font-semibold uppercase leading-[1.28] tracking-[0.16em] text-[color:var(--cobalt)]">
          {POSTER.footer.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
        <p className="mt-3 font-label text-[9px] tracking-[0.22em] text-[color:var(--cobalt)]">
          {`//  ${POSTER.year}`}
        </p>
      </div>
    </Fade>
  );
}
