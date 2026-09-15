import { clamp01 } from "@/lib/pose";

/** Scroll window where the studio duck hands off to Try Micro Duck. */
export const MORPH_START = 0.76;
export const MORPH_END = 0.9;
export const PRELOAD_AT = 0.52;

export function playMorph(progress: number) {
  return clamp01((progress - MORPH_START) / (MORPH_END - MORPH_START));
}

export const TRY_MICRODUCK = "https://trymicroduck.com/?boot=1#play";
export const TRY_MICRODUCK_HOME = "https://trymicroduck.com/";
