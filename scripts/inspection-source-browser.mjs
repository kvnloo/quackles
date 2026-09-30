#!/usr/bin/env node
/** Real-browser #43 check: zoom Blue, report which tile source families were requested.
 * Usage: OUT_DIR=<dir with static export> node scripts/inspection-source-browser.mjs   (exit 1 if >1 family)
 * Desktop Chromium only — not physical-device evidence. */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43290";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const tiles = [];
page.on("request", (r) => { const u = r.url(); if (/\/quackles-assets\/blue\/.*\.webp/.test(u)) tiles.push(u); });
await page.route("**/quackles-assets/**", async (route) => {
  const u = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) });
});
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().ready, null, { timeout: 30000 });
const steps = [];
for (const z of [2, 4, 6, 8]) {
  await page.evaluate((zoom) => window.__QUACKLES_INSPECTION__.setTarget(zoom, 0.44, 0.28), z);
  await page.waitForTimeout(2500);
  steps.push(await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { detailWidth: s.detailWidth, detailTiles: s.detailTiles, src: s.inspectionSources?.blue ?? null, errors: s.errors.length }; }));
}
const fam = (u) => (u.includes("/gp/") ? "gp-1gp" : "legacy-201mp");
const levels = [...new Set(tiles.map((u) => u.replace(/^.*\/blue\/p0000000\//, "").replace(/\/\d+_\d+\.webp.*/, "")))].sort();
const result = { families: [...new Set(tiles.map(fam))].sort(), levels, tileRequests: tiles.length, steps };
console.log(JSON.stringify(result));
await browser.close(); server.kill();
process.exit(result.families.length > 1 ? 1 : 0);
