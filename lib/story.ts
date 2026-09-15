export const STORY = [
  { id: "hero", kicker: "01  BIPED", title: "", body: "" },
  {
    id: "explode",
    kicker: "Anatomy",
    title: "Helmet head.\nSerious internals.",
    body: "Visor camera, 8×8 ToF, stacked neck servos, RK3566 in the trunk. Fifteen motors. The silhouette is the machine.",
  },
  {
    id: "jump",
    kicker: "Get up",
    title: "Knock it over.\nIt stands back up.",
    body: "Both feet off the desk, then standing, on its own, at 50 Hz.",
  },
  {
    id: "cta",
    kicker: "Apache-2.0 software",
    title: "Train in sim.\nWaddle in reality.",
    body: "SDK and the RL stack are on GitHub. Hardware files stay closed. Intro $399.",
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
