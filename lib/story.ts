export const STORY = [
  { id: "hero", kicker: "01  AGENT —", title: "", body: "" },
  {
    id: "explode",
    kicker: "02  ASSEMBLY",
    title: "EXPLODE",
    body: "Fifteen motors, visor camera, stacked neck. The silhouette is the machine.",
  },
  {
    id: "jump",
    kicker: "03  MOTION",
    title: "JUMP",
    body: "Both feet off the desk. Same 25 cm biped, same 50 Hz loop.",
  },
] as const;

export const SPECS = [
  { value: "15", label: "Motors" },
  { value: "25 cm", label: "Tall" },
  { value: "800 g", label: "Mass" },
  { value: "50 Hz", label: "Policy" },
] as const;

/** Official destinations — fan study, not affiliated. */
export const LINKS = {
  hermes: "https://hermes-agent.nousresearch.com/",
  pollen: "https://pollen-robotics.com/microduck/",
  official: "https://pollen-robotics.com/microduck/",
  store: "https://store.pollen-robotics.com/collections/microduck",
  github: "https://github.com/pollen-robotics/microduck",
  source: "https://github.com/kvnloo/quackles",
  rl: "https://github.com/pollen-robotics/microduck_rl",
  docs: "https://github.com/pollen-robotics/microduck",
  nous: "https://nousresearch.com/",
} as const;
