#!/usr/bin/env node
/** I5 ("laggy/stutter while scrolling the story") root-cause guards, from process/ISSUES.md:
 *  G1 the phone ("balanced") profile decodes at most 2 plates at once (44b112a had raised it to 6). A regression guard:
 *     247fd44 already had 2, so this passes on the code before the I5 fix too;
 *  G2 the story canvas backing store is capped at 2 device px per CSS px WHILE THE STORY MOVES (the cap from 3fa1942 was
 *     lost); at rest it keeps the native plate (min(plate, CSS px x DPR)), so a resting plate is never resampled softer;
 *  G3 the frame preload window fits the decoded budget on the 52-frame story: a straight scroll decodes each frame once
 *     (a look-ahead plate that is evicted before the scroll reaches it is decoded twice), it looks ahead in the direction
 *     of travel, and the neighbour-theme plates (two extra decodes per frame crossed) wait until the story rests.
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

const { paintBase, baseScale } = await import("../lib/sequence/render.ts");
const plate = (width = 1024, height = 1536) => ({ key: "k", asset: { url: "u", width, height }, bitmap: {}, bytes: width * height * 4, touched: 0 });
const canvas = () => ({ width: 1, height: 1, getContext: () => ({ drawImage() {}, globalAlpha: 1 }) });
const backing = (dpr, cssWidth, moving, width = 1024) => {
  globalThis.devicePixelRatio = dpr; const c = canvas();
  assert.equal(typeof baseScale, "function", "lib/sequence/render.ts must export baseScale(dpr, moving)");
  paintBase(c, [plate(width, width * 1.5)], undefined, 0, 0, cssWidth, baseScale(dpr, moving));
  return c;
};

await test("G2: while the story moves, backing <= 2 px per CSS px on the owner's phone (DPR 3.5, 411 CSS px)", () => {
  const c = backing(3.5, 411, true);
  assert.ok(c.width <= 2 * 411, `backing ${c.width} px for 411 CSS px (${(c.width / 411).toFixed(3)} px/CSS px)`);
  assert.equal(c.height, Math.round(c.width * 1.5), "aspect kept");
});
await test("G2: while the story moves, the verifier phone profile (DPR 2.625, 412 CSS px) is capped too", () => {
  const c = backing(2.625, 412, true);
  assert.ok(c.width <= 2 * 412, `backing ${c.width} px for 412 CSS px`);
});
await test("G2: at rest the story keeps the native plate (no resample below 1024 on a DPR 3.5 / 2.625 phone)", () => {
  assert.equal(backing(3.5, 411, false).width, 1024, "owner phone at rest");
  assert.equal(backing(2.625, 412, false).width, 1024, "verifier phone at rest");
});
await test("G2: the cap never upsamples past the plate and leaves DPR <= 2 screens unchanged (moving or not)", () => {
  for (const moving of [true, false]) {
    assert.equal(backing(2, 412, moving).width, 824);
    assert.equal(backing(1, 1440, moving).width, 1024, "desktop: plate width");
    assert.equal(backing(1.5, 400, moving).width, 600);
  }
});

const { storyPreloads } = await import("../lib/sequence/manifest.ts");
const manifest = JSON.parse(read("public/preview-scene/sequence/manifest.json")); // frames[].progress is all the window reads
const frames = manifest.frames;
const plates = (list) => list.filter((task) => task.theme === 0).map((task) => task.index);

await test("G3: storyPreloads keeps the [1,-1,2,3] window on 16-frame spacing, mirrored when scrolling up", () => {
  assert.equal(typeof storyPreloads, "function", "lib/sequence/manifest.ts must export storyPreloads(frames, center, direction, settled, theme)");
  const sixteen = Array.from({ length: 16 }, (_, i) => ({ id: `f${i}`, progress: i / 15 }));
  for (let c = 0; c < 16; c++) {
    const want = (d) => [1, -1, 2, 3].map((o) => c + o * d).filter((i) => i >= 0 && i < 16);
    assert.deepEqual(plates(storyPreloads(sixteen, c, 1, false, 0)), want(1), `center ${c} down`);
    assert.deepEqual(plates(storyPreloads(sixteen, c, -1, false, 0)), want(-1), `center ${c} up`);
  }
});
await test("G3: neighbour-theme plates only once the story rests (none while it moves)", () => {
  const moving = storyPreloads(frames, 20, 1, false, 2), rest = storyPreloads(frames, 20, 1, true, 2);
  assert.deepEqual(moving.filter((t) => t.theme !== 2), [], "moving: no other-theme plate");
  assert.deepEqual(rest.filter((t) => t.theme !== 2).map((t) => [t.index, t.theme]).sort(), [[20, 1], [20, 3]], "rest: both neighbour themes of the frame shown");
  assert.deepEqual(storyPreloads(frames, 20, 1, true, 0).filter((t) => t.theme !== 0).map((t) => t.theme), [1], "first theme: one neighbour");
  assert.ok(rest.every((t) => t.theme === 2 || t.priority > Math.max(...rest.filter((u) => u.theme === 2).map((u) => u.priority))), "neighbour themes outrank look-ahead at rest");
});

// A straight scroll through the dense story with the REAL FrameCache (balanced: 64 MiB, 2 jobs; fetch/decode stubbed and
// every decode completing between renders, the best case for look-ahead), replaying the player's per-render requests
// while moving. A look-ahead plate the budget cannot keep until the scroll arrives is decoded twice.
async function straightScroll(direction) {
  const urls = [];
  globalThis.window = globalThis;
  globalThis.fetch = async (url) => ({ ok: true, blob: async () => ({ url: String(url) }) });
  globalThis.createImageBitmap = async (blob) => { urls.push(blob.url); return { width: 1024, height: 1536, close() {} }; };
  const { FrameCache } = await import("../lib/sequence/cache.ts");
  const { spanAt } = await import("../lib/sequence/manifest.ts");
  const cache = new FrameCache("g3", { decodedBudgetBytes: 64 * 1024 * 1024, maxActiveJobs: 2 });
  const asset = (i) => ({ url: `f${i}`, width: 1024, height: 1536 });
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const order = frames.map((_, i) => (direction > 0 ? i : frames.length - 1 - i));
  for (const c of order) for (const step of [0, 0.5]) {
    const next = frames[c + direction] ?? frames[c];
    const span = spanAt(manifest, frames[c].progress + step * (next.progress - frames[c].progress), false);
    const center = frames.indexOf(span.before), visible = [...new Set([center, frames.indexOf(span.after)])];
    const tasks = [...visible.map((i) => ({ i, priority: 100 })), ...plates(storyPreloads(frames, center, direction, false, 0)).map((i, rank) => ({ i, priority: 19 - rank }))];
    cache.pin(visible.map((i) => asset(i).url)); cache.retain(tasks.map((t) => asset(t.i).url));
    for (const t of tasks) if (!cache.peek(asset(t.i).url)) cache.load(asset(t.i), t.priority).catch(() => {});
    for (let k = 0; k < 20; k++) await tick();
    for (const i of visible) cache.peek(asset(i).url);
  }
  return urls;
}
for (const [name, direction] of [["down", 1], ["up", -1]]) {
  await test(`G3: a straight scroll ${name} the ${frames.length}-frame story decodes each frame once (look-ahead fits the budget)`, async () => {
    assert.ok(frames.length >= 52, `expected the dense story, got ${frames.length} frames`);
    const urls = await straightScroll(direction), twice = urls.filter((u, i) => urls.indexOf(u) !== i);
    assert.ok(urls.length <= frames.length, `${urls.length} decodes for ${frames.length} frames; decoded twice: ${[...new Set(twice)].join(" ")}`);
  });
}
await test("G3: the player takes its story preloads from storyPreloads (no fixed offset window left)", () => {
  const player = read("components/sequence/SequencePlayer.tsx").replace(/\/\/.*$/gm, "");
  assert.ok(/storyPreloads\(manifest\.frames,/.test(player), "SequencePlayer must call storyPreloads(manifest.frames, ...)");
  assert.ok(!/const offset of \[\s*1\s*,\s*-1/.test(player) && !/THEME_IDS\[selected \+ offset\]/.test(player), "a fixed frame or theme offset window is still in SequencePlayer");
});
console.log(`${n} passed, ${failed.length} failed`);
if (failed.length) process.exit(1);
