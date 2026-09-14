"use client";

import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { COLORWAYS } from "@/lib/colorways";
import { LINKS, MOVES, SPECS, STORY } from "@/lib/story";
import { sectionIndex } from "@/lib/pose";
import { useExperience } from "@/components/providers/ExperienceProvider";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Cpu } from "lucide-react";

const AssembleHero = dynamic(
  () => import("@/components/duck/AssembleHero").then((module) => module.AssembleHero),
  { ssr: false }
);

export function StoryOverlay() {
  const { progress, colorway, setColorway, webgl } = useExperience();
  const current = sectionIndex(progress);

  return (
    <div className="relative z-20">
      {STORY.map((section) => {
        if (section.id === "anatomy" && webgl) {
          return (
            <section
              key={section.id}
              className="relative"
              aria-label={section.title.replace("\n", " ")}
            >
              <AssembleHero />
            </section>
          );
        }

        const overSim = section.id === "play" || section.id === "cta";

        return (
          <section
            key={section.id}
            className={cn(
              "relative flex min-h-[100svh] items-end md:items-center",
              overSim && "pointer-events-none"
            )}
            aria-label={section.title.replace("\n", " ")}
          >
            <div className="w-full px-5 pb-28 pt-24 md:px-12 md:pb-24">
              <div
                className={cn(
                  "max-w-xl md:max-w-[min(36rem,42vw)]",
                  overSim &&
                    "pointer-events-auto rounded-3xl border border-border/70 bg-background/72 p-5 shadow-2xl backdrop-blur-md md:p-6"
                )}
              >
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--accent-trim)]">
                  {section.kicker}
                </p>
                <h2 className="font-heading text-[2.35rem] leading-[0.95] text-balance text-foreground md:text-6xl lg:text-[4.25rem] whitespace-pre-line">
                  {section.title}
                </h2>
                <p className="mt-5 max-w-md text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
                  {section.body}
                </p>

                {section.id === "hero" && (
                  <div className="mt-8 flex flex-wrap gap-3">
                    <a
                      href={LINKS.store}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ size: "lg" }))}
                    >
                      Pre-order the robot
                      <ArrowUpRight className="size-3.5" />
                    </a>
                    <a
                      href={LINKS.github}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                    >
                      pollen-robotics/microduck
                    </a>
                  </div>
                )}

                {section.id === "scale" && (
                  <dl className="mt-8 grid grid-cols-3 gap-3">
                    {[
                      ["25 cm", "tall"],
                      ["<800 g", "to pick up"],
                      ["15", "motors"],
                    ].map(([n, l]) => (
                      <div
                        key={l}
                        className="rounded-2xl border border-border/80 bg-card/40 px-3 py-3 backdrop-blur-sm"
                      >
                        <dt className="font-heading text-2xl text-foreground md:text-3xl">{n}</dt>
                        <dd className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {l}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}

                {section.id === "anatomy" && (
                  <ul className="mt-7 space-y-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    <li>01  visor camera + 8×8 ToF</li>
                    <li>02  grasping beak</li>
                    <li>03  stacked neck servos</li>
                    <li>04  RK3566 in the torso</li>
                    <li>05  two IMUs · Wi-Fi · BT</li>
                  </ul>
                )}

                {section.id === "waddle" && (
                  <p className="mt-6 font-mono text-xs text-muted-foreground">
                    Same recipe as the real robot:{" "}
                    <a
                      className="underline decoration-[color:var(--accent-trim)] underline-offset-4"
                      href={LINKS.rl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      microduck_rl
                    </a>
                  </p>
                )}

                {section.id === "play" && (
                  <div className="mt-6 space-y-4">
                    <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                      WASD steer · M legs/rollers · G grab · Space reset
                    </p>
                    <a
                      href={LINKS.simulator}
                      target="_blank"
                      rel="noreferrer"
                      className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                    >
                      <Cpu className="size-3.5" />
                      Open simulator in a new tab
                    </a>
                  </div>
                )}

                {section.id === "colorways" && (
                  <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {COLORWAYS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setColorway(c.id)}
                        className={cn(
                          "rounded-2xl border px-3 py-3 text-left transition",
                          colorway === c.id
                            ? "border-[color:var(--accent-trim)] bg-card/70"
                            : "border-border bg-card/30 hover:bg-card/50"
                        )}
                      >
                        <span
                          className="mb-2 block size-6 rounded-full border border-black/20"
                          style={{ background: c.shell }}
                        />
                        <span className="block font-heading text-lg">{c.name}</span>
                        <span className="mt-1 block text-[11px] leading-snug text-muted-foreground">
                          {c.blurb}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {section.id === "cta" && (
                  <div className="mt-8 space-y-8">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {SPECS.map((s) => (
                        <div
                          key={s.label}
                          className="rounded-2xl border border-border/80 bg-card/40 px-3 py-3"
                        >
                          <div className="font-heading text-2xl">{s.value}</div>
                          <div className="text-xs text-foreground/80">{s.label}</div>
                          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            {s.hint}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {MOVES.map((m) => (
                        <Badge key={m.file} variant="secondary" className="font-mono text-[10px]">
                          {m.name}
                        </Badge>
                      ))}
                    </div>
                    <pre className="overflow-x-auto rounded-2xl border border-border bg-card/50 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
{`$ ssh microduck
$ robotctl monitor    # status of the robot
$ robotctl configure  # wifi, identity, voice
$ robotctl update     # signed, reversible`}
                    </pre>
                    <div className="flex flex-wrap gap-3">
                      <a
                        href={LINKS.store}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ size: "lg" }))}
                      >
                        Pre-order · $399
                        <ArrowUpRight className="size-3.5" />
                      </a>
                      <a
                        href={LINKS.official}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                      >
                        Official product page
                      </a>
                      <a
                        href={LINKS.simulator}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
                      >
                        <Cpu className="size-3.5" />
                        Browser simulator
                      </a>
                    </div>
                    <p className="max-w-md text-[11px] leading-relaxed text-muted-foreground">
                      Fan-made 3D scrollytelling page. The duck you scrolled is the official
                      kinematics + GLB from the Hugging Face simulator; the last chapters embed that
                      playground. Microduck is a product of Pollen Robotics. Software is Apache-2.0;
                      mechanical and electronic design files are not open hardware. Facts from the{" "}
                      <a
                        className="underline underline-offset-2"
                        href={LINKS.press}
                        target="_blank"
                        rel="noreferrer"
                      >
                        press kit
                      </a>
                      .
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}

      <div className="pointer-events-none fixed right-4 top-1/2 z-30 hidden -translate-y-1/2 md:flex md:flex-col md:gap-2">
        {STORY.map((s, i) => (
          <span
            key={s.id}
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-all",
              current === i ? "h-6 bg-[color:var(--accent-trim)]" : "bg-foreground/25"
            )}
          />
        ))}
      </div>
    </div>
  );
}
