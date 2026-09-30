#!/usr/bin/env node
/** Gigapixel engine contracts (pure functions; the browser behaviour is measured by gigapixel-feel-browser.mjs).
 * Run: node --import ./scripts/register-ts-resolve.mjs scripts/gigapixel-engine-contracts.mjs
 * Pyramid: the White 1GP hero of gigapixel-single (1614..25820 px wide, 512 px tiles), phone 412x618 CSS frame at DPR 3.5. */
import assert from "node:assert/strict";
import fs from "node:fs";
import * as render from "../lib/sequence/render.ts";
import * as surfaceModule from "../lib/sequence/tile-surface.ts";
import { FrameCache } from "../lib/sequence/cache.ts";

const { inspectionCrop, tileAssets } = render;
const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const white = raw.frames.find((f) => f.id === "p0000000").assets.white.slice().sort((a, b) => a.width - b.width);
const tiers = white.filter((v) => v.tiles);
const PLATE = white.find((v) => !v.tiles).width;
const W = 412, H = 618, DPR = 3.5, MIB = 1024 * 1024;
const need = (z) => Math.ceil(W * DPR * z);
const planTier = (z) => tiers.find((v) => v.width >= need(z)) ?? tiers[tiers.length - 1];
const bytes = (tasks) => tasks.reduce((s, t) => s + t.asset.width * t.asset.height * 4, 0);
const ZOOMS = [1.2, 2, 2.3, 3, 4.4, 4.6, 5.4, 7.4, 8.9, 9.1, 12, 14.7, 17.9];
const FOCI = [[0.5, 0.5], [0.37, 0.41], [0.52, 0.63], [0.13, 0.77], [0, 0], [1, 1]];
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const inside = (inner, outer, eps = 1e-9) => inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.width <= outer.x + outer.width + eps && inner.y + inner.height <= outer.y + outer.height + eps;

test("(1) underlay: about two tiers below the detail tier, never the detail tier itself, never the plate", () => {
  assert.equal(typeof render.underlayPlan, "function", "render.underlayPlan missing");
  for (const z of ZOOMS) for (const [fx, fy] of FOCI) {
    const crop = inspectionCrop(z, fx, fy), plan = planTier(z), u = render.underlayPlan(white, plan.width, crop, PLATE);
    const below = tiers.filter((v) => v.width < plan.width);
    if (!below.length) { assert.equal(u, null, `z${z}: no tiled tier below ${plan.width}`); continue; }
    assert.ok(u, `z${z} (${fx},${fy}): underlay expected below ${plan.width}`);
    assert.ok(u.variant.width < plan.width && u.variant.width > PLATE, `z${z}: underlay ${u.variant.width}`);
    const rank = tiers.indexOf(plan) - tiers.indexOf(u.variant);
    assert.ok(rank >= Math.min(2, below.length) && rank <= 3, `z${z}: underlay ${rank} tiers below`);
  }
});
test("(1) underlay covers about 2x the viewport (clamped at the image edge) and contains the visible crop", () => {
  for (const z of ZOOMS) for (const [fx, fy] of FOCI) {
    const crop = inspectionCrop(z, fx, fy), u = render.underlayPlan(white, planTier(z).width, crop, PLATE);
    if (!u) continue;
    assert.ok(inside(crop, u.coverage), `z${z}: crop outside the underlay coverage`);
    const wantW = Math.min(1, crop.width * 2), wantH = Math.min(1, crop.height * 2);
    assert.ok(Math.abs(u.coverage.width - wantW) < 1e-9 && Math.abs(u.coverage.height - wantH) < 1e-9, `z${z}: coverage ${u.coverage.width.toFixed(3)} vs ${wantW.toFixed(3)}`);
    assert.deepEqual(u.tasks.map((t) => t.asset.url).sort(), tileAssets(u.variant, u.coverage, 0).map((t) => t.asset.url).sort(), "tasks = the coverage tiles");
  }
});
test("(1) underlay stays small: <= 20 tiles and <= 16 MiB decoded at every zoom", () => {
  for (const z of ZOOMS) for (const [fx, fy] of FOCI) {
    const u = render.underlayPlan(white, planTier(z).width, inspectionCrop(z, fx, fy), PLATE);
    if (!u) continue;
    assert.ok(u.tasks.length <= 20, `z${z}: ${u.tasks.length} tiles`);
    assert.ok(bytes(u.tasks) <= 16 * MIB, `z${z}: ${(bytes(u.tasks) / MIB).toFixed(1)} MiB`);
  }
});
test("(1) underlay honours a smaller byte cap by dropping a tier (constrained devices)", () => {
  const crop = inspectionCrop(9.1, 0.5, 0.5), u = render.underlayPlan(white, 25820, crop, PLATE, 8 * MIB);
  assert.ok(u && bytes(u.tasks) <= 8 * MIB, u ? `${(bytes(u.tasks) / MIB).toFixed(1)} MiB` : "null");
});

// ---- TileSurface: incremental tile painter (fake 2D context records the draws) -------------------------------------
const fakeCanvas = () => {
  const calls = [];
  const ctx = { calls, globalCompositeOperation: "source-over", globalAlpha: 1, imageSmoothingEnabled: true, imageSmoothingQuality: "low",
    save() { calls.push(["save"]); }, restore() { calls.push(["restore"]); this.globalCompositeOperation = "source-over"; },
    clearRect(...a) { calls.push(["clear", ...a]); },
    drawImage(src, ...a) { calls.push(["draw", src === canvas ? "self" : src.id, this.globalCompositeOperation, ...a]); } };
  const canvas = { width: 1, height: 1, style: {}, dataset: {}, getContext: () => ctx };
  return { canvas, ctx, calls };
};
const v12 = tiers.find((v) => v.width === 12910);
const stampsFor = (variant, crop) => tileAssets(variant, crop, 0).map((t) => ({ key: t.asset.url, bitmap: { id: `${t.x},${t.y}` }, variantWidth: variant.width, variantHeight: variant.height, sourceX: t.sourceX, sourceY: t.sourceY, width: t.asset.width, height: t.asset.height }));
test("surface: TileSurface drains its queue in order inside a time budget, at least one tile per call", () => {
  const { TileSurface } = surfaceModule; assert.equal(typeof TileSurface, "function", "TileSurface missing");
  const { canvas, calls } = fakeCanvas(), s = new TileSurface(canvas);
  const crop = inspectionCrop(7.4, 0.5, 0.5), cov = render.fittedBuffer(W, H, crop, DPR, 4096, 0.15), backing = render.detailBackingSize(W, H, cov, DPR);
  s.place(W, H, cov, backing);
  const stamps = stampsFor(v12, cov); s.setQueue(stamps);
  let clock = 0; const now = () => clock;
  const drawnFirst = s.drain(0, () => { clock += 5; return clock; }); // deadline already past: exactly one draw
  assert.equal(drawnFirst, 1);
  clock = 0; const drawn = s.drain(12, () => { clock += 5; return clock; });
  assert.ok(drawn >= 2 && drawn <= 3, `drew ${drawn} inside a 12 ms budget at 5 ms/tile`);
  assert.deepEqual(calls.filter((c) => c[0] === "draw").map((c) => c[1]), stamps.slice(0, 1 + drawn).map((st) => st.bitmap.id), "queue order kept");
  assert.equal(s.pending, stamps.length - 1 - drawn);
  void now;
});
test("surface: TileSurface reports painted rects in source space with their effective resolution", () => {
  const { canvas } = fakeCanvas(), s = new surfaceModule.TileSurface(canvas);
  const crop = inspectionCrop(7.4, 0.5, 0.5), cov = render.fittedBuffer(W, H, crop, DPR, 4096, 0.15), backing = render.detailBackingSize(W, H, cov, DPR);
  s.place(W, H, cov, backing); const stamps = stampsFor(v12, cov); s.setQueue(stamps); s.drain(Infinity);
  const rects = s.rects(); assert.equal(rects.length, stamps.length);
  const density = backing.width / cov.width;
  for (const [x0, y0, x1, y1, res] of rects) { assert.ok(x1 > x0 && y1 > y0); assert.ok(Math.abs(res - Math.min(12910, density)) < 1e-6, `res ${res}`); }
  assert.equal(s.pending, 0);
  s.setQueue(stamps); assert.equal(s.pending, 0, "already painted at full resolution: nothing re-queued");
});
test("surface: moving a surface keeps its pixels (self-copy with composite copy) and keeps/clips its rects; no reallocation", () => {
  const { canvas, calls } = fakeCanvas(), s = new surfaceModule.TileSurface(canvas);
  const a = render.fittedBuffer(W, H, inspectionCrop(7.4, 0.5, 0.5), DPR, 4096, 0.15), backing = render.detailBackingSize(W, H, a, DPR);
  s.place(W, H, a, backing); s.setQueue(stampsFor(v12, a)); s.drain(Infinity);
  const allocs = { w: canvas.width, h: canvas.height };
  const b = { ...a, x: a.x + a.width * 0.3 };
  s.place(W, H, b, render.detailBackingSize(W, H, b, DPR));
  assert.deepEqual({ w: canvas.width, h: canvas.height }, allocs, "same backing size: no realloc");
  const copy = calls.find((c) => c[0] === "draw" && c[1] === "self");
  assert.ok(copy, "old pixels copied to their new place"); assert.equal(copy[2], "copy", "copy composite clears what moved out");
  const rects = s.rects(); assert.ok(rects.length > 0);
  for (const [x0, , x1] of rects) assert.ok(x0 >= b.x - 1e-9 && x1 <= b.x + b.width + 1e-9, "rects clipped to the new coverage");
  s.setQueue(stampsFor(v12, b)); assert.ok(s.pending > 0 && s.pending < stampsFor(v12, b).length, "only the newly exposed tiles are queued");
});
test("surface: zooming a surface in keeps the copied pixels but marks them at their old (lower) resolution", () => {
  const { canvas } = fakeCanvas(), s = new surfaceModule.TileSurface(canvas);
  const a = render.fittedBuffer(W, H, inspectionCrop(5.4, 0.5, 0.5), DPR, 4096, 0.15);
  s.place(W, H, a, render.detailBackingSize(W, H, a, DPR)); s.setQueue(stampsFor(v12, a)); s.drain(Infinity);
  const b = render.fittedBuffer(W, H, inspectionCrop(8, 0.5, 0.5), DPR, 4096, 0.15), bb = render.detailBackingSize(W, H, b, DPR);
  s.place(W, H, b, bb);
  const old = Math.ceil(W * DPR * 5.4);
  for (const r of s.rects()) assert.ok(r[4] <= old + 2, `copied content claims ${r[4]} > painted density ${old}`);
  s.setQueue(stampsFor(v12, b)); assert.equal(s.pending, stampsFor(v12, b).length, "every tile redrawn at the new density");
});
test("surface: a different backing size reallocates and forgets what was painted", () => {
  const { canvas } = fakeCanvas(), s = new surfaceModule.TileSurface(canvas);
  const a = render.fittedBuffer(W, H, inspectionCrop(7.4, 0.5, 0.5), DPR, 4096, 0.15);
  s.place(W, H, a, render.detailBackingSize(W, H, a, DPR)); s.setQueue(stampsFor(v12, a)); s.drain(Infinity);
  const b = inspectionCrop(7.4, 0.5, 0.5); s.place(W, H, b, render.detailBackingSize(W, H, b, DPR));
  assert.equal(s.rects().length, 0);
});

// ---- (2) centre-first order and request priorities ---------------------------------------------------------------
test("(2) centre-first: every visible tile before any margin tile, visible tiles by distance from the crop centre", () => {
  assert.equal(typeof render.centreFirst, "function", "render.centreFirst missing");
  for (const z of [5.4, 7.4, 12, 17.9]) for (const [fx, fy] of FOCI) {
    const crop = inspectionCrop(z, fx, fy), plan = render.sharpPlan(white, need(z), crop, 200 * MIB, W, H, DPR, 0);
    const order = render.centreFirst(plan.tasks, plan.variant, crop);
    assert.equal(order.length, plan.tasks.length);
    const firstMargin = order.findIndex((e) => !e.visible), lastVisible = order.map((e) => e.visible).lastIndexOf(true);
    assert.ok(firstMargin < 0 || firstMargin > lastVisible, `z${z}: a margin tile precedes a visible one`);
    const visible = order.filter((e) => e.visible);
    const cx = (crop.x + crop.width / 2) * plan.variant.width, cy = (crop.y + crop.height / 2) * plan.variant.height;
    const dist = (t) => Math.hypot(t.sourceX + t.asset.width / 2 - cx, t.sourceY + t.asset.height / 2 - cy);
    for (let i = 1; i < visible.length; i++) assert.ok(dist(visible[i].task) >= dist(visible[i - 1].task) - 1e-6, `z${z}: not centre-first`);
    const t0 = visible[0].task;
    assert.ok(t0.sourceX <= cx && cx <= t0.sourceX + t0.asset.width && t0.sourceY <= cy && cy <= t0.sourceY + t0.asset.height, `z${z}: first tile misses the centre`);
    for (const e of order) {
      const t = e.task, overlaps = t.sourceX < (crop.x + crop.width) * plan.variant.width && t.sourceX + t.asset.width > crop.x * plan.variant.width && t.sourceY < (crop.y + crop.height) * plan.variant.height && t.sourceY + t.asset.height > crop.y * plan.variant.height;
      assert.equal(e.visible, overlaps, "visible = overlaps the crop");
    }
  }
});
test("(2) request priorities follow the paint order: visible detail > underlay (88) > margin detail > floor (60)", () => {
  assert.equal(typeof render.tilePriority, "function", "render.tilePriority missing");
  const crop = inspectionCrop(7.4, 0.4, 0.6), plan = render.sharpPlan(white, need(7.4), crop, 200 * MIB, W, H, DPR, 0);
  const order = render.centreFirst(plan.tasks, plan.variant, crop), p = order.map((e, i) => render.tilePriority(e, i));
  for (let i = 1; i < p.length; i++) assert.ok(p[i] < p[i - 1], "strictly decreasing");
  order.forEach((e, i) => assert.ok(e.visible ? p[i] > 88 && p[i] < 100 : p[i] < 88 && p[i] > 60, `${e.visible} ${p[i]}`));
});

// ---- (3) fetch / decode split -------------------------------------------------------------------------------------
// Node stand-ins: no Cache API (window without caches), fetch and createImageBitmap recorded.
const net = { fetches: [], decodes: [], hold: false, pending: [] };
globalThis.window = globalThis;
globalThis.fetch = (url, init = {}) => new Promise((resolve, reject) => {
  net.fetches.push(url);
  const done = () => resolve({ ok: true, status: 200, blob: async () => ({ url, size: 10 }) });
  init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  if (net.hold) net.pending.push(done); else setTimeout(done, 1);
});
globalThis.createImageBitmap = async (blob) => { net.decodes.push(blob.url); return { width: 512, height: 512, close() {} }; };
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const asset = (i) => ({ url: `https://t/${i}.webp`, width: 512, height: 512 });
const atest = async (name, fn) => { await fn(); n++; console.log("PASS", name); };
const reset = () => { net.fetches = []; net.decodes = []; net.hold = false; net.pending = []; };
await atest("(3) paused (camera moving): tiles still fetch, none decodes; resume decodes them without refetching", async () => {
  reset(); const cache = new FrameCache("t", { decodedBudgetBytes: 64 * MIB, maxActiveJobs: 2 });
  cache.setPaused(true);
  const loads = [0, 1, 2].map((i) => cache.load(asset(i), 90 - i));
  await tick(20);
  assert.equal(net.fetches.length, 3, "fetch while paused");
  assert.equal(net.decodes.length, 0, "no createImageBitmap while paused");
  assert.equal(cache.stats().startedDecodes, 0, "no decode START while paused");
  cache.setPaused(false);
  await Promise.all(loads);
  assert.equal(net.decodes.length, 3); assert.equal(net.fetches.length, 3, "decoded from the fetched blob");
  assert.deepEqual(net.decodes, [0, 1, 2].map((i) => asset(i).url), "decode order = priority order");
});
await atest("(3) fetches are bounded while paused (maxActiveJobs in flight: the legacy caps) and follow priority", async () => {
  reset(); net.hold = true; const cache = new FrameCache("t", { decodedBudgetBytes: 64 * MIB, maxActiveJobs: 3 });
  cache.setPaused(true);
  for (let i = 0; i < 10; i++) cache.load(asset(i), i).catch(() => {});
  await tick(10);
  assert.equal(net.fetches.length, 3); assert.deepEqual(net.fetches, [9, 8, 7].map((i) => asset(i).url));
  cache.dispose();
});
await atest("(3) a tile no plan wants any more is dropped whether fetching or fetched", async () => {
  reset(); const cache = new FrameCache("t", { decodedBudgetBytes: 64 * MIB, maxActiveJobs: 2 });
  cache.setPaused(true);
  const a = cache.load(asset(0), 90), b = cache.load(asset(1), 90);
  await tick(20);
  cache.retain([asset(1).url]);
  await assert.rejects(a, (e) => e.name === "AbortError");
  cache.setPaused(false); await b;
  assert.deepEqual(net.decodes, [asset(1).url]);
});
test("(3) landing prefetch: while the camera moves, tiles are planned at where it will land (coast target), not where it is", () => {
  assert.equal(typeof render.prefetchCrop, "function", "render.prefetchCrop missing");
  const coast = { cameraMoving: true, zoom: 7.4, focusX: 0.2, focusY: 0.3, targetZoom: 7.4, targetFocusX: 0.8, targetFocusY: 0.35 };
  assert.deepEqual(render.prefetchCrop(coast), inspectionCrop(7.4, 0.8, 0.35));
  assert.equal(render.prefetchCrop({ ...coast, cameraMoving: false }), null, "at rest the normal plan is the landing");
  assert.deepEqual(render.prefetchCrop({ ...coast, targetZoom: 3, zoom: 5 }), inspectionCrop(3, 0.8, 0.35), "zooming out: the landing zoom");
});
console.log(`${n} passed`);
