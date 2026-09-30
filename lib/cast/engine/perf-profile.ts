// Cast builds only: next.config.ts routes the engine's `@/lib/sequence/perf-profile` import here.
// Receiver (TV) profile: Chromecast-class hardware has little memory and a weak CPU/GPU, and its tier cap is
// enforced in ./tier-probe. Every other page gets the unchanged phone/desktop policy.
import { sequencePerfProfile as sitePerfProfile, type SequencePerfProfile, type SequencePerfProfileId } from "../../sequence/perf-profile";
import { isReceiverPath } from "../config";

export type { SequencePerfProfile, SequencePerfProfileId };

const MIB = 1024 * 1024;
export const RECEIVER_PROFILE = {
  id: "receiver",
  decodedBudgetBytes: 48 * MIB, // plates for this frame + neighbours (~6 MiB each at 1024x1536) + one viewport of tiles
  compressedBudgetBytes: 48 * MIB,
  maxActiveJobs: 2,
  maxZoomCap: 24, // the phone decides the zoom; the TV only follows
  tileOverscan: 0,
  viewfinderBackingWidth: 80,
} as const;

export function sequencePerfProfile(): SequencePerfProfile {
  if (typeof location !== "undefined" && isReceiverPath(location.pathname)) return RECEIVER_PROFILE as unknown as SequencePerfProfile;
  return sitePerfProfile();
}
