"use client";

import { POSTER } from "@/lib/poster";
import { useExperience } from "@/components/providers/ExperienceProvider";

export function PosterHeroCopy() {
  const { progress } = useExperience();
  const fade = Math.max(0, 1 - progress * 7.5);

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-[3.35rem] z-[22] px-[16px]"
      style={{ opacity: fade }}
    >
      <p className="flex items-center gap-3 font-label text-[9px] font-semibold uppercase tracking-[0.22em] text-[color:var(--cobalt)]">
        {POSTER.kicker}
        <span className="inline-block h-px w-9 bg-[color:var(--cobalt)]" />
      </p>
      <h1 className="mt-2 font-display text-[3.15rem] leading-[0.8] tracking-[-0.035em] text-[color:var(--cobalt)]">
        {POSTER.headline.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </h1>
      <ul className="mt-5 space-y-[1px] font-label text-[10px] font-semibold uppercase leading-[1.4] tracking-[0.18em] text-[color:var(--ink)]">
        {POSTER.stack.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <p className="mt-6 font-label text-[9px] font-semibold uppercase leading-[1.45] tracking-[0.16em] text-[color:var(--ink)]/75">
        {POSTER.coords.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
      <p className="mt-5 max-w-[9.2rem] font-label text-[9px] font-semibold uppercase leading-[1.4] tracking-[0.16em] text-[color:var(--ink)]">
        {POSTER.manifesto.map((line) => (
          <span key={line} className="block">
            {line}
          </span>
        ))}
      </p>
    </div>
  );
}
