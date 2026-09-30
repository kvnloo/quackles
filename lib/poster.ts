import { LINKS } from "@/lib/story";

/** Hero poster copy: the Hermes Agent poster structure (Nous Research), adapted to
 * Microduck. One Microduck mention at headline level (the wordmark); everything else
 * keeps the Hermes stacks, with deltas only where the fact is Microduck's. */
export const POSTER = {
  brand: "microduck",
  nav: [
    { label: "POLLEN", href: LINKS.pollen },
    { label: "DOCS", href: LINKS.docs },
  ],
  cta: { label: "HERMES AGENT", href: LINKS.hermes },
  kicker: "01  BIPED",
  headline: ["A MORE", "OPEN", "INTELLIGENCE"],
  substack: ["AGENTS", "MODELS", "ROBOTS", "FOR EVERYONE"],
  // Pollen Robotics is based in Bordeaux (city centre coordinates).
  place: ["POLLEN ROBOTICS", "44.8378° N", "0.5792° W"],
  scale: ["HUMAN", "ROBOT", "COLLABORATION", "AT DESK SCALE"],
  rightLead: ["RESEARCH", "BUILDS", "A BRIGHTER", "TOMORROW"],
  rightSub: ["OPEN", "USEFUL", "BEAUTIFUL"],
  year: "2026",
} as const;
