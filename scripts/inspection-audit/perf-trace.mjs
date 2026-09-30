#!/usr/bin/env node
/** #43 Blue zoom performance trace (desktop headless Chromium; NOT device evidence).
 * Tiles are served from a local asset clone so numbers reflect decode/render, not network variance.
 * Usage: OUT_DIR=<static export> LABEL=<name> [RUNS=3] node perf-trace.mjs > result.json */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR, label = process.env.LABEL || "run", runs = +(process.env.RUNS || 3), port = process.env.PORT || "43300";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0; };
const results = [];
for (let run = 0; run < runs; run++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const reqs = [];
  await page.route("**/quackles-assets/**", async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "");
    const file = path.join(ASSETS, rel);
    reqs.push({ t: Date.now(), rel, bytes: fs.existsSync(file) ? fs.statSync(file).size : 0 });
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  await page.waitForTimeout(2500); // settle + idle warm-up window
  const idleReqs = reqs.length;
  await page.evaluate(() => {
    window.__perf = { d: [], blank: 0, stale: 0, last: 0, stop: false };
    const base = document.querySelector(".sequence-base");
    const tick = (t) => {
      const p = window.__perf; if (p.last) p.d.push(t - p.last); p.last = t;
      try { const c = base.getContext("2d", { willReadFrequently: true }); const px = c.getImageData(base.width >> 1, base.height >> 1, 1, 1).data; if (px[3] === 0) p.blank++; } catch {}
      if (!p.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now(), reqsBefore = reqs.length;
  const stateOf = () => page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { w: s.detailWidth, tiles: s.detailTiles, cache: s.cache, stale: s.stalePaints, errors: s.errors.length }; });
  const steps = [];
  for (const z of [2, 4, 6]) {
    const ts = Date.now(), stepReqStart = reqs.length;
    await page.evaluate((zoom) => window.__QUACKLES_INSPECTION__.setTarget(zoom, 0.44, 0.28), z);
    let last = -1, since = Date.now(), sharpAt = null, s;
    while (Date.now() - ts < 6000) {
      s = await stateOf();
      if (s.w !== last) { last = s.w; since = Date.now(); }
      if (Date.now() - since > 700) { sharpAt = since - ts; break; }
      await page.waitForTimeout(50);
    }
    const stepReqs = reqs.slice(stepReqStart).map((r) => r.rel);
    steps.push({ zoom: z, timeToSharpMs: sharpAt, detailWidth: s.w, detailTiles: s.tiles, requests: stepReqs.length, uniqueRequests: new Set(stepReqs).size, levels: [...new Set(stepReqs.map((u) => u.replace(/^.*\/p0000000\//, '').replace(/\/\d+_\d+\.webp$/, '')))].sort() });
  }
  const end = await stateOf();
  const perf = await page.evaluate(() => { window.__perf.stop = true; return window.__perf; });
  const d = perf.d;
  const allRel = reqs.map((r) => r.rel); const dupes = allRel.length - new Set(allRel).size;
  const trace = { run, duplicateRequests: dupes, idleWarmRequests: idleReqs, interactiveRequests: reqs.length - reqsBefore, interactiveBytes: reqs.slice(reqsBefore).reduce((s, r) => s + r.bytes, 0), levels: [...new Set(reqs.map((r) => r.rel.replace(/^blue\/p0000000\//, "").replace(/\/\d+_\d+\.webp$/, "")))].sort(),
    frames: d.length, p50: +pct(d, .5).toFixed(1), p95: +pct(d, .95).toFixed(1), p99: +pct(d, .99).toFixed(1), worst: +Math.max(...d).toFixed(1), over33: d.filter((x) => x > 33.4).length, over50: d.filter((x) => x > 50).length,
    blankSamples: perf.blank, stalePaints: end.stale, errors: end.errors, decodedBytes: end.cache?.decodedBytes, cacheEntries: end.cache?.entries, staleDiscard: end.cache?.staleDiscard, failures: end.cache?.failures, steps };
  results.push(trace);
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await ctx.close();
}
await browser.close(); server.kill();
console.log(JSON.stringify({ label, runs: results }, null, 1));
