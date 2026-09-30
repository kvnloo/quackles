#!/usr/bin/env node
/** #43 state-machine stress (desktop Chromium; not device evidence): rapid zoom/focus reversals ("fling").
 * Reports/asserts: no blank frame; promotion-during-motion count; bounded inflight/decoded bytes; failures 0;
 * final settled state sharp at the expected tier. OUT_DIR (+BASE_PATH) or TARGET_URL as the other probes.
 * Tiles from the local clone so timing reflects decode/render (ASSETS=...). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43400", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
let served = 0;
await page.route("**/quackles-assets/**", async (route) => {
  const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); served++;
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const f = window.__fs = { frames: 0, blank: 0, uncovered: 0, detailPaints: 0, paintsWhileMoving: 0, promotionsWhileMoving: 0, promo: [], lastW: 0, maxInflight: 0, maxDecoded: 0 };
  window.addEventListener("quackles:detail-painted", () => {
    // The player dispatches this BEFORE updating state.detailWidth: capture motion now, read the new width in a microtask.
    const moving = window.__QUACKLES_SEQUENCE__.getState().inspection.cameraMoving, zoom = window.__QUACKLES_SEQUENCE__.getState().inspection.zoom; f.detailPaints++;
    queueMicrotask(() => { const w = window.__QUACKLES_SEQUENCE__.getState().detailWidth;
      if (moving) { f.paintsWhileMoving++; if (w > f.lastW && f.lastW > 0) { f.promotionsWhileMoving++; f.promo.push([f.lastW, w, +zoom.toFixed(2)]); } if (w > f.lastW && f.lastW === 0) f.firstPaintWhileMoving = (f.firstPaintWhileMoving || 0) + 1; }
      f.lastW = w; });
  });
  const vis = (q) => getComputedStyle(document.querySelector(q)).visibility;
  const tick = () => { const s = window.__QUACKLES_SEQUENCE__.getState(); f.frames++;
    if (vis(".sequence-base") !== "visible" && vis(".sequence-detail") !== "visible") f.blank++;
    // Uncovered = the base is hidden but the visible detail canvas does not cover the whole hero viewport (page background shows through).
    if (vis(".sequence-base") !== "visible") { const c = document.querySelector(".sequence-camera").parentElement.getBoundingClientRect(), d = document.querySelector(".sequence-detail").getBoundingClientRect();
      if (vis(".sequence-detail") !== "visible" || d.left > c.left + 1 || d.top > c.top + 1 || d.right < c.right - 1 || d.bottom < c.bottom - 1) f.uncovered++; }
    if (s.cache) { f.maxInflight = Math.max(f.maxInflight, s.cache.inflight); f.maxDecoded = Math.max(f.maxDecoded, s.cache.totalBytes); }
    if (!f.stop) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const set = (z, x, y) => page.evaluate(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, x, y]);
const before = served;
// 5 s of reversals every ~70 ms, sweeping zoom 1.5..9 and focus across the frame
for (let i = 0; i < 70; i++) { const z = i % 2 ? 1.5 : 9; await set(z, 0.15 + 0.7 * ((i * 37) % 100) / 100, 0.15 + 0.7 * ((i * 53) % 100) / 100); await page.waitForTimeout(70); }
const duringMs = 70 * 70;
await set(6, 0.44, 0.28);
let last = -1, since = Date.now(), calm = 0, final;
for (let i = 0; i < 200; i++) {
  final = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { w: q.detailWidth, d: q.drawCount, moving: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom), cache: q.cache, stale: q.stalePaints, errors: q.errors.length }; });
  if (final.w !== last) { last = final.w; since = Date.now(); }
  calm = !final.moving && final.dz < 1e-3 && Date.now() - since > 800 ? calm + 1 : 0; if (calm >= 5) break; await page.waitForTimeout(80);
}
// Phase 2: a settled camera then jumps by more than the painted buffer (opposite corner), twice, with latency-free tiles.
for (const [x, y] of [[0.9, 0.85], [0.1, 0.1], [0.9, 0.1]]) { await set(6, x, y); await page.waitForTimeout(3200); }
const f = await page.evaluate(() => { window.__fs.stop = true; return window.__fs; });
const res = { flingRequests: served - before, frames: f.frames, blankFrames: f.blank, uncoveredFrames: f.uncovered, detailPaints: f.detailPaints, paintsWhileMoving: f.paintsWhileMoving, promotionsWhileMoving: f.promotionsWhileMoving, promotions: f.promo, firstPaintsWhileMoving: f.firstPaintWhileMoving || 0, maxInflight: f.maxInflight, maxDecodedMiB: +(f.maxDecoded / 1048576).toFixed(1), budgetMiB: +(final.cache.budgetBytes / 1048576).toFixed(1), staleDiscard: final.cache.staleDiscard, failures: final.cache.failures, stalePaints: final.stale, errors: final.errors, settledDetailWidth: final.w, settledCalm: calm >= 5 };
console.log(JSON.stringify(res));
await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await browser.close(); server.kill();
const bad = []; if (res.blankFrames) bad.push("blank frames"); if (res.uncoveredFrames) bad.push("viewport not covered while base hidden"); if (res.promotionsWhileMoving || res.firstPaintsWhileMoving) bad.push("tier promoted while camera moving (D6)"); if (res.failures || res.errors) bad.push("failures/errors"); if (res.maxDecodedMiB > res.budgetMiB) bad.push("decoded over budget"); if (res.settledDetailWidth < 4096) bad.push("not sharp after settle"); if (res.stalePaints) bad.push("stale paints");
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
