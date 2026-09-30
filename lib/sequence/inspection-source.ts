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
  // Blue: accepted ~201 MP family is the control; 1GP stays out until it passes registration vs the cobalt first frame.
  blue: { selected: "legacy-201mp", status: "production-201-250mp", revision: "2026-09-30.1" },
  // Only the 1GP family exists for these themes today; behaviour unchanged, pending the #43 per-theme visual audit.
  day: { selected: "gp-1gp", status: "production-1gp", revision: "2026-09-30.1" },
  white: { selected: "gp-1gp", status: "production-1gp", revision: "2026-09-30.1" },
  dark: { selected: "gp-1gp", status: "production-1gp", revision: "2026-09-30.1" },
  night: { selected: "gp-1gp", status: "production-1gp", revision: "2026-09-30.1" },
};

export function familyOf(variant: Variant): SourceFamily | null {
  return "tiles" in variant ? (variant.tiles.urlTemplate.includes("/gp/") ? "gp-1gp" : "legacy-201mp") : null;
}

export function applyInspectionPolicy(manifest: SequenceManifest, policy: Record<ThemeId, InspectionSource> = INSPECTION_POLICY): SequenceManifest {
  const frames = manifest.frames.map((frame) => {
    const assets = { ...frame.assets };
    for (const theme of Object.keys(assets) as ThemeId[]) {
      const { selected, status } = policy[theme];
      assets[theme] = frame.assets[theme].filter((variant) => {
        const family = familyOf(variant);
        return family === null || (status !== "disabled" && family === selected);
      });
    }
    return { ...frame, assets };
  });
  return { ...manifest, frames };
}

export function describeInspectionSources(policy: Record<ThemeId, InspectionSource> = INSPECTION_POLICY): Record<ThemeId, InspectionSource> {
  return structuredClone(policy);
}
