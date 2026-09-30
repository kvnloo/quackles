import { THEME_IDS, type ThemeId } from "./sequence/manifest";

/**
 * Which preview this build is. One shared engine; each `preview/*` branch changes only the `PREVIEW` line below.
 *  - scenes: the themes the page may show (theme control + store range), or "mushroom" = the hidden moss scene alone.
 *  - story: the scroll story (beats, hero copy, scroll space). false = a single still you can only zoom.
 *  - zoom: which deep-zoom family serves tiles. "policy" = production INSPECTION_POLICY/HIDDEN_POLICY verbatim.
 */
export type PreviewZoom = "policy" | "none" | "201mp" | "1gp";
export type Preview = {
  id: string;
  scenes: ThemeId[] | "mushroom";
  story: boolean;
  zoom: PreviewZoom;
};

const ALL: ThemeId[] = [...THEME_IDS];

export const PREVIEWS = {
  production: { id: "production", scenes: ALL, story: true, zoom: "policy" },
  "scenes-lowres": { id: "scenes-lowres", scenes: ALL, story: true, zoom: "none" },
  "scenes-250mp": { id: "scenes-250mp", scenes: ALL, story: true, zoom: "201mp" },
  "scenes-gigapixel": { id: "scenes-gigapixel", scenes: ALL, story: true, zoom: "1gp" },
  "gigapixel-single": { id: "gigapixel-single", scenes: "mushroom", story: false, zoom: "1gp" },
} satisfies Record<string, Preview>;

export const PREVIEW: Preview = PREVIEWS["scenes-gigapixel"];
