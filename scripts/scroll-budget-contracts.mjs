#!/usr/bin/env node
/** I5 ("laggy/stutter while scrolling the story") root-cause guards, from process/ISSUES.md:
 *  G1 the phone ("balanced") profile decodes at most 2 plates at once (44b112a had raised it to 6);
 *  G2 the story canvas backing store is capped at 2 device px per CSS px (the cap from 3fa1942 was lost);
 *  G3 the frame preload window scales with frame spacing: it was sized for 16 frames, and the story now has 52.
 * Run with --import ./scripts/register-ts-resolve.mjs. Node only; behaviour in a browser: story-fling-browser.mjs. */
import assert from "node:assert/strict";
import fs from "node:fs";

let n = 0; const failed = [];
const test = async (name, fn) => { try { await fn(); n++; console.log("PASS", name); } catch (e) { failed.push(name); console.log("FAIL", name, "\n   ", e.message.split("\n")[0]); } };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

await test("G1: a coarse-pointer phone gets the balanced profile with <= 2 concurrent decodes", async () => {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { hardwareConcurrency: 8, deviceMemory: 8, connection: { effectiveType: "4g" } } });
  globalThis.matchMedia = (q) => ({ matches: q === "(pointer: coarse)" });
  const { sequencePerfProfile } = await import("../lib/sequence/perf-profile.ts");
  const profile = sequencePerfProfile();
  assert.equal(profile.id, "balanced");
  assert.ok(profile.maxActiveJobs <= 2, `balanced maxActiveJobs ${profile.maxActiveJobs} > 2`);
});

const { paintBase } = await import("../lib/sequence/render.ts");
const plate = (width = 1024, height = 1536) => ({ key: "k", asset: { url: "u", width, height }, bitmap: {}, bytes: width * height * 4, touched: 0 });
const canvas = () => ({ width: 1, height: 1, getContext: () => ({ drawImage() {}, globalAlpha: 1 }) });
const backing = (dpr, cssWidth, width = 1024) => {
  globalThis.devicePixelRatio = dpr; const c = canvas();
  paintBase(c, [plate(width, width * 1.5)], undefined, 0, 0, cssWidth);
  return c;
};

await test("G2: story canvas backing <= 2 px per CSS px on the owner's phone (DPR 3.5, 411 CSS px)", () => {
  const c = backing(3.5, 411);
  assert.ok(c.width <= 2 * 411, `backing ${c.width} px for 411 CSS px (${(c.width / 411).toFixed(3)} px/CSS px)`);
  assert.equal(c.height, Math.round(c.width * 1.5), "aspect kept");
});
await test("G2: verifier phone profile (DPR 2.625, 412 CSS px) is capped too", () => {
  const c = backing(2.625, 412);
  assert.ok(c.width <= 2 * 412, `backing ${c.width} px for 412 CSS px`);
});
await test("G2: the cap never upsamples past the plate and leaves DPR <= 2 screens unchanged", () => {
  assert.equal(backing(2, 412).width, 824);
  assert.equal(backing(1, 1440).width, 1024, "desktop: plate width");
  assert.equal(backing(1.5, 400).width, 600);
});

const { preloadFrames } = await import("../lib/sequence/manifest.ts");
const manifest = JSON.parse(read("public/preview-scene/sequence/manifest.json")); // frames[].progress is all the window reads
const DESIGN = 1 / 15; // the [1,-1,2,3] window was sized for 16 frames, ~1/15 of the story apart

await test("G3: preloadFrames exists and keeps [1,-1,2,3] on 16-frame spacing", () => {
  assert.equal(typeof preloadFrames, "function", "lib/sequence/manifest.ts must export preloadFrames(frames, center)");
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ id: `f${i}`, progress: i / 15 }));
  for (let c = 0; c < 16; c++) {
    const want = [1, -1, 2, 3].map((o) => c + o).filter((i) => i >= 0 && i < 16);
    assert.deepEqual(preloadFrames(sixteen, c), want, `center ${c}`);
  }
});
await test(`G3: on the ${manifest.frames.length}-frame story the window looks as far ahead as the 16-frame one, with no more plates`, () => {
  assert.ok(manifest.frames.length >= 52, `expected the dense story, got ${manifest.frames.length} frames`);
  const frames = manifest.frames, last = frames.length - 1;
  for (let c = 0; c < frames.length; c++) {
    const at = frames[c].progress, picks = preloadFrames(frames, c);
    assert.ok(picks.length <= 4, `center ${c}: ${picks.length} plates (> 4: the decoded budget holds ~10 plates)`);
    assert.ok(picks.every((i) => Number.isInteger(i) && i >= 0 && i <= last && i !== c), `center ${c}: bad indices ${picks}`);
    const ahead = Math.max(at, ...picks.map((i) => frames[i].progress)) - at;
    const wantAhead = Math.min(frames[last].progress - at, 3 * DESIGN);
    assert.ok(ahead >= wantAhead - 1e-6, `center ${c} (p=${at}): reaches ${ahead.toFixed(3)} ahead, want >= ${wantAhead.toFixed(3)} (3 frames of the 16-frame story)`);
    if (c > 0) assert.ok(picks.includes(c - 1), `center ${c}: the previous frame must stay in the window`);
    if (c + 1 <= last) assert.ok(picks.includes(c + 1), `center ${c}: the next frame (slow scroll) must stay in the window`);
  }
});
await test("G3: the player uses preloadFrames (no fixed [1, -1, 2, 3] offsets left)", () => {
  const player = read("components/sequence/SequencePlayer.tsx");
  assert.ok(player.includes("preloadFrames("), "SequencePlayer must call preloadFrames");
  assert.ok(!/for \(const offset of \[1, -1, 2, 3\]\)/.test(player), "fixed 16-frame window still in SequencePlayer");
});
console.log(`${n} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
