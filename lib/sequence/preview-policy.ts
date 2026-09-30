import type { Preview } from "../preview";
import { applyInspectionPolicy, familyOf, HIDDEN_POLICY, INSPECTION_POLICY, type InspectionSource, type SourceFamily } from "./inspection-source";
import { isImage, THEME_IDS, type ImageAsset, type SequenceManifest, type ThemeId, type Variant } from "./manifest";

const REVISION = "preview";
const off: InspectionSource = { selected: null, status: "disabled", revision: REVISION };
const only = (family: SourceFamily): InspectionSource =>
  ({ selected: family, status: family === "gp-1gp" ? "production-1gp" : "production-201-250mp", revision: REVISION });
const every = (source: InspectionSource) => Object.fromEntries(THEME_IDS.map((id) => [id, source])) as Record<ThemeId, InspectionSource>;

/** Source policy for a preview. "policy" returns the production objects themselves; the others override per preview only. */
export function previewPolicy(preview: Preview): { themes: Record<ThemeId, InspectionSource>; hidden: InspectionSource } {
  switch (preview.zoom) {
    case "policy": return { themes: INSPECTION_POLICY, hidden: HIDDEN_POLICY.mushroom };
    case "none": return { themes: every(off), hidden: off };
    // Only families that exist serve: today only Blue has a ~201 MP pyramid. The mushroom pyramid is 1GP, so off.
    case "201mp": return { themes: every(only("legacy-201mp")), hidden: off };
    // Preview-only override: the 1GP family for every theme (NOT scene-matched; see previewNote) and the mushroom.
    case "1gp": return { themes: every(only("gp-1gp")), hidden: only("gp-1gp") };
  }
}

/** The manifest with the preview's source policy applied. `allowCandidates` (A/B query flag) only matters for "policy". */
export function previewManifest(manifest: SequenceManifest, preview: Preview, options: { allowCandidates?: boolean } = {}): SequenceManifest {
  return applyInspectionPolicy(manifest, previewPolicy(preview).themes, preview.zoom === "policy" ? options : {});
}

/** THEME_IDS indices the page may show. The mushroom scene lives under Night (its moss palette). */
export function previewThemeIndices(preview: Preview): number[] {
  if (preview.scenes === "mushroom") return [THEME_IDS.indexOf("night")];
  const allowed = new Set(preview.scenes);
  return THEME_IDS.flatMap((id, index) => (allowed.has(id) ? [index] : []));
}

/** The hidden moss scene as a one-frame manifest: its plate + its pyramid under every theme id. */
export function mushroomScene(manifest: SequenceManifest, plate: ImageAsset, pyramid: Variant[]): SequenceManifest {
  const base = manifest.frames.find((frame) => frame.id === "p0000000") ?? manifest.frames[0];
  const variants = [plate, ...pyramid.filter((variant) => !isImage(variant))].sort((a, b) => a.width - b.width);
  const assets = Object.fromEntries(THEME_IDS.map((id) => [id, variants.slice()])) as Record<ThemeId, Variant[]>;
  return {
    ...manifest,
    defaultTheme: THEME_IDS[previewThemeIndices({ id: "mushroom", scenes: "mushroom", story: false, zoom: "1gp" })[0]],
    frames: [{ ...base, id: "p0000000", progress: 0, assets }],
    reducedMotion: [{ from: 0, frameId: "p0000000" }],
  };
}

/** Small honest on-page note, or null. Derived from what actually serves after policy. */
export function previewNote(preview: Preview, manifest: SequenceManifest): string | null {
  if (preview.zoom === "policy" || preview.zoom === "none" || preview.scenes === "mushroom") return null;
  const hero = manifest.frames.find((frame) => frame.id === "p0000000") ?? manifest.frames[0];
  if (preview.zoom === "1gp") return "1GP source: not scene-matched";
  const label = (id: ThemeId) => id[0].toUpperCase() + id.slice(1);
  const served = preview.scenes.filter((id) => hero.assets[id].some((variant) => familyOf(variant) === "legacy-201mp"));
  const pending = preview.scenes.length - served.length;
  if (!pending) return null;
  return `250MP: ${served.length ? `${served.map(label).join(", ")} only` : "none yet"}; ${pending} render${pending === 1 ? "" : "s"} pending`;
}
