import { THEME_IDS, type ThemeId } from "./sequence/manifest";

/**
 * Which preview this build is. One shared engine; each `preview/*` branch changes only the `PREVIEW` line below.
 *  - scenes: the themes the page may show (theme control + store range), or "mushroom" = the hidden moss scene alone.
 *  - story: the scroll story (beats, hero copy, scroll space). false = a single still you can only zoom.
 *  - zoom: which deep-zoom family serves tiles. "policy" = production INSPECTION_POLICY/HIDDEN_POLICY verbatim.
 *  - refine: RFC-002 spike (#45). "worker" = tile decode + tile compositing in a Worker on OffscreenCanvas
 *    (lib/sequence/refine-mode.ts; `?refine=main` is the in-process A/B control). Absent = the main-thread path, always.
 */
export type PreviewZoom = "policy" | "none" | "201mp" | "1gp";
export type Preview = {
  id: string;
  scenes: ThemeId[] | "mushroom";
  story: boolean;
  zoom: PreviewZoom;
  refine?: "main" | "worker";
};

const ALL: ThemeId[] = [...THEME_IDS];

export const PREVIEWS = {
  production: { id: "production", scenes: ALL, story: true, zoom: "policy" },
  "scenes-lowres": { id: "scenes-lowres", scenes: ALL, story: true, zoom: "none" },
  "scenes-250mp": { id: "scenes-250mp", scenes: ALL, story: true, zoom: "201mp" },
  "scenes-gigapixel": { id: "scenes-gigapixel", scenes: ALL, story: true, zoom: "1gp" },
  "gigapixel-single": { id: "gigapixel-single", scenes: ["white"], story: false, zoom: "1gp", refine: "worker" }, // owner 2026-09-30: brighter 1GP image (was the dark moss scene)
} satisfies Record<string, Preview>;

export const PREVIEW: Preview = PREVIEWS["gigapixel-single"];
