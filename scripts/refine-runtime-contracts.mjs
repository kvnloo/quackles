#!/usr/bin/env node
/** RFC-002 spike contracts: the off-main-thread refinement runtime (issue #45).
 * Run: node --import ./scripts/register-ts-resolve.mjs scripts/refine-runtime-contracts.mjs
 * Pure logic only (no browser): the feature gate, the double-buffered TileSurface, the Worker core (decode + compositing +
 * frame-aligned publication), the main-thread RemoteSurface proxy and the FrameCache decoder hook. The browser behaviour is
 * measured by gigapixel-feel-browser.mjs / touch-feel-browser.mjs with REFINE=main|worker. */
import assert from "node:assert/strict";
import * as render from "../lib/sequence/render.ts";
import * as surfaceModule from "../lib/sequence/tile-surface.ts";
import * as modeModule from "../lib/sequence/refine-mode.ts";
import * as coreModule from "../lib/sequence/refine-core.ts";
import * as remoteModule from "../lib/sequence/remote-surface.ts";
import { FrameCache } from "../lib/sequence/cache.ts";
import { PREVIEWS } from "../lib/preview.ts";

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log("PASS", name); };
const W = 412, H = 618, DPR = 3.5;
const v12 = { width: 12910, height: 19365, tiles: { tileSize: 512, overlap: 1, columns: 26, rows: 38, urlTemplate: "/quackles-assets/white/p0000000/gp/1/{x}_{y}.webp" } };
const cov = (z, fx = 0.5, fy = 0.5) => render.fittedBuffer(W, H, render.inspectionCrop(z, fx, fy), DPR, 4096, 0.15);
const stampsFor = (crop, bitmap = (t) => ({ id: `${t.x},${t.y}` })) => render.tileAssets(v12, crop, 0).map((t) => ({ key: t.asset.url, bitmap: bitmap(t), variantWidth: v12.width, variantHeight: v12.height, sourceX: t.sourceX, sourceY: t.sourceY, width: t.asset.width, height: t.asset.height }));

// Fake 2D canvases that record every call, tagged with the canvas they were made on.
const fakeCanvas = (name, log = []) => {
  const canvas = { name, width: 1, height: 1, style: {}, dataset: {}, className: "" };
  const ctx = { globalCompositeOperation: "source-over", imageSmoothingEnabled: true, imageSmoothingQuality: "low",
    save() { log.push([name, "save"]); }, restore() { log.push([name, "restore"]); this.globalCompositeOperation = "source-over"; },
    clearRect(...a) { log.push([name, "clear", ...a]); },
    drawImage(src, ...a) { log.push([name, "draw", src?.name ?? src?.id, this.globalCompositeOperation, ...a]); } };
  canvas.getContext = () => ctx;
  return canvas;
};

// ---- feature gate ---------------------------------------------------------------------------------------------------
const caps = { offscreen: true, worker: true };
await test("gate: production never takes the worker path, whatever the URL says", () => {
  assert.equal(modeModule.refineMode(PREVIEWS.production, "", caps), "main");
  assert.equal(modeModule.refineMode(PREVIEWS.production, "?refine=worker", caps), "main");
});
await test("gate: gigapixel-single defaults to the worker; ?refine=main is the in-process A/B control", () => {
  assert.equal(PREVIEWS["gigapixel-single"].refine, "worker");
  assert.equal(modeModule.refineMode(PREVIEWS["gigapixel-single"], "", caps), "worker");
  assert.equal(modeModule.refineMode(PREVIEWS["gigapixel-single"], "?refine=main", caps), "main");
  assert.equal(modeModule.refineMode({ ...PREVIEWS["gigapixel-single"], refine: "main" }, "?refine=worker", caps), "worker");
});
await test("gate: no OffscreenCanvas / no Worker -> main-thread fallback; multi-scene previews (crossfade path) stay on main", () => {
  assert.equal(modeModule.refineMode(PREVIEWS["gigapixel-single"], "", { offscreen: false, worker: true }), "main");
  assert.equal(modeModule.refineMode(PREVIEWS["gigapixel-single"], "", { offscreen: true, worker: false }), "main");
  assert.equal(modeModule.refineMode({ ...PREVIEWS["scenes-gigapixel"], refine: "worker" }, "", caps), "main");
});
await test("gate: tile URLs (pyramid x_y) decode off-thread; plates and the egg do not", () => {
  assert.equal(modeModule.isTileUrl("/quackles-assets/white/p0000000/gp/1/3_4.webp"), true);
  assert.equal(modeModule.isTileUrl("https://cdn.x/quackles/white/p0000000/gp/0/12_40.webp?v=2"), true);
  assert.equal(modeModule.isTileUrl("/preview-scene/sequence/cinematic-proof-v2/white/p0000000-1024.webp"), false);
  assert.equal(modeModule.isTileUrl("/preview-scene/sequence/hidden/night-moss.png"), false);
});

// ---- double-buffered TileSurface ------------------------------------------------------------------------------------
await test("surface: with a swap hook, a move paints the BACK buffer (copy of the front) and never touches the shown front", () => {
  const log = [], a = fakeCanvas("A", log), b = fakeCanvas("B", log);
  let shown = a;
  const s = new surfaceModule.TileSurface(a, { place: () => {}, swap: (current) => (current === shown ? (current === a ? b : a) : current) });
  const c1 = cov(7.4), backing = render.detailBackingSize(W, H, c1, DPR);
  s.place(W, H, c1, backing); s.setQueue(stampsFor(c1)); s.drain(Infinity);
  const first = s.canvas; assert.equal(first, b, "first placement goes to the back buffer");
  shown = first; log.length = 0; // the main thread flipped to B
  const c2 = { ...c1, x: c1.x + c1.width * 0.3 };
  s.place(W, H, c2, render.detailBackingSize(W, H, c2, DPR));
  assert.equal(s.canvas, a, "the move lands in the other buffer");
  assert.ok(log.every(([name]) => name === "A"), `front B untouched: ${JSON.stringify(log.filter(([x]) => x !== "A"))}`);
  const copy = log.find((c) => c[1] === "draw");
  assert.ok(copy && copy[2] === "B" && copy[3] === "copy", "front pixels copied into the back with composite copy");
  for (const [x0, , x1] of s.rects()) assert.ok(x0 >= c2.x - 1e-9 && x1 <= c2.x + c2.width + 1e-9, "rects clipped to the new coverage");
});
await test("surface: without a swap hook the surface keeps its single-canvas self-copy (main-thread path unchanged)", () => {
  const log = [], a = fakeCanvas("A", log), s = new surfaceModule.TileSurface(a);
  const c1 = cov(7.4); s.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR)); s.setQueue(stampsFor(c1)); s.drain(Infinity);
  log.length = 0; s.place(W, H, { ...c1, x: c1.x + 0.01 }, render.detailBackingSize(W, H, c1, DPR));
  assert.ok(log.find((c) => c[1] === "draw" && c[2] === "A" && c[3] === "copy"), "self-copy");
  assert.equal(s.canvas, a);
  assert.ok(a.style.transform, "placeDetail still applied on the main thread");
});

// ---- Worker core ----------------------------------------------------------------------------------------------------
const makeCore = () => {
  const posted = [], frames = [], log = [], closed = [];
  const decodes = new Map();
  const env = {
    post: (m) => posted.push(m),
    decode: (blob) => new Promise((resolve, reject) => decodes.set(blob.key, { resolve, reject })),
    requestFrame: (cb) => frames.push(cb),
    now: () => 0,
  };
  const core = new coreModule.RefineCore(env);
  const layers = { detail: [fakeCanvas("d0", log), fakeCanvas("d1", log)], underlay: [fakeCanvas("u0", log), fakeCanvas("u1", log)], floor: [fakeCanvas("f0", log), fakeCanvas("f1", log)] };
  core.handle({ t: "init", layers });
  const frame = () => { const run = frames.splice(0); run.forEach((cb) => cb()); };
  const bitmap = (key) => ({ key, width: 512, height: 512, close() { closed.push(key); } });
  return { core, posted, frame, log, decodes, closed, bitmap, layers };
};
const tick = () => new Promise((r) => setTimeout(r, 0));
await test("core: a decode cancelled before it finishes is dropped IN the worker (closed, never stored, reported stale)", async () => {
  const { core, posted, decodes, closed, bitmap } = makeCore();
  core.handle({ t: "decode", key: "k1", job: 1, blob: { key: "k1" } });
  core.handle({ t: "cancel", key: "k1", job: 1 });
  decodes.get("k1").resolve(bitmap("k1")); await tick();
  assert.deepEqual(closed, ["k1"]); assert.equal(core.has("k1"), false);
  assert.deepEqual(posted.map((m) => [m.t, m.job]), [["stale", 1]]);
  assert.equal(core.stats().staleDrops, 1);
});
await test("core: a finished decode is kept and reported with its size; a close for an older job never closes the newer bitmap", async () => {
  const { core, posted, decodes, closed, bitmap } = makeCore();
  core.handle({ t: "decode", key: "k", job: 1, blob: { key: "k" } }); decodes.get("k").resolve(bitmap("k")); await tick();
  assert.deepEqual(posted.at(-1), { t: "decoded", key: "k", job: 1, width: 512, height: 512 });
  core.handle({ t: "close", key: "k", job: 1 }); assert.deepEqual(closed, ["k"]); assert.equal(core.has("k"), false);
  core.handle({ t: "decode", key: "k", job: 2, blob: { key: "k" } }); decodes.get("k").resolve(bitmap("k")); await tick();
  core.handle({ t: "close", key: "k", job: 1 }); assert.equal(core.has("k"), true, "stale close ignored");
});
const decodeAll = async (ctx, stamps) => {
  stamps.forEach((st, i) => ctx.core.handle({ t: "decode", key: st.key, job: 100 + i, blob: { key: st.key } }));
  stamps.forEach((st) => ctx.decodes.get(st.key).resolve(ctx.bitmap(st.key))); await tick();
};
const wire = (stamps) => stamps.map(({ bitmap, ...rest }) => rest);
await test("core: publication is frame-aligned: draws happen in a frame, the publish is posted on the NEXT frame (after the commit)", async () => {
  const ctx = makeCore(), c1 = cov(7.4), stamps = stampsFor(c1);
  await decodeAll(ctx, stamps); ctx.posted.length = 0;
  ctx.core.handle({ t: "place", layer: "detail", gen: 1, coverage: c1, backing: render.detailBackingSize(W, H, c1, DPR) });
  ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(stamps) });
  assert.equal(ctx.log.length, 0, "nothing drawn inside the message task");
  ctx.frame();
  assert.ok(ctx.log.some(([name, op]) => name === "d1" && op === "draw"), "tiles drawn into the back buffer d1");
  assert.ok(!ctx.log.some(([name]) => name === "d0"), "shown buffer d0 untouched");
  assert.equal(ctx.posted.length, 0, "no publish in the drawing frame");
  ctx.frame();
  const pub = ctx.posted.find((m) => m.t === "publish");
  assert.ok(pub && pub.layer === "detail" && pub.gen === 1 && pub.flip === true && pub.front === 1, JSON.stringify(pub && { ...pub, rects: pub.rects.length }));
  assert.equal(pub.rects.length, stamps.length); assert.deepEqual(pub.coverage, c1);
});
await test("core: until the main thread acks a flip, later moves wait (the shown buffer is never drawn into); after the ack they use the other buffer", async () => {
  const ctx = makeCore(), c1 = cov(7.4), c2 = { ...c1, x: c1.x + c1.width * 0.25 }, s1 = stampsFor(c1), s2 = stampsFor(c2);
  await decodeAll(ctx, [...s1, ...s2.filter((s) => !s1.some((t) => t.key === s.key))]);
  const backing = render.detailBackingSize(W, H, c1, DPR);
  ctx.core.handle({ t: "place", layer: "detail", gen: 1, coverage: c1, backing }); ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(s1) });
  ctx.frame(); ctx.frame(); // drawn into d1, flip published
  ctx.log.length = 0;
  ctx.core.handle({ t: "place", layer: "detail", gen: 2, coverage: c2, backing }); ctx.core.handle({ t: "queue", layer: "detail", gen: 2, stamps: wire(s2) });
  ctx.frame(); ctx.frame();
  assert.equal(ctx.log.length, 0, "held while the flip is unacknowledged");
  ctx.core.handle({ t: "ack", layer: "detail", shown: 1 });
  ctx.frame();
  assert.ok(ctx.log.length > 0 && ctx.log.every(([name]) => name === "d0"), `after the ack the move paints d0 only: ${[...new Set(ctx.log.map(([x]) => x))]}`);
  ctx.frame();
  const pub = ctx.posted.filter((m) => m.t === "publish").at(-1);
  assert.equal(pub.gen, 2); assert.equal(pub.front, 0); assert.equal(pub.flip, true);
});
await test("core: tiles drawn at an unchanged placement go straight to the shown buffer (no flip) and still publish a frame later", async () => {
  const ctx = makeCore(), c1 = cov(7.4), s1 = stampsFor(c1), half = Math.floor(s1.length / 2);
  await decodeAll(ctx, s1);
  ctx.core.handle({ t: "place", layer: "detail", gen: 1, coverage: c1, backing: render.detailBackingSize(W, H, c1, DPR) });
  ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(s1.slice(0, half)) });
  ctx.frame(); ctx.frame(); ctx.core.handle({ t: "ack", layer: "detail", shown: 1 }); ctx.log.length = 0; ctx.posted.length = 0;
  ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(s1) });
  ctx.frame();
  assert.ok(ctx.log.length && ctx.log.every(([name, op]) => name === "d1" && op !== "clear"), "drawn into the shown buffer d1, nothing cleared");
  ctx.frame();
  const pub = ctx.posted.find((m) => m.t === "publish"); assert.equal(pub.flip, false); assert.equal(pub.rects.length, s1.length);
});
await test("core: a queue from an older generation is dropped (stale work never reaches pixels)", async () => {
  const ctx = makeCore(), c1 = cov(7.4), s1 = stampsFor(c1);
  await decodeAll(ctx, s1);
  ctx.core.handle({ t: "place", layer: "detail", gen: 3, coverage: c1, backing: render.detailBackingSize(W, H, c1, DPR) });
  ctx.core.handle({ t: "queue", layer: "detail", gen: 2, stamps: wire(s1) });
  ctx.frame();
  assert.ok(!ctx.log.some(([, op]) => op === "draw"), "no tile drawn"); assert.equal(ctx.core.stats().staleQueues, 1);
});
await test("core: a tile whose bitmap was closed before its turn is skipped, not drawn", async () => {
  const ctx = makeCore(), c1 = cov(7.4), s1 = stampsFor(c1).slice(0, 2);
  await decodeAll(ctx, s1); ctx.core.handle({ t: "close", key: s1[0].key, job: 100 });
  ctx.core.handle({ t: "place", layer: "detail", gen: 1, coverage: c1, backing: render.detailBackingSize(W, H, c1, DPR) });
  ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(s1) });
  ctx.frame(); ctx.frame();
  assert.equal(ctx.posted.find((m) => m.t === "publish").rects.length, 1);
});

await test("core: a stats request is answered with the worker's counters (bitmaps held, stale drops, stale queues)", async () => {
  const ctx = makeCore();
  ctx.core.handle({ t: "decode", key: "a", job: 1, blob: { key: "a" } }); ctx.decodes.get("a").resolve(ctx.bitmap("a")); await tick();
  ctx.core.handle({ t: "stats", id: 7 });
  const reply = ctx.posted.find((m) => m.t === "stats");
  assert.ok(reply && reply.id === 7 && reply.stats.bitmaps === 1 && reply.stats.staleDrops === 0 && Array.isArray(reply.keys) && reply.keys[0] === "a", JSON.stringify(reply));
});

// ---- main-thread proxy ----------------------------------------------------------------------------------------------
const makeRemote = () => {
  const sent = [], placed = [], els = [fakeCanvas("d0"), fakeCanvas("d1")];
  const r = new remoteModule.RemoteSurface("detail", els, ["sequence-detail", "sequence-detail-back"], (m) => sent.push(m), (el, w, h, c) => placed.push([el.name, c]));
  return { r, sent, placed, els };
};
await test("proxy: place/queue post generation-tagged messages without bitmaps; drain hands the queue off at once", () => {
  const { r, sent } = makeRemote(), c1 = cov(7.4);
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR));
  r.setQueue(stampsFor(c1)); assert.equal(r.pending, stampsFor(c1).length);
  assert.equal(r.drain(0), stampsFor(c1).length); assert.equal(r.pending, 0);
  assert.deepEqual(sent.map((m) => [m.t, m.gen]), [["place", 1], ["queue", 1]]);
  assert.ok(sent[1].stamps.every((s) => !("bitmap" in s)), "bitmaps stay in the worker");
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR)); assert.equal(sent.length, 2, "same placement: no message");
});
await test("proxy: a flip publish swaps placement, class and visibility of BOTH buffers in one call and acks the shown buffer", () => {
  const { r, sent, placed, els } = makeRemote(), c1 = cov(7.4);
  r.setVisible(true);
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR));
  assert.deepEqual(r.rects(), [], "nothing claimed before the worker publishes");
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [["k", [0.4, 0.4, 0.5, 0.5, 9000]]] });
  assert.deepEqual(placed.at(-1), ["d1", c1]);
  assert.equal(els[1].className, "sequence-detail"); assert.equal(els[0].className, "sequence-detail-back");
  assert.equal(els[1].style.visibility, "visible"); assert.equal(els[0].style.visibility, "hidden");
  assert.deepEqual(sent.at(-1), { t: "ack", layer: "detail", shown: 1 });
  assert.deepEqual(r.rects(), [[0.4, 0.4, 0.5, 0.5, 9000]]); assert.equal(r.has("k"), true);
  assert.equal(r.front(), els[1]);
});
await test("proxy: a publish from an older generation changes nothing on screen (still acked, with the buffer actually shown)", () => {
  const { r, sent, placed, els } = makeRemote(), c1 = cov(7.4), c2 = cov(9.1);
  r.setVisible(true);
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR)); r.place(W, H, c2, render.detailBackingSize(W, H, c2, DPR));
  const before = placed.length;
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [["k", [0, 0, 1, 1, 1]]] });
  assert.equal(placed.length, before); assert.equal(els[1].style.visibility, undefined); assert.deepEqual(r.rects(), []);
  assert.deepEqual(sent.at(-1), { t: "ack", layer: "detail", shown: 0 });
});
await test("proxy: clear drops claims at once and bumps the generation", () => {
  const { r, sent } = makeRemote(), c1 = cov(7.4);
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR));
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [["k", [0, 0, 1, 1, 1]]] });
  r.clear(); assert.deepEqual(r.rects(), []); assert.equal(r.coverage, null);
  assert.deepEqual(sent.at(-1), { t: "clear", layer: "detail", gen: 2 });
});

await test("proxy (verifier #1): after clear, setVisible(true) keeps both buffers hidden until a flip of the new generation lands, then reveals once", () => {
  const sent = [], els = [fakeCanvas("d0"), fakeCanvas("d1")], reveals = [];
  const r = new remoteModule.RemoteSurface("detail", els, ["sequence-detail", "sequence-detail-back"], (m) => sent.push(m), () => {}, () => {}, () => reveals.push(1));
  const c1 = cov(7.4), c2 = cov(9.1);
  r.setVisible(true); r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR));
  assert.equal(els[0].style.visibility, "hidden", "nothing published yet: hidden");
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [["k", [0.4, 0.4, 0.5, 0.5, 9000]]] });
  assert.equal(els[1].style.visibility, "visible"); assert.equal(reveals.length, 1);
  r.clear(); assert.equal(els[1].style.visibility, "hidden", "clear hides the old pixels at once");
  r.place(W, H, c2, render.detailBackingSize(W, H, c2, DPR)); r.setVisible(true);
  assert.ok(els.every((e) => e.style.visibility !== "visible"), "old front stays hidden while the new content is in flight");
  r.receive({ t: "publish", layer: "detail", gen: 3, front: 0, flip: true, coverage: c2, rects: [["k2", [0.4, 0.4, 0.5, 0.5, 9000]]] });
  assert.equal(els[0].style.visibility, "visible"); assert.equal(els[1].style.visibility, "hidden"); assert.equal(reveals.length, 2);
});
await test("proxy (verifier round 2): a clear-only flip (no coverage) does not un-blank or reveal; the first real content does", () => {
  const sent = [], els = [fakeCanvas("d0"), fakeCanvas("d1")], reveals = [];
  const r = new remoteModule.RemoteSurface("detail", els, ["sequence-detail", "sequence-detail-back"], (m) => sent.push(m), () => {}, () => {}, () => reveals.push(1));
  const c1 = cov(7.4);
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR)); r.clear(); // gen 2
  r.receive({ t: "publish", layer: "detail", gen: 2, front: 1, flip: true, coverage: null, rects: [] });
  r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR)); r.setVisible(true); // gen 3
  assert.ok(els.every((e) => e.style.visibility !== "visible"), "empty layer stays hidden"); assert.equal(reveals.length, 0);
  r.receive({ t: "publish", layer: "detail", gen: 3, front: 0, flip: true, coverage: c1, rects: [["k", [0.4, 0.4, 0.5, 0.5, 9000]]] });
  assert.equal(els[0].style.visibility, "visible"); assert.equal(reveals.length, 1, "the dissolve plays on real content");
});
await test("proxy: a placement flip with no tiles yet keeps the layer blank; the first publish WITH tiles (no flip) reveals it", () => {
  const sent = [], els = [fakeCanvas("d0"), fakeCanvas("d1")], reveals = [];
  const r = new remoteModule.RemoteSurface("detail", els, ["sequence-detail", "sequence-detail-back"], (m) => sent.push(m), () => {}, () => {}, () => reveals.push(1));
  const c1 = cov(7.4);
  r.setVisible(true); r.place(W, H, c1, render.detailBackingSize(W, H, c1, DPR));
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [] });
  assert.equal(els[1].style.visibility, "hidden", "placed but empty: hidden");
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: false, coverage: c1, rects: [["k", [0.4, 0.4, 0.5, 0.5, 9000]]] });
  assert.equal(els[1].style.visibility, "visible"); assert.equal(reveals.length, 1);
});
await test("proxy (verifier #3): a reset publish (context lost) drops claims, hides the layer and forces a re-place", () => {
  const { r, sent, els } = makeRemote(), c1 = cov(7.4), backing = render.detailBackingSize(W, H, c1, DPR);
  r.setVisible(true); r.place(W, H, c1, backing);
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: true, coverage: c1, rects: [["k", [0, 0, 1, 1, 1]]] });
  r.receive({ t: "publish", layer: "detail", gen: 1, front: 1, flip: false, coverage: null, rects: [], reset: true });
  assert.deepEqual(r.rects(), []); assert.equal(r.coverage, null); assert.equal(els[1].style.visibility, "hidden");
  const n = sent.length; r.place(W, H, c1, backing); assert.equal(sent.length, n + 1, "same placement is re-sent after a reset");
});
await test("core (verifier #3): a restored context resets the layer: painted claims dropped, a reset publish follows", async () => {
  const ctx = makeCore(), c1 = cov(7.4), s1 = stampsFor(c1);
  await decodeAll(ctx, s1);
  ctx.core.handle({ t: "place", layer: "detail", gen: 1, coverage: c1, backing: render.detailBackingSize(W, H, c1, DPR) });
  ctx.core.handle({ t: "queue", layer: "detail", gen: 1, stamps: wire(s1) });
  ctx.frame(); ctx.frame(); ctx.core.handle({ t: "ack", layer: "detail", shown: 1 }); ctx.posted.length = 0;
  ctx.core.contextRestored("detail");
  ctx.frame(); ctx.frame();
  const pub = ctx.posted.find((m) => m.t === "publish");
  assert.ok(pub && pub.reset === true && pub.rects.length === 0, JSON.stringify(pub));
});
// ---- FrameCache decoder hook ----------------------------------------------------------------------------------------
globalThis.window = globalThis;
globalThis.fetch = async (url) => ({ ok: true, status: 200, blob: async () => ({ url, size: 10 }) });
let localDecodes = 0;
globalThis.createImageBitmap = async () => { localDecodes++; return { width: 512, height: 512, close() {} }; };
await test("cache: a decoder hook takes the decode (no main-thread createImageBitmap); a cancel mid-decode is a stale drop, not a failure", async () => {
  const seen = []; let release;
  const decoder = (asset, blob, signal) => modeModule.isTileUrl(asset.url) ? new Promise((resolve, reject) => {
    seen.push(asset.url);
    signal.addEventListener("abort", () => reject(new DOMException("superseded", "AbortError")));
    release = () => resolve({ width: 512, height: 512, close() {} });
  }) : undefined;
  const cache = new FrameCache("hook", { decodedBudgetBytes: 64 * 1024 * 1024, maxActiveJobs: 2, decoder });
  const tile = { url: "/q/gp/1/2_3.webp", width: 512, height: 512 };
  const p = cache.load(tile, 90); await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(seen, [tile.url]); assert.equal(localDecodes, 0);
  release(); await p; assert.ok(cache.peek(tile.url));
  const other = { url: "/q/gp/1/4_4.webp", width: 512, height: 512 };
  const q = cache.load(other, 90); await new Promise((r) => setTimeout(r, 10));
  cache.retain([tile.url]);
  await assert.rejects(q, (e) => e.name === "AbortError");
  assert.equal(cache.stats().failures, 0); assert.equal(cache.stats().staleDiscard, 1);
  const plate = { url: "/x/p0000000-1024.webp", width: 512, height: 512 };
  await cache.load(plate, 100); assert.equal(localDecodes, 1, "plates still decode locally");
  cache.dispose();
});

await test("cache (verifier #2): forget() drops decoded entries matching a predicate so they are requested again", async () => {
  const cache = new FrameCache("forget", { decodedBudgetBytes: 64 * 1024 * 1024 });
  const a = { url: "/q/gp/1/0_0.webp", width: 512, height: 512 }, b = { url: "/x/p0000000-1024.webp", width: 512, height: 512 };
  await cache.load(a); await cache.load(b);
  assert.equal(cache.forget((url) => url.includes("/gp/")), 1);
  assert.equal(cache.peek(a.url), undefined); assert.ok(cache.peek(b.url));
  cache.dispose();
});
console.log(`${n} refine-runtime contracts passed`);
