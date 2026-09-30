export type SequencePerfProfileId =
  | "constrained"
  | "balanced"
  | "full";

export type SequencePerfProfile = {
  id: SequencePerfProfileId;
  decodedBudgetBytes: number;
  /** Decoded bytes the pinned low-tier underlay may take (render.ts underlayPlan). */
  underlayBudgetBytes: number;
  compressedBudgetBytes: number;
  maxActiveJobs: number;
  maxZoomCap: number;
  tileOverscan: 0 | 1;
  viewfinderBackingWidth: number;
};

type NetworkHints = {
  saveData?: boolean;
  effectiveType?: string;
};

type NavigatorWithHints = Navigator & {
  deviceMemory?: number;
  connection?: NetworkHints;
};

const MIB = 1024 * 1024;
const RICH_DECODED_BUDGET = 128 * MIB;

const PROFILES: Record<SequencePerfProfileId, SequencePerfProfile> = {
  constrained: {
    id: "constrained",
    decodedBudgetBytes: 40 * MIB,
    underlayBudgetBytes: 6 * MIB,
    compressedBudgetBytes: 64 * MIB,
    maxActiveJobs: 2,
    maxZoomCap: 2.5,
    tileOverscan: 0,
    viewfinderBackingWidth: 80,
  },
  balanced: {
    id: "balanced",
    decodedBudgetBytes: 64 * MIB,
    underlayBudgetBytes: 16 * MIB,
    compressedBudgetBytes: 96 * MIB,
    maxActiveJobs: 2, // phones: two concurrent decodes; more flooded the GPU with uploads during zoom
    maxZoomCap: 24,
    tileOverscan: 0,
    viewfinderBackingWidth: 96,
  },
  full: {
    id: "full",
    decodedBudgetBytes: 96 * MIB,
    underlayBudgetBytes: 16 * MIB,
    compressedBudgetBytes: 128 * MIB,
    maxActiveJobs: 3,
    maxZoomCap: 24,
    tileOverscan: 0, // the 40% coverage margin is the pan buffer; a ring on top only added traffic (#43)
    viewfinderBackingWidth: 112,
  },
};

/**
 * Conservative capability policy for a deep-zoom image surface.
 *
 * Optional browser hints are never required for correctness. Missing hints
 * fall back to pointer/CPU signals rather than assuming either a flagship or
 * a weak device. Explicit Save-Data always wins.
 */
export function sequencePerfProfile(): SequencePerfProfile {
  if (typeof navigator === "undefined") return PROFILES.balanced;

  const nav = navigator as NavigatorWithHints;
  const connection = nav.connection;
  const effectiveType = connection?.effectiveType ?? "";
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency || 4;
  const coarse =
    typeof matchMedia === "function" &&
    matchMedia("(pointer: coarse)").matches;

  const constrained =
    connection?.saveData === true ||
    effectiveType === "slow-2g" ||
    effectiveType === "2g" ||
    (memory !== undefined && memory <= 2);

  if (constrained) return PROFILES.constrained;

  const balanced =
    coarse ||
    effectiveType === "3g" ||
    (memory !== undefined && memory <= 4) ||
    cores <= 4;

  const profile = balanced ? PROFILES.balanced : PROFILES.full;
  // A device reporting >= 8 GB (the owner's S25 Ultra reports 8) holds two tier plans side by side: 128 MiB of decoded
  // tiles = plate 6 + underlay 16 + the required tier's visible crop at a tier boundary (<= 70) + the previous tier's
  // tiles (LRU), so crossing a boundary and back does not evict and re-decode (render.ts sharpPlan marginBudget).
  return memory !== undefined && memory >= 8 ? { ...profile, decodedBudgetBytes: Math.max(profile.decodedBudgetBytes, RICH_DECODED_BUDGET) } : profile;
}
