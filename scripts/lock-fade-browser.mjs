#!/usr/bin/env node
/** M3 contract (desktop Chromium; not device evidence): when the sharp detail layer FIRST appears (sharp lock), it dissolves in
 * (opacity ramps 0->1, >=3 intermediate frames, complete within 300 ms) instead of snapping; repaints of an already-visible
 * layer do not re-fade; reduced motion = instant. OUT_DIR(+BASE_PATH). Tiles from the local clone. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44100", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
async function run(reduced) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" }); const page = await ctx.newPage();
  await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
  await page.evaluate(() => { const d = document.querySelector(".sequence-detail"); const f = window.__lf = { samples: [], stop: false, sawVisible: false, repaints: 0, lastOpacity: null }; window.addEventListener('quackles:detail-painted', () => { f.repaints++; });
    const t0 = performance.now(); const tick = () => { const cs = getComputedStyle(d); const vis = cs.visibility === "visible"; const op = +cs.opacity;
      if (vis) { f.samples.push([+(performance.now() - t0).toFixed(0), +op.toFixed(3)]); f.sawVisible = true; }
      if (!f.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28));
  for (let i = 0; i < 90; i++) { const st = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(); return { w: q.detailWidth, m: q.inspection.cameraMoving }; }); if (st.w > 0 && !st.m) break; await page.waitForTimeout(80); }
  await page.waitForTimeout(900);
  // second, a FAR pan at the same zoom forces a coverage repaint of the already-visible layer: it must not fade again
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.85, 0.8)); await page.waitForTimeout(3500);
  const f = await page.evaluate(() => { window.__lf.stop = true; return window.__lf; }); await ctx.close();
  const s = f.samples; const first = s.findIndex((x) => x[1] > 0 || true);
  const ramp = []; for (const x of s) { ramp.push(x[1]); if (x[1] >= 0.999) break; }
  const firstVisibleOpacity = s.length ? s[0][1] : null, intermediates = ramp.filter((v) => v > 0.02 && v < 0.98).length, rampMs = s.length ? (s[ramp.length - 1][0] - s[0][0]) : null;
  const afterFull = s.slice(ramp.length).filter((x) => x[1] < 0.98).length;
  return { reduced, repaints: f.repaints, samples: s.length, firstVisibleOpacity, intermediates, rampMs, dipsAfterFull: afterFull };
}
const normal = await run(false), reduced = await run(true);
console.log(JSON.stringify({ normal, reduced })); await browser.close(); server.kill();
const bad = [];
if (!(normal.firstVisibleOpacity < 0.2)) bad.push("detail appears at full opacity (snap)"); if (normal.intermediates < 3) bad.push("no dissolve (<3 intermediate frames)"); if (normal.rampMs > 300) bad.push("dissolve slower than 300 ms"); if (normal.repaints < 2) bad.push(`test did not exercise a repaint (${normal.repaints} paint events) - re-fade guard unproven`); if (normal.dipsAfterFull) bad.push("visible layer re-faded on repaint");
if (reduced.firstVisibleOpacity < 0.99 || reduced.intermediates) bad.push("reduced motion must be instant");
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
