#!/usr/bin/env node
/** #43 real-browser warm-up regression (desktop Chromium; not device evidence).
 * 1) no HQ/DZI request before the hero is painted + settled  2) after idle: bounded, selected-family, no top tier
 * 3) hero pixels identical before/after warm-up. OUT_DIR=<static export>. */
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43292";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const tiles = [];
page.on("request", (r) => { if (/\/quackles-assets\/.*\.webp/.test(r.url())) tiles.push({ t: Date.now(), url: r.url() }); });
await page.route("**/quackles-assets/**", async (route) => {
  const u = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) });
});
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
const paintedAt = Date.now();
const shot = async () => crypto.createHash("sha256").update(await page.locator(".sequence-base").screenshot()).digest("hex");
const before = await shot();
await page.waitForTimeout(600);
const early = tiles.filter((x) => x.t <= paintedAt + 600).length;
await page.waitForTimeout(4500);
const after = await shot();
const urls = tiles.map((x) => x.url);
const res = { earlyRequests: early, totalRequests: urls.length, families: [...new Set(urls.map((u) => (u.includes("/gp/") ? "gp" : "legacy")))], levels: [...new Set(urls.map((u) => u.replace(/^.*\/(?:blue|day|white|dark|night)\/p0000000\//, "").replace(/\/\d+_\d+\.webp.*/, "")))].sort(), pixelsUnchanged: before === after };
console.log(JSON.stringify(res));
await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
await browser.close(); server.kill();
const fail = [];
if (res.earlyRequests) fail.push("HQ request before settle");
if (res.totalRequests > 40) fail.push("warm-up not bounded");
if (res.levels.some((l) => l === "0" || /^gp\/[01]$/.test(l))) fail.push("top tier warmed");
if (res.families.includes("gp")) fail.push("Blue warm-up touched 1GP");
if (!res.pixelsUnchanged) fail.push("pixels changed");
if (fail.length) { console.error("FAIL", fail); process.exit(1); }
