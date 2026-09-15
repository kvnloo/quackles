export const STORY = [
  { id: "hero", kicker: "01  BIPED", title: "", body: "" },
  {
    id: "explode",
    kicker: "Explode",
    title: "Explode.",
    body: "Fifteen motors, visor camera, stacked neck. The silhouette is the machine.",
  },
  {
    id: "jump",
    kicker: "Jump",
    title: "Jump.",
    body: "Both feet off the desk. Same 25 cm biped, same 50 Hz loop.",
  },
] as const;

export const SPECS = [
  { value: "15", label: "Motors" },
  { value: "25 cm", label: "Tall" },
  { value: "<800 g", label: "Mass" },
  { value: "50 Hz", label: "Policy" },
] as const;

export const LINKS = {
  official: "https://pollen-robotics.com/microduck/",
  store: "https://store.pollen-robotics.com/collections/microduck",
  github: "https://github.com/pollen-robotics/microduck",
  rl: "https://github.com/pollen-robotics/microduck_rl",
  docs: "https://github.com/pollen-robotics/microduck",
} as const;
