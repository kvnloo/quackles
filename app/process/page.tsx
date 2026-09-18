import type { Metadata } from "next";
import { LINKS } from "@/lib/story";
import { assetPath } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Process · Quackles fan study",
  description:
    "How this unofficial Microduck × Hermes-style poster site was made — references, Cycles, web, and nightly deploy.",
};

export default function ProcessPage() {
  return (
    <main className="process-page">
      <div className="process-nav">
        <a href={assetPath("/")}>← Poster</a>
        <span>PROCESS / 01</span>
      </div>

      <p className="process-kicker">01 &nbsp; EDUCATIONAL · FAN STUDY</p>
      <h1>
        How this
        <br />
        site was made
      </h1>
      <p>
        Unofficial fan recreation: a{" "}
        <strong>Nous Hermes–style poster</strong> with a{" "}
        <strong>Microduck</strong> as the machine in frame. Not affiliated with
        Nous Research or Pollen Robotics. Type and layout aim to be essentially
        identical to the locked poster refs; product CTAs and night set pieces
        stay out of the counterfeit zone.
      </p>

      <h2>01 — What you are looking at</h2>
      <p>
        A mobile phone-shell landing: one Cycles first frame (theme plates),
        HTML type over the plate, scroll beats for explode / jump, and a studio
        theme lerp (White / Blue / Dark — day is a cinematic extension).
      </p>
      <p>
        Official homes if you want the real products:{" "}
        <a href={LINKS.hermes} target="_blank" rel="noreferrer">
          Hermes Agent
        </a>{" "}
        ·{" "}
        <a href={LINKS.pollen} target="_blank" rel="noreferrer">
          Pollen Microduck
        </a>{" "}
        ·{" "}
        <a href={LINKS.source} target="_blank" rel="noreferrer">
          this repo
        </a>
        .
      </p>

      <h2>02 — Reference locks</h2>
      <ol>
        <li>
          <strong>White / cobalt / dark</strong> Hermes posters — layout, type
          stacks, plinth slogans, crop language.
        </li>
        <li>
          <strong>Day</strong> user lock (`calibration/references/day.png`) —
          hard raking sun, materials, reflections target.
        </li>
        <li>
          <strong>Night</strong> stored for later (`night.png`, moss/cyan
          inspo); night theme left as-is in the active build plan.
        </li>
      </ol>

      <h2>03 — 3D / Cycles</h2>
      <ol>
        <li>
          Quality-final blends per base theme; motion from{" "}
          <code>cinematic_motion</code>; lighting from{" "}
          <code>cinematic_theme</code>.
        </li>
        <li>
          Limestone PBR maps + UV-projected Creation-of-Adam print on the plinth
          (<code>plinth_look</code>); billboard hidden after pin.
        </li>
        <li>
          Robot shell print-wear maps on cream plastics; orb glass tuned so
          robot and marble read in reflection, not lights-only.
        </li>
        <li>
          Proof ladder: 1024 → 4096 day p0 against the day lock; crop-judge KEEP
          methods before promoting stills.
        </li>
      </ol>

      <h2>04 — Web</h2>
      <ol>
        <li>
          Next.js static export; nested GitHub Pages channel{" "}
          <code>/nightly</code>.
        </li>
        <li>
          Theme tokens pulled from live Hermes Agent CSS (paper / cobalt / ink).
        </li>
        <li>
          Display: Rules Gothic Condensed; mono: Aeonik Fono — same family as
          the poster system.
        </li>
        <li>
          Sequence player loads progressive webp / 4096 tiles for hi-res scrub
          once packed.
        </li>
      </ol>

      <h2>05 — LGTM loop</h2>
      <p>
        Stills are not “done” when Cycles exits. Side-by-side crops vs locks,
        stone/surface gates, then 4K on nightly for human LGTM. Full 200MP /
        gigapixel only after that gate — the old 200MP blue plate is
        texture-stale relative to this pass.
      </p>

      <h2>06 — Deploy</h2>
      <p>
        Push to branch <code>nightly</code> runs Pages CI. Build stamps SHA +
        time so a stale tab is obvious. This process page ships with the same
        channel.
      </p>

      <h2>07 — Honesty</h2>
      <p>
        Fan study. Microduck geometry and Pollen facts where cited. Hermes
        poster language as design homage. No Install Hermes funnel cosplay; no
        claim of open hardware. Specs on the scroll beat are press-kit class
        facts, not a store checkout.
      </p>

      <div className="process-foot">
        <p>
          <a href={LINKS.hermes} target="_blank" rel="noreferrer">
            Hermes Agent ↗
          </a>
          {" · "}
          <a href={LINKS.pollen} target="_blank" rel="noreferrer">
            Pollen Microduck ↗
          </a>
          {" · "}
          <a href={LINKS.source} target="_blank" rel="noreferrer">
            kvnloo/quackles ↗
          </a>
        </p>
        <p>Unofficial · Not Nous Research · Not Pollen Robotics · 2026</p>
      </div>
    </main>
  );
}
