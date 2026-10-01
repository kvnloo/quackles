import type { Crop } from "./render";
import type { PaintedRect } from "./tile-surface";

/** RFC-002 spike (#45): messages between the main thread and the refinement Worker. */
export type LayerId = "detail" | "underlay" | "floor";
export const LAYERS: LayerId[] = ["detail", "underlay", "floor"];
/** A tile to draw, minus its bitmap (the bitmap lives in the Worker, keyed by URL). */
export type WireStamp = { key: string; variantWidth: number; variantHeight: number; sourceX: number; sourceY: number; width: number; height: number };
export type Backing = { width: number; height: number };

export type ToWorker<C = OffscreenCanvas> =
  | { t: "init"; layers: Record<LayerId, [C, C]> }
  /** Decode job `job` for `key`. Jobs are generation tags: a cancelled job's bitmap is dropped in the Worker. */
  | { t: "decode"; key: string; job: number; blob: Blob }
  | { t: "cancel"; key: string; job: number }
  /** Release the bitmap of `key`, only if it still belongs to `job` (an older close never frees a newer decode). */
  | { t: "close"; key: string; job: number }
  | { t: "place"; layer: LayerId; gen: number; coverage: Crop; backing: Backing }
  | { t: "queue"; layer: LayerId; gen: number; stamps: WireStamp[] }
  | { t: "clear"; layer: LayerId; gen: number }
  /** The main thread handled a flip publish; `shown` is the buffer it really shows (a stale flip is not applied). */
  | { t: "ack"; layer: LayerId; shown: 0 | 1 };

export type FromWorker =
  | { t: "decoded"; key: string; job: number; width: number; height: number }
  | { t: "stale"; key: string; job: number }
  | { t: "decodeFailed"; key: string; job: number; message: string }
  /**
   * Posted one frame AFTER the pixels it describes were drawn (so they are committed). `flip`: the content is in buffer
   * `front`, not the one on screen: the main thread places that buffer at `coverage` and swaps in one task.
   */
  | { t: "publish"; layer: LayerId; gen: number; front: 0 | 1; flip: boolean; coverage: Crop | null; rects: [string, PaintedRect][] };
