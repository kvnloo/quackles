// Single-writer seam between the cinematic driver (driveRig from a Pose) and
// native physics snapshots. OfficialDuck is the only code that writes the rig;
// it reads `authority` each frame and applies exactly one of the two sources.
import type { Pose } from "@/lib/pose";

export type SimSnapshot = {
  /** MJCF metres, Z up (trunk_base free joint). */
  position: ArrayLike<number>;
  /** WXYZ. */
  quaternion: ArrayLike<number>;
  /** JOINT_NAMES order, radians. */
  joints: ArrayLike<number>;
  time: number;
};

export type SimSeed = {
  position: number[];
  quaternion: number[];
  /** Joint angles read back from the rendered rig (JOINT_NAMES order). */
  joints: number[];
  /** Lowest sole point in the rig root (MJCF) frame, metres. */
  soleMinZ: number;
  /** Placer height of the rendered cinematic pose. */
  placerY: number;
  /** Trunk world position of the rendered cinematic pose (three.js metres). */
  trunkWorld: [number, number, number];
};

type Bridge = {
  authority: "cinematic" | "native";
  snapshot: SimSnapshot | null;
  seed: SimSeed | null;
  /** Drive the rig to `pose` right now and read the rendered state back. */
  captureSeed: ((pose: Pose) => SimSeed | null) | null;
  /** Apply the current native snapshot to the rig immediately (seeding). */
  applyNow: (() => void) | null;
  /** Trunk world position of the last applied frame. */
  trunkWorld: (() => [number, number, number] | null) | null;
  /** Map an MJCF-frame point (or direction) through the rig root to world. */
  mjcfToWorld: ((v: ArrayLike<number>, direction?: boolean) => [number, number, number] | null) | null;
  /** Hide everything but the robot (parity/silhouette measurement only). */
  robotOnly: ((enabled: boolean) => void) | null;
  /** World-space trunk distance between the cinematic frame and the first native frame, mm. */
  seedWorldJumpMm: number | null;
  appliedFrames: number;
};

export const liveBridge: Bridge = {
  authority: "cinematic",
  snapshot: null,
  seed: null,
  captureSeed: null,
  applyNow: null,
  trunkWorld: null,
  mjcfToWorld: null,
  robotOnly: null,
  seedWorldJumpMm: null,
  appliedFrames: 0,
};
