export type SequencePerfProfileId =
  | "constrained"
  | "balanced"
  | "full";

export type SequencePerfProfile = {
  id: SequencePerfProfileId;
  decodedBudgetBytes: number;
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

const PROFILES: Record<SequencePerfProfileId, SequencePerfProfile> = {
  constrained: {
    id: "constrained",
    decodedBudgetBytes: 40 * MIB,
    compressedBudgetBytes: 64 * MIB,
    maxActiveJobs: 2,
    maxZoomCap: 2.5,
    tileOverscan: 0,
    viewfinderBackingWidth: 80,
  },
  balanced: {
    id: "balanced",
    decodedBudgetBytes: 64 * MIB,
    compressedBudgetBytes: 96 * MIB,
    maxActiveJobs: 6,
    maxZoomCap: 24,
    tileOverscan: 0,
    viewfinderBackingWidth: 96,
  },
  full: {
    id: "full",
    decodedBudgetBytes: 96 * MIB,
    compressedBudgetBytes: 128 * MIB,
    maxActiveJobs: 3,
    maxZoomCap: 24,
    tileOverscan: 1,
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

  return balanced ? PROFILES.balanced : PROFILES.full;
}
