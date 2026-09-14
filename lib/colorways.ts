export const COLORWAYS = [
  {
    id: "cream",
    name: "Cream",
    blurb: "Cream shells, orange trim and beak",
    shell: "#f7e6cb",
    trim: "#e56b1a",
    beak: "#e56b1a",
    eyeRing: "#e56b1a",
    sole: "#f0b429",
    visor: "#9aa0a4",
  },
  {
    id: "graphite",
    name: "Graphite",
    blurb: "Graphite shells, yellow trim and beak",
    shell: "#6c6a68",
    trim: "#f0b429",
    beak: "#f0b429",
    eyeRing: "#7a5ea8",
    sole: "#5c3d7a",
    visor: "#8b8d90",
  },
  {
    id: "lavender",
    name: "Lavender",
    blurb: "Lavender shells, yellow trim and beak",
    shell: "#bfa9cf",
    trim: "#f0b429",
    beak: "#f0b429",
    eyeRing: "#7ec8e3",
    sole: "#6b4a8a",
    visor: "#9aa0a6",
  },
  {
    id: "sky",
    name: "Sky",
    blurb: "Sky-blue shells, orange trim and beak",
    shell: "#a9dbe8",
    trim: "#e56b1a",
    beak: "#e56b1a",
    eyeRing: "#e56b1a",
    sole: "#e56b1a",
    visor: "#97a0a6",
  },
] as const;

export type ColorwayId = (typeof COLORWAYS)[number]["id"];
export type Colorway = (typeof COLORWAYS)[number];

/** Official simulator variant keys (pollen-robotics/microduck-simulator). */
export const COLORWAY_TO_VARIANT: Record<ColorwayId, "classic" | "charcoal" | "purple" | "blue"> =
  {
    cream: "classic",
    graphite: "charcoal",
    lavender: "purple",
    sky: "blue",
  };

export function getColorway(id: ColorwayId): Colorway {
  return COLORWAYS.find((c) => c.id === id) ?? COLORWAYS[0];
}
