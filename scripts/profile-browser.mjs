#!/usr/bin/env node
/** M7 device-profile + lifecycle contracts (desktop Chromium with forced navigator hints; NOT physical-device evidence).
 * For constrained / balanced / full: profile id, zoom capped at maxZoomCap, decoded bytes <= budget, decodes in flight <= maxActiveJobs and
 * fetches in flight <= maxFetches (PROPOSED RULE, preview/gp-net6; was: network + decode together <= maxActiveJobs), 0 blank frames,
 * 0 errors, first-frame hero identical across profiles (authored composition never silently changes), and freeze/resume survives. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44600", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const HINTS = { constrained: { deviceMemory: 2, hardwareConcurrency: 4, saveData: true, effectiveType: "3g" }, balanced: { deviceMemory: 4, hardwareConcurrency: 4, saveData: false, effectiveType: "4g" }, full: { deviceMemory: 8, hardwareConcurrency: 16, saveData: false, effectiveType: "4g" } };
const out = {}, bad = [], heroHashes = {};
for (const [want, h] of Object.entries(HINTS)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((h) => { Object.defineProperty(navigator, "deviceMemory", { get: () => h.deviceMemory }); Object.defineProperty(navigator, "hardwareConcurrency", { get: () => h.hardwareConcurrency }); Object.defineProperty(navigator, "connection", { get: () => ({ saveData: h.saveData, effectiveType: h.effectiveType }) }); }, h);
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2600);
  heroHashes[want] = crypto.createHash("sha256").update(await page.locator(".sequence-base").screenshot()).digest("hex").slice(0, 12);
  await page.evaluate(() => { const f = window.__p = { frames: 0, blank: 0, maxDecoded: 0, maxInflight: 0, maxFetching: 0, stop: false }; const vis = (q) => getComputedStyle(document.querySelector(q)).visibility;
    const t = () => { const s = window.__QUACKLES_SEQUENCE__.getState(); f.frames++; if (vis(".sequence-base") !== "visible" && vis(".sequence-detail") !== "visible") f.blank++; if (s.cache) { f.maxDecoded = Math.max(f.maxDecoded, s.cache.totalBytes); f.maxInflight = Math.max(f.maxInflight, s.cache.decodingJobs); f.maxFetching = Math.max(f.maxFetching || 0, s.cache.fetching); } if (!f.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  for (const z of [3, 8, 24, 6, 1]) { await page.evaluate((zz) => window.__QUACKLES_INSPECTION__.setTarget(zz, 0.44, 0.28), z); await page.waitForTimeout(2200); }
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.44, 0.28)); await page.waitForTimeout(2500);
  const before = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { profile: s.profile.id, maxZoom: s.inspection.maxZoom, detailWidth: s.detailWidth, zoom: s.inspection.zoom }; });
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" }); await page.waitForTimeout(600); await cdp.send("Page.setWebLifecycleState", { state: "active" }); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.5, 0.3)); await page.waitForTimeout(2500);
  const f = await page.evaluate(() => { window.__p.stop = true; const s = window.__QUACKLES_SEQUENCE__.getState(); return { ...window.__p, budget: s.cache.budgetBytes, maxJobs: s.cache.maxActiveJobs, maxFetches: s.cache.maxFetches, errors: s.errors.length, failures: s.cache.failures, afterResumeDetail: s.detailWidth, ready: s.ready }; });
  out[want] = { ...before, maxDecodedMiB: +(f.maxDecoded / 1048576).toFixed(1), budgetMiB: +(f.budget / 1048576).toFixed(1), maxInflight: f.maxInflight, maxFetching: f.maxFetching, maxJobs: f.maxJobs, maxFetches: f.maxFetches, blankFrames: f.blank, errors: f.errors, failures: f.failures, afterResumeDetail: f.afterResumeDetail, heroHash: heroHashes[want] };
  if (before.profile !== want) bad.push(`${want}: selected profile ${before.profile}`); if (f.maxDecoded > f.budget) bad.push(`${want}: decoded over budget`); if (f.maxInflight > f.maxJobs) bad.push(`${want}: decodes in flight over maxActiveJobs`); if (!(f.maxFetching <= f.maxFetches)) bad.push(`${want}: fetches in flight over maxFetches (PROPOSED RULE)`); if (f.blank) bad.push(`${want}: blank frames`); if (f.errors || f.failures) bad.push(`${want}: errors/failures`); if (!f.afterResumeDetail && want !== "constrained") bad.push(`${want}: no detail after resume`);
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await ctx.close();
}
if (new Set(Object.values(heroHashes)).size !== 1) bad.push(`first-frame hero differs across profiles: ${JSON.stringify(heroHashes)}`);
console.log(JSON.stringify(out, null, 1)); await browser.close(); server.kill();
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
