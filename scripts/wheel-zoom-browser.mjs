#!/usr/bin/env node
/** Real wheel input on the hero (desktop Chromium; not device evidence): ticks of wheel-up at the cursor, then idle.
 * Reports frames blank, time from last wheel tick -> camera settled -> sharp lock, final tier. OUT_DIR(+BASE_PATH) or TARGET_URL. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43420", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/quackles-assets/**", async (route) => {
  const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.waitForTimeout(2500);
await page.evaluate(() => { const f = window.__w = { blank: 0, frames: 0 }; const vis = (q) => getComputedStyle(document.querySelector(q)).visibility; const t = () => { f.frames++; if (vis(".sequence-base") !== "visible" && vis(".sequence-detail") !== "visible") f.blank++; if (!f.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
const results = [];
for (const [label, ticks, delta] of [["gentle 6 ticks", 6, -100], ["long 20 ticks", 20, -120]]) {
  await page.mouse.move(1000, 400);
  const t0 = Date.now();
  for (let i = 0; i < ticks; i++) { await page.mouse.wheel(0, delta); await page.waitForTimeout(40); }
  const tLast = Date.now();
  let settledAt = null, sharpAt = null, lastD = -1, sinceD = Date.now(), s;
  while (Date.now() - tLast < 9000) {
    s = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { w: q.detailWidth, d: q.drawCount, moving: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom), zoom: c.zoom }; });
    if (settledAt === null && !s.moving && s.dz < 1e-3) { settledAt = Date.now() - tLast; sinceD = Date.now(); }
    if (s.d !== lastD) { lastD = s.d; sinceD = Date.now(); }
    if (settledAt !== null && s.w > 1024 && Date.now() - sinceD > 400) { sharpAt = sinceD - tLast; break; }
    await page.waitForTimeout(30);
  }
  results.push({ label, zoom: +s.zoom.toFixed(2), lastWheelToSettleMs: settledAt, lastWheelToSharpMs: sharpAt, detailWidth: s.w });
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await page.waitForTimeout(2500);
}
const f = await page.evaluate(() => { window.__w.stop = true; return window.__w; });
console.log(JSON.stringify({ results, frames: f.frames, blankFrames: f.blank }));
await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await browser.close(); server.kill();
process.exit(f.blank ? 1 : 0);
