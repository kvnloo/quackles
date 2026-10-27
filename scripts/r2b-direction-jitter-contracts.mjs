#!/usr/bin/env node
/** R2 blind review probe. Claim: storyPreloads' direction flips on any progress reversal (the player sets direction from
 * the sign of the last progress delta, no hysteresis), so a slow downward drag with 1-render micro-reversals (finger
 * jitter / settle wobble) aborts or discards in-flight look-ahead decodes and decodes plates more than once.
 * Harness: the real FrameCache (64 MiB, 2 jobs), decodes that take ~2 renders, the player's per-render request replay.
 * Pass: jittered down-drag decodes no more plates than the same drag without jitter. */
import assert from "node:assert/strict";
import fs from "node:fs";
const manifest = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url), "utf8"));
const frames = manifest.frames;
globalThis.window = globalThis;
globalThis.fetch = async (url) => ({ ok: true, blob: async () => ({ url: String(url) }) });
let decodes = [];
globalThis.createImageBitmap = async (blob) => { await new Promise((r) => setTimeout(r, 6)); decodes.push(blob.url); return { width: 1024, height: 1536, close() {} }; };
const { FrameCache } = await import("../lib/sequence/cache.ts");
const { spanAt, storyPreloads } = await import("../lib/sequence/manifest.ts");
async function drag(jitter) {
  decodes = [];
  const cache = new FrameCache("j" + jitter, { decodedBudgetBytes: 64 * 1024 * 1024, maxActiveJobs: 2 });
  const asset = (i) => ({ url: `f${i}`, width: 1024, height: 1536 });
  let last = 0, direction = 1, progress = 0;
  const steps = 600;
  for (let k = 0; k <= steps; k++) {
    progress = k / steps;
    if (jitter && k % 5 === 4) progress -= 0.0005; // one render 0.05% back, then forward again
    if (progress !== last) { direction = progress > last ? 1 : -1; last = progress; }
    const span = spanAt(manifest, progress, false);
    const center = frames.indexOf(span.before), visible = [...new Set([center, frames.indexOf(span.after)])];
    const tasks = [...visible.map((i) => ({ i, priority: 100 })), ...storyPreloads(frames, center, direction, false, 0).map((t) => ({ i: t.index, priority: t.priority }))];
    cache.pin(visible.map((i) => asset(i).url)); cache.retain(tasks.map((t) => asset(t.i).url));
    for (const t of tasks) if (!cache.peek(asset(t.i).url)) cache.load(asset(t.i), t.priority).catch(() => {});
    await new Promise((r) => setTimeout(r, 4)); // one render at ~4 ms of decode progress
  }
  await new Promise((r) => setTimeout(r, 100));
  return { decodes: decodes.length, stale: cache.stats().staleDiscard, unique: new Set(decodes).size };
}
const clean = await drag(false), jittered = await drag(true);
console.log(JSON.stringify({ frames: frames.length, clean, jittered }));
try { assert.ok(jittered.decodes <= clean.decodes, `jittered drag ${jittered.decodes} decodes (${jittered.stale} discarded) vs ${clean.decodes} without jitter`); console.log("PASS"); }
catch (e) { console.log("FAIL", e.message); process.exit(1); }
