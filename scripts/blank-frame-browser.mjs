#!/usr/bin/env node
/** #43 per-frame regression (desktop Chromium; not device evidence). Samples every rAF frame through:
 *  Blue zoom in/out x3, Blue<->Dark/Day swipes while zoomed, and zoom on every theme.
 * Fails if any frame has BOTH .sequence-base and .sequence-detail hidden (blank hero), or if Blue detail is
 * visible while the theme is mostly another scene (theme index > 2.5 or < 1.5). OUT_DIR=<static export>. */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43380";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/quackles-assets/**", async (route) => {
  const u = new URL(route.request().url());
  await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) });
});
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const vis = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e).visibility : "none"; };
  window.__frames = { n: 0, blank: [], staleBlue: [], sampling: true, ring: [], ctx: null };
  const tick = () => {
    const f = window.__frames, s = window.__QUACKLES_SEQUENCE__.getState(), t = s.current.presented; // what is actually on screen (requested theme leads it)
    const base = vis(".sequence-base"), det = vis(".sequence-detail"); f.n++;
    f.ring.push([f.n, +s.current.theme.toFixed(2), +t.toFixed(2), s.detailWidth, base[0], det[0], +s.inspection.zoom.toFixed(2), +s.inspection.targetZoom.toFixed(2), +s.inspection.maxZoom.toFixed(2)].join(" ")); if (f.ring.length > 14) f.ring.shift();
    if (base !== "visible" && det !== "visible") f.blank.push({ i: f.n, theme: +t.toFixed(2) });
    if (det === "visible" && s.detailWidth > 0 && (t > 2.5 || t < 1.5)) { f.staleBlue.push({ i: f.n, theme: +t.toFixed(2), w: s.detailWidth }); if (!f.ctx) f.ctx = f.ring.slice(); }
    if (f.sampling) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
const ev = (fn, a) => page.evaluate(fn, a);
const zoom = (z, x = 0.44, y = 0.28) => ev(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, x, y]);
const theme = (id) => ev((i) => window.__QUACKLES_SEQUENCE__.setTheme(i), id);
await theme("blue"); await page.waitForTimeout(800);
for (let i = 0; i < 3; i++) { await zoom(4); await page.waitForTimeout(1800); await zoom(1, 0.5, 0.5); await page.waitForTimeout(900); }
for (const other of ["dark", "day", "white", "night"]) {
  await theme("blue"); await page.waitForTimeout(700); await zoom(4); await page.waitForTimeout(1800);
  await theme(other); await page.waitForTimeout(1500); await zoom(1, 0.5, 0.5); await page.waitForTimeout(700);
}
for (const t of ["day", "white", "blue", "dark", "night"]) { await theme(t); await page.waitForTimeout(700); await zoom(3); await page.waitForTimeout(1500); await zoom(1, 0.5, 0.5); await page.waitForTimeout(600); }
for (let i = 0; i < 6; i++) { await theme(i % 2 ? "blue" : "dark"); await page.waitForTimeout(90); } // rapid toggling
await page.waitForTimeout(1500);
const f = await ev(() => { window.__frames.sampling = false; return window.__frames; });
if (f.ctx) console.log("frame req presented detailW base detail zoom target maxZoom\n" + f.ctx.join("\n"));
console.log(JSON.stringify({ frames: f.n, blankFrames: f.blank.length, staleBlueFrames: f.staleBlue.length, blank: f.blank.slice(0, 5), staleBlue: f.staleBlue.slice(0, 5) }));
await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await browser.close(); server.kill();
process.exit(f.blank.length || f.staleBlue.length ? 1 : 0);
