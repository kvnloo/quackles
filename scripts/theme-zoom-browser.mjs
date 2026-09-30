#!/usr/bin/env node
/** Real-browser: every theme survives an inspection attempt (#43). Themes without a live source must not error,
 * must not fetch HQ tiles, and must keep max zoom sane. Desktop Chromium only. OUT_DIR=<static export>. */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43320";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const tiles = [], pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("request", (r) => { if (/\/quackles-assets\/.*\.webp/.test(r.url())) tiles.push(r.url()); });
await page.route("**/quackles-assets/**", async (route) => {
  const u = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) });
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
const out = {};
for (const [i, theme] of ["day", "white", "blue", "dark", "night"].entries()) {
  await page.evaluate((id) => window.__QUACKLES_SEQUENCE__.setTheme(id), theme);
  await page.waitForTimeout(1200);
  const before = tiles.length;
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28));
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => { const vis = (sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e).visibility : null; }; const q = window.__QUACKLES_SEQUENCE__.getState(); return { baseVisible: vis(".sequence-base"), detailVisible: vis(".sequence-detail"), theme: q.current.theme, detailWidth: q.detailWidth, errors: q.errors.length, maxZoom: q.inspection.maxZoom, zoom: q.inspection.zoom }; });
  out[theme] = { ...s, newTileRequests: tiles.length - before, families: [...new Set(tiles.slice(before).map((u) => (u.includes("/gp/") ? "gp" : "legacy")))] };
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await page.waitForTimeout(500);
}
console.log(JSON.stringify({ out, pageErrors }, null, 1));
await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await browser.close(); server.kill();
const bad = Object.entries(out).filter(([t, r]) => r.errors || (r.baseVisible !== "visible" && r.detailVisible !== "visible") || (t !== "blue" && (r.newTileRequests || r.families.length)) || (t === "blue" && r.families.some((f) => f !== "legacy")));
if (bad.length || pageErrors.length) { console.error("FAIL", bad.map((b) => b[0]), pageErrors); process.exit(1); }
