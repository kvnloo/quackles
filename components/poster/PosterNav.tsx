"use client";

import { LINKS } from "@/lib/story";
import { POSTER } from "@/lib/poster";
import { playMorph } from "@/lib/sim/morph";
import { useExperience } from "@/components/providers/ExperienceProvider";

export function PosterNav() {
  const { progress } = useExperience();
  const morph = playMorph(progress);

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-[70] px-[14px] pt-[12px]"
      style={{ opacity: Math.max(0, 1 - morph * 0.9) }}
    >
      <div className="flex items-start gap-2">
        <a
          href="#top"
          className="pointer-events-auto font-display text-[1.38rem] leading-none tracking-[-0.04em] text-[color:var(--ink)]"
        >
          {POSTER.brand}
          <sup className="ml-0.5 align-super font-label text-[7px] font-semibold tracking-[0.12em]">
            TM
          </sup>
        </a>
        <nav className="pointer-events-auto ml-1 hidden min-[360px]:flex items-center gap-[10px] pt-[6px]">
          {POSTER.nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="font-label text-[7.5px] font-semibold uppercase tracking-[0.22em] text-[color:var(--ink)]"
            >
              {item.label}
            </a>
          ))}
        </nav>
        <a
          href={LINKS.store}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto ml-auto mt-[1px] whitespace-nowrap border border-[color:var(--cobalt)] px-[8px] py-[5px] font-label text-[8px] font-semibold uppercase tracking-[0.18em] text-[color:var(--cobalt)]"
        >
          {POSTER.cta}
        </a>
      </div>
    </header>
  );
}
