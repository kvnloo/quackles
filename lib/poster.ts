import { LINKS } from "@/lib/story";

/** Poster lock constants — Hermes layout DNA, fan study. */
export const POSTER = {
  brand: "Nous",
  nav: [
    { label: "HERMES", href: LINKS.hermes },
    { label: "POLLEN", href: LINKS.pollen },
    { label: "SOURCE", href: LINKS.source },
  ],
  cta: null as string | null,
  kicker: "01  AGENT —",
  headline: ["A MORE", "OPEN", "INTELLIGENCE"],
  substack: ["AGENTS", "MODELS", "TOOLS", "FOR EVERYONE"],
  rightLead: ["RESEARCH", "BUILDS", "A BRIGHTER", "TOMORROW"],
  rightSub: ["OPEN", "USEFUL", "BEAUTIFUL"],
  note: [
    "NOUS RESEARCH",
    "37.7749° N",
    "122.4194° W",
    "HUMAN",
    "COMPUTE",
    "COLLABORATION",
    "AT SCALE",
  ],
} as const;
