"use client";

import { Badge } from "@/components/ui/badge";
import { COLORWAYS } from "@/lib/colorways";
import { LINKS, MOVES, SPECS, STORY } from "@/lib/story";
import { sectionIndex } from "@/lib/pose";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { cn } from "@/lib/utils";

export function StoryOverlay() {
  const { progress, colorway, setColorway } = useExperience();
  const current = sectionIndex(progress);

  return (
    <div className="relative z-20">
      {STORY.map((section) => {
        const overSim = section.id === "play" || section.id === "cta";
        const isHero = section.id === "hero";

        return (
          <section
            key={section.id}
            className={cn(
              "relative flex min-h-[100svh]",
              isHero ? "items-end" : "items-start pt-16",
              overSim && "pointer-events-none"
            )}
            aria-label={section.title.replace("\n", " ")}
          >
            {isHero ? (
              <div className="h-[100svh] w-full" />
            ) : (
              <div className="w-full px-4 pb-28 pt-2">
                <div
                  className={cn(
                    "pointer-events-auto max-w-[17.5rem]",
                    overSim &&
                      "border border-[color:var(--cobalt)] bg-[color:var(--paper)]/88 p-4 backdrop-blur-md"
                  )}
                >
                  <p className="font-label text-[10px] font-semibold uppercase tracking-[0.22em] text-[color:var(--cobalt)]">
                    {section.kicker}
                    <span className="ml-2 inline-block w-8 border-t border-[color:var(--cobalt)] align-middle" />
                  </p>
                  <h2 className="mt-2 font-display text-[2.15rem] leading-[0.88] tracking-[-0.03em] text-[color:var(--cobalt)] whitespace-pre-line">
                    {section.title}
                  </h2>
                  <p className="mt-4 max-w-[16rem] text-[13px] leading-relaxed text-[color:var(--ink)]/80">
                    {section.body}
                  </p>

                  {section.id === "scale" && (
                    <dl className="mt-6 grid grid-cols-3 gap-2">
                      {[
                        ["25 cm", "tall"],
                        ["<800 g", "to pick up"],
                        ["15", "motors"],
                      ].map(([n, l]) => (
                        <div key={l} className="border border-[color:var(--cobalt)]/35 px-2 py-2">
                          <dt className="font-display text-xl text-[color:var(--ink)]">{n}</dt>
                          <dd className="mt-1 font-label text-[8px] uppercase tracking-widest text-[color:var(--ink)]/65">
                            {l}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}

                  {section.id === "anatomy" && (
                    <ul className="mt-5 space-y-1 font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ink)]/75">
                      <li>01  visor camera + 8×8 ToF</li>
                      <li>02  grasping beak</li>
                      <li>03  stacked neck servos</li>
                      <li>04  RK3566 in the torso</li>
                      <li>05  two IMUs · Wi-Fi · BT</li>
                    </ul>
                  )}

                  {section.id === "waddle" && (
                    <p className="mt-5 font-label text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink)]/70">
                      Same recipe:{" "}
                      <a className="underline decoration-[color:var(--cobalt)]" href={LINKS.rl} target="_blank" rel="noreferrer">
                        microduck_rl
                      </a>
                    </p>
                  )}

                  {section.id === "play" && (
                    <div className="mt-5 space-y-3">
                      <p className="font-label text-[10px] uppercase tracking-[0.16em] text-[color:var(--ink)]/70">
                        WASD walk · camera for hands
                      </p>
                      <a
                        href={LINKS.tryBrowser}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block border border-[color:var(--cobalt)] px-3 py-2 font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--cobalt)]"
                      >
                        Open Try Micro Duck
                      </a>
                    </div>
                  )}

                  {section.id === "colorways" && (
                    <div className="mt-6 grid grid-cols-2 gap-2">
                      {COLORWAYS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setColorway(c.id)}
                          className={cn(
                            "border px-2 py-2 text-left",
                            colorway === c.id
                              ? "border-[color:var(--cobalt)] bg-[color:var(--paper)]"
                              : "border-[color:var(--cobalt)]/30"
                          )}
                        >
                          <span
                            className="mb-2 block size-5 rounded-full border border-black/15"
                            style={{ background: c.shell }}
                          />
                          <span className="block font-display text-lg leading-none">{c.name}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {section.id === "cta" && (
                    <div className="mt-6 space-y-5">
                      <div className="grid grid-cols-2 gap-2">
                        {SPECS.map((s) => (
                          <div key={s.label} className="border border-[color:var(--cobalt)]/30 px-2 py-2">
                            <div className="font-display text-xl">{s.value}</div>
                            <div className="font-label text-[9px] uppercase tracking-widest">{s.label}</div>
                          </div>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {MOVES.map((m) => (
                          <Badge key={m.file} variant="secondary" className="font-label text-[9px] uppercase">
                            {m.name}
                          </Badge>
                        ))}
                      </div>
                      <div className="flex flex-col gap-2">
                        <a
                          href={LINKS.store}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-[color:var(--cobalt)] bg-[color:var(--cobalt)] px-3 py-2 text-center font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--paper)]"
                        >
                          Pre-order · $399
                        </a>
                        <a
                          href={LINKS.official}
                          target="_blank"
                          rel="noreferrer"
                          className="border border-[color:var(--cobalt)] px-3 py-2 text-center font-label text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--cobalt)]"
                        >
                          Official product page
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        );
      })}

      <div className="pointer-events-none absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 min-[400px]:flex">
        {STORY.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              current === i ? "h-5 bg-[color:var(--cobalt)]" : "bg-[color:var(--cobalt)]/25"
            )}
          />
        ))}
      </div>
    </div>
  );
}
