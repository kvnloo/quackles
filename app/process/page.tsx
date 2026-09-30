import type { Metadata } from "next";
import { LINKS } from "@/lib/story";
import { assetPath } from "@/lib/paths";

export const metadata: Metadata = {
  title: "Process · Quackles · Microduck",
  description:
    "How this unofficial Microduck fan study was made: Blender Cycles plates, deep-zoom tiles and sources.",
};

const external = { target: "_blank", rel: "noopener noreferrer" } as const;

export default function ProcessPage() {
  return (
    <main className="process-page">
      <div className="process-nav">
        <a href={assetPath("/")}>← Back to the poster</a>
        <span>Process</span>
      </div>

      <p className="process-kicker">01 &nbsp; Fan study</p>
      <h1>
        How this
        <br />
        site was made
      </h1>
      <p>
        An unofficial study of Pollen Robotics’ Microduck, laid out after the
        Hermes Agent poster by Nous Research. Not affiliated with either.
      </p>

      <h2>01 — Plates</h2>
      <p>
        Every image is a still rendered in Blender Cycles: the official
        Microduck model in a studio set (plinths, arch, glass orb, prints). Each
        of the five themes (Day, White, Blue, Dark, Night) has 16 authored poses
        at 1024×1536. The browser draws them on a Canvas2D; scrolling selects
        the nearest pose and theme changes crossfade between adjacent themes.
        The type is HTML over the plate.
      </p>

      <h2>02 — Deep zoom</h2>
      <p>
        Inspecting the Blue hero loads a tiled pyramid cut from a ~201 MP
        Cycles render, requesting only the tiles under the visible view. Other
        themes zoom on their plate alone.
      </p>

      <h2>03 — Sources</h2>
      <ol>
        <li>
          Robot model and specifications:{" "}
          <a href={LINKS.github} {...external}>
            pollen-robotics/microduck
          </a>{" "}
          (its licenses apply).
        </li>
        <li>
          Product:{" "}
          <a href={LINKS.pollen} {...external}>
            Pollen Robotics — Microduck
          </a>
          .
        </li>
        <li>
          Poster structure and voice:{" "}
          <a href={LINKS.hermes} {...external}>
            Hermes Agent
          </a>{" "}
          by Nous Research.
        </li>
        <li>
          Built with Next.js as a static export, deployed to GitHub Pages.
        </li>
      </ol>

      <div className="process-foot">
        <p>Unofficial · Not Nous Research · Not Pollen Robotics</p>
      </div>
    </main>
  );
}
