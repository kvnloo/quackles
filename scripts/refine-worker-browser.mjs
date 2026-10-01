#!/usr/bin/env node
/** RFC-002 spike (#45) browser e2e for the off-main-thread refinement runtime (Chromium emulation, not device evidence).
 *  Phone 412x915 @3.5, host GPU raster, tiles from the local 1GP clone with 40-90 ms latency.
 *  E1 stale-job close: a decode aborted right after it is posted is rejected (AbortError) and dropped IN the worker (worker
 *     staleDrops +1, bitmap not held); a normal decode is held until its handle is closed.
 *  E2 generation drop: a queue posted with an old generation is counted stale by the worker and draws/publishes nothing;
 *     after a burst of 30 retargets every frame's detail rects lie inside the shown placement.
 *  E3 atomic swap: every animation frame during a retarget burst + pans, the visible detail buffer is the one named by the
 *     last APPLIED flip and sits at that flip's placement (it never changes before the worker's publish is applied); and
 *     where the published rects cover the canvas centre, the centre pixel is opaque (no hole / half-painted frame).
 *  E4 fallback: with OffscreenCanvas / transferControlToOffscreen removed, the player runs the main-thread path and paints.
 *  E5 worker crash: an uncaught error in the Worker replaces it (new buffers); no decode stays stuck, and the next zoom paints.
 *  MODES=worker,main (E2's burst and E3's hole check also run on ?refine=main as the control). OUT_DIR, PORT, ASSETS. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45991";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const MODES = (process.env.MODES || "worker,main").split(",");
const GPU_ARGS = process.env.GPU === "0" ? [] : ["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"];
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1200));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", ...GPU_ARGS] });
const bad = [], out = {};
const TILE = "/quackles-assets/white/p0000000/gp/4/0_0.webp";

async function open(query, init) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("crash", () => errors.push("Target crashed"));
  await page.route("**/quackles-assets/**", async (route) => {
    const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 50));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" }).catch(() => {});
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp" }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${port}/${query}`);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  return { ctx, page, errors };
}
const settle = (page, ms = 6000) => page.waitForFunction(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return !s.inspection.cameraMoving && s.detailWidth > 0 && s.cache.queued === 0 && s.cache.inflight === 0; }, null, { timeout: ms, polling: 100 }).catch(() => {});

// Per-frame recorder: shown detail buffer vs the last applied flip, misplaced rects, centre-pixel holes.
function recorder() {
  const R = window.__QUACKLES_REFINE__ || null, F = window.__e2e = { frames: 0, flipMismatch: [], misplaced: 0, holes: 0, holeChecks: 0, stop: false };
  const probe = document.createElement("canvas"); probe.width = 1; probe.height = 1; const px = probe.getContext("2d", { willReadFrequently: true });
  const loop = () => {
    if (F.stop) return;
    F.frames++;
    const el = document.querySelector(".sequence-detail"), paint = window.__QUACKLES_PAINT__;
    const shown = el && getComputedStyle(el).visibility === "visible";
    if (R) {
      const last = R.debug.flips.filter((f) => f.layer === "detail").at(-1);
      const index = R.elements.detail.indexOf(el);
      if (last && (index !== last.front || (el.dataset.crop ?? "") !== last.crop) && F.flipMismatch.length < 20) F.flipMismatch.push({ frame: F.frames, index, front: last.front, crop: el.dataset.crop, flipCrop: last.crop });
    }
    if (shown && el.dataset.crop && paint?.detail.rects.length) {
      const [x, y, w, h] = el.dataset.crop.split(",").map(Number), e = 1e-6, cx = x + w / 2, cy = y + h / 2;
      if (paint.detail.rects.some((q) => q[0] < x - e || q[1] < y - e || q[2] > x + w + e || q[3] > y + h + e)) F.misplaced++;
      if (paint.detail.rects.some((q) => cx > q[0] + w * 0.01 && cx < q[2] - w * 0.01 && cy > q[1] + h * 0.01 && cy < q[3] - h * 0.01) && el.width > 2) {
        px.clearRect(0, 0, 1, 1); px.drawImage(el, Math.floor(el.width / 2), Math.floor(el.height / 2), 1, 1, 0, 0, 1, 1);
        F.holeChecks++; if (px.getImageData(0, 0, 1, 1).data[3] < 250) F.holes++;
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
async function burst(page) {
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.45, 0.4)); await settle(page);
  await page.evaluate(recorder);
  for (let i = 0; i < 30; i++) {
    const z = 5 + (i % 4), fx = 0.35 + ((i * 7) % 10) / 40, fy = 0.3 + ((i * 3) % 10) / 30;
    await page.evaluate(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, fx, fy]);
    await page.waitForTimeout(i % 5 === 4 ? 400 : 20);
  }
  await settle(page, 10000); await page.waitForTimeout(500);
  return page.evaluate(() => { window.__e2e.stop = true; const s = window.__QUACKLES_SEQUENCE__.getState(); return { ...window.__e2e, detailWidth: s.detailWidth, refine: s.refine, errors: s.errors.length }; });
}

const log = (...a) => console.error(new Date().toISOString().slice(11, 19), ...a);
for (const mode of MODES) {
  log("mode", mode);
  const { ctx, page, errors } = await open(`?refine=${mode}`);
  const res = out[mode] = { mode: await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().refine?.mode) };
  if (res.mode !== mode) bad.push(`${mode}: player reports refine mode ${res.mode}`);
  if (mode === "worker") {
    // E1
    res.e1 = await page.evaluate(async (tile) => {
      const R = window.__QUACKLES_REFINE__, before = (await R.debug.workerStats()).stats;
      const blob = await (await fetch(tile)).blob(), asset = { url: `${tile}?e2e-stale`, width: 1, height: 1 };
      const ac = new AbortController(), p = R.decoder(asset, blob, ac.signal); ac.abort();
      let error = null; try { await p; } catch (e) { error = e.name; }
      // Rejected at once on abort; the Worker drops the bitmap when its decode finishes: wait for its job count to drain.
      let mid = await R.debug.workerStats();
      for (let i = 0; i < 40 && mid.stats.jobs; i++) { await new Promise((r) => setTimeout(r, 50)); mid = await R.debug.workerStats(); }
      const kept = await R.decoder({ url: `${tile}?e2e-kept`, width: 1, height: 1 }, blob, new AbortController().signal);
      const held = (await R.debug.workerStats()).keys.includes(`${tile}?e2e-kept`);
      kept.close(); const afterClose = (await R.debug.workerStats()).keys.includes(`${tile}?e2e-kept`);
      return { error, staleDrops: mid.stats.staleDrops - before.staleDrops, staleHeld: mid.keys.includes(`${tile}?e2e-stale`), keptHeld: held, heldAfterClose: afterClose };
    }, TILE);
    const e1 = res.e1;
    if (e1.error !== "AbortError" || e1.staleDrops !== 1 || e1.staleHeld) bad.push(`E1 stale decode not dropped in the worker: ${JSON.stringify(e1)}`);
    if (!e1.keptHeld || e1.heldAfterClose) bad.push(`E1 normal decode lifecycle wrong: ${JSON.stringify(e1)}`);
    // E2a: an old-generation queue draws nothing.
    res.e2a = await page.evaluate(async () => {
      const R = window.__QUACKLES_REFINE__, before = (await R.debug.workerStats()).stats, flips = R.debug.flips.length, published = R.stats().publishes;
      R.debug.post({ t: "queue", layer: "detail", gen: -1, stamps: [{ key: "x", variantWidth: 1, variantHeight: 1, sourceX: 0, sourceY: 0, width: 1, height: 1 }] });
      await new Promise((r) => setTimeout(r, 150));
      const after = (await R.debug.workerStats()).stats;
      return { staleQueues: after.staleQueues - before.staleQueues, drawn: after.drawn - before.drawn, flips: R.debug.flips.length - flips, publishes: R.stats().publishes - published };
    });
    if (res.e2a.staleQueues !== 1 || res.e2a.drawn !== 0 || res.e2a.publishes !== 0) bad.push(`E2 old-generation queue not dropped: ${JSON.stringify(res.e2a)}`);
  }
  log("burst", mode);
  // E2b + E3: retarget burst.
  const b = res.burst = await burst(page);
  if (b.misplaced) bad.push(`${mode}: ${b.misplaced} frames with detail rects outside the shown placement`);
  if (b.holes) bad.push(`${mode}: ${b.holes}/${b.holeChecks} frames with a hole at the centre of published detail`);
  if (b.flipMismatch.length) bad.push(`${mode}: shown buffer differs from the last applied flip: ${JSON.stringify(b.flipMismatch.slice(0, 3))}`);
  if (!b.detailWidth) bad.push(`${mode}: no detail after the burst`);
  if (errors.length || b.errors) bad.push(`${mode}: errors ${JSON.stringify(errors.slice(0, 3))} / ${b.errors}`);
  await ctx.close();
}
// E5 crash recovery (worker only).
if (MODES.includes("worker")) {
  log("E5");
  const { ctx, page, errors } = await open("?refine=worker");
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.45, 0.4)); await settle(page);
  await page.evaluate(() => { window.__QUACKLES_INSPECTION__.setTarget(7.5, 0.5, 0.45); window.__QUACKLES_REFINE__.debug.post({ t: "crash" }); });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6.5, 0.4, 0.5)); await settle(page, 12000); await page.waitForTimeout(500);
  const e5 = out.crash = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(), d = document.querySelector(".sequence-detail");
    return { refine: s.refine, detailWidth: s.detailWidth, rects: window.__QUACKLES_PAINT__.detail.rects.length, visible: getComputedStyle(d).visibility, inflight: s.cache.inflight, queued: s.cache.queued, detailEls: document.querySelectorAll(".sequence-detail").length, canvases: document.querySelectorAll(".sequence-camera canvas").length }; });
  if (e5.refine.restarts !== 1 || e5.refine.dead || !e5.rects || e5.visible !== "visible" || e5.inflight || e5.detailEls !== 1 || e5.canvases !== 10 || errors.length) bad.push(`E5 crash recovery: ${JSON.stringify(e5)} ${errors.slice(0, 2)}`);
  await ctx.close();
}
// E4 fallback.
{
  log("E4");
  const { ctx, page, errors } = await open("?refine=worker", () => { delete window.OffscreenCanvas; delete HTMLCanvasElement.prototype.transferControlToOffscreen; });
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.45, 0.4)); await settle(page, 10000);
  const e4 = out.fallback = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { mode: s.refine?.mode, detailWidth: s.detailWidth, rects: window.__QUACKLES_PAINT__.detail.rects.length, detailEls: document.querySelectorAll(".sequence-detail").length, hook: !!window.__QUACKLES_REFINE__, offscreen: typeof OffscreenCanvas }; });
  if (e4.mode !== "main" || !e4.detailWidth || !e4.rects || e4.detailEls !== 1 || e4.hook || errors.length) bad.push(`E4 fallback: ${JSON.stringify(e4)} errors ${errors.slice(0, 2)}`);
  await ctx.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.kill();
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
console.log("PASS refine-worker e2e");
