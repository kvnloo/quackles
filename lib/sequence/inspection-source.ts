import type { SequenceManifest, ThemeId, Variant } from "./manifest";

/**
 * One inspection session = one authored source family per theme. Resolution
 * tiers may only refine within the selected family; families are never
 * interleaved in a single width ladder (issue #43).
 */
export type SourceFamily = "legacy-201mp" | "gp-1gp";
export type SourceStatus = "production-201-250mp" | "production-1gp" | "candidate-1gp" | "disabled";
export type InspectionSource = { selected: SourceFamily | null; status: SourceStatus; revision: string };

/** The switch. Edit `selected`/`status`, bump `revision`. Full-frame plates are unaffected. */
export const INSPECTION_POLICY: Record<ThemeId, InspectionSource> = {
  // Blue: accepted ~201 MP family is canonical (DECISIONS D1). 1GP Blue is a different scene (dE 35-83).
  blue: { selected: "legacy-201mp", status: "production-201-250mp", revision: "2026-09-30.2" },
  // All-five audit (issue-43-evidence/all-five): 1GP vs authored plate under the frozen contract (dE<=5, |dL|<=3).
  // Day is closest (plinth diverges, dE 16); White/Dark/Night are visibly different scenes. Only production-* serves tiles.
  day: { selected: "gp-1gp", status: "candidate-1gp", revision: "2026-09-30.2" },
  white: { selected: null, status: "disabled", revision: "2026-09-30.2" },
  dark: { selected: null, status: "disabled", revision: "2026-09-30.2" },
  night: { selected: null, status: "disabled", revision: "2026-09-30.2" },
};

/** Hidden scenes with their own pyramids (not a theme). Mushroom audit: 1GP vs its authored plate dE 0.9-1.6, |dL|<=0.15 -> passes the frozen contract. */
export const HIDDEN_POLICY: Record<"mushroom", InspectionSource> = {
  mushroom: { selected: "gp-1gp", status: "production-1gp", revision: "2026-09-30.2" },
};
export type InspectionSourcesReceipt = Record<ThemeId, InspectionSource> & { hidden: Record<"mushroom", InspectionSource> };

function serves(source: InspectionSource, family: SourceFamily | null, options: { allowCandidates?: boolean }) {
  if (family === null) return true;
  const live = source.status.startsWith("production") || (source.status === "candidate-1gp" && options.allowCandidates === true);
  return live && family === source.selected;
}

export function applyHiddenPolicy(variants: Variant[], source: InspectionSource, options: { allowCandidates?: boolean } = {}): Variant[] {
  return variants.filter((variant) => serves(source, familyOf(variant), options));
}

export function familyOf(variant: Variant): SourceFamily | null {
  return "tiles" in variant ? (variant.tiles.urlTemplate.includes("/gp/") ? "gp-1gp" : "legacy-201mp") : null;
}

/** `allowCandidates` (A/B only, e.g. `?inspectionCandidates=1`) lets candidate-1gp themes serve tiles; production never does. */
export function applyInspectionPolicy(manifest: SequenceManifest, policy: Record<ThemeId, InspectionSource> = INSPECTION_POLICY, options: { allowCandidates?: boolean } = {}): SequenceManifest {
  const frames = manifest.frames.map((frame) => {
    const assets = { ...frame.assets };
    for (const theme of Object.keys(assets) as ThemeId[]) {
      assets[theme] = frame.assets[theme].filter((variant) => serves(policy[theme], familyOf(variant), options));
    }
    return { ...frame, assets };
  });
  return { ...manifest, frames };
}

export function describeInspectionSources(policy: Record<ThemeId, InspectionSource> = INSPECTION_POLICY): InspectionSourcesReceipt {
  return structuredClone({ ...policy, hidden: HIDDEN_POLICY });
}
