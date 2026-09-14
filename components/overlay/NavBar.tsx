"use client";

import { buttonVariants } from "@/components/ui/button";
import { COLORWAYS } from "@/lib/colorways";
import { LINKS } from "@/lib/story";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { cn } from "@/lib/utils";

export function NavBar() {
  const { colorway, setColorway, progress } = useExperience();

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
      <div className="flex items-center justify-between gap-3 px-4 py-4 md:px-8">
        <a
          href="#top"
          className="pointer-events-auto font-heading text-lg tracking-tight text-foreground md:text-xl"
        >
          microduck
        </a>

        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/70 bg-background/55 px-2 py-1 backdrop-blur-md">
          {COLORWAYS.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-label={c.name}
              title={c.blurb}
              onClick={() => setColorway(c.id)}
              className="relative size-6 rounded-full border border-black/20 transition-transform hover:scale-110"
              style={{ background: c.shell }}
            >
              {colorway === c.id && (
                <span className="absolute inset-[-3px] rounded-full border border-[color:var(--accent-trim)]" />
              )}
            </button>
          ))}
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          <a
            href={LINKS.github}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            <span className="hidden sm:inline">GitHub</span>
          </a>
          <a
            href={LINKS.store}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            Pre-order $399
          </a>
        </div>
      </div>
      <div
        className="h-[2px] origin-left bg-[color:var(--accent-trim)]"
        style={{ transform: `scaleX(${progress})` }}
      />
    </header>
  );
}
