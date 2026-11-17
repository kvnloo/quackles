#!/usr/bin/env node
/** Per-preview real-browser check (headless Chromium, phone emulation 412x915 @ DPR 2.6, isMobile, hasTouch; not device evidence).
 * Usage: PREVIEW=<id> OUT_DIR=<static export root> BASE_PATH=/quackles/preview/<id> [SHOTS=<dir>] node scripts/preview-browser.mjs
 * Tiles are served from ASSETS (local quackles-assets checkout). Asserts, per lib/preview.ts config:
 *  scene count + theme buttons, tile requests match the zoom family, no page errors, zoom works (or is impossible) as configured. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const PREVIEW = process.env.PREVIEW || "production";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43470", BASE = process.env.BASE_PATH || "";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const SHOTS = process.env.SHOTS || "";
const EXPECT = {
  production: { frames: 52, buttons: 5, story: true, zoomThemes: ["blue"], plateOnly: ["day", "white", "dark", "night"], family: /\/blue\/p0000000\/\d\/|\/mushroom\/p0000000\/gp\//, note: null },
  "scenes-lowres": { frames: 52, buttons: 5, story: true, zoomThemes: [], plateOnly: ["day", "white", "blue", "dark", "night"], family: null, note: null },
  "scenes-250mp": { frames: 52, buttons: 5, story: true, zoomThemes: ["blue"], plateOnly: ["day", "white", "dark", "night"], family: /\/blue\/p0000000\/\d\//, note: "250MP: Blue only; 4 renders pending" },
  "scenes-gigapixel": { frames: 52, buttons: 5, story: true, zoomThemes: ["day", "white", "blue", "dark", "night"], plateOnly: [], family: /\/(day|white|blue|dark|night|mushroom)\/p0000000\/gp\/\d\//, note: "1GP source: not scene-matched" },
  "gigapixel-single": { frames: 52, buttons: 0, story: false, zoomThemes: ["white"], plateOnly: [], family: /\/white\/p0000000\/gp\/\d\//, note: "1GP source: not scene-matched" },
}[PREVIEW];
if (!EXPECT) throw new Error(`unknown PREVIEW ${PREVIEW}`);

const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
const page = await context.newPage();
const tiles = [], pageErrors = [], failures = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("request", (r) => { if (/\/quackles-assets\/.*\.webp/.test(r.url())) tiles.push(new URL(r.url()).pathname); });
await page.route("**/quackles-assets/**", async (route) => {
  const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^.*?\/quackles-assets\//, ""));
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});
const check = (ok, msg) => { if (!ok) failures.push(msg); };
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const state = () => page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { preview: s.preview, note: s.note, frameCount: s.frameCount, detailWidth: s.detailWidth, errors: s.errors, theme: s.current.theme, maxZoom: s.inspection.maxZoom, targetZoom: s.inspection.targetZoom, progress: s.current.progress }; });
const zoomTo = async (z, x = 0.5, y = 0.5) => { await page.evaluate(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, x, y]); };
const waitDetail = (min, ms = 20000) => page.waitForFunction((m) => window.__QUACKLES_SEQUENCE__.getState().detailWidth > m, min, { timeout: ms }).then(() => true, () => false);
const setTheme = async (id) => { await page.evaluate((i) => window.__QUACKLES_SEQUENCE__.setTheme(i), id); await page.waitForTimeout(700); };

await page.goto(`http://127.0.0.1:${port}${BASE}/`, { waitUntil: "load" });
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
await page.waitForTimeout(1500);
let s = await state();
check(s.preview === PREVIEW, `preview id ${s.preview} != ${PREVIEW}`);
check(s.frameCount === EXPECT.frames, `frameCount ${s.frameCount} != ${EXPECT.frames}`);
const buttons = await page.locator(".theme-seg-btn").count();
check(buttons === EXPECT.buttons, `theme buttons ${buttons} != ${EXPECT.buttons}`);
const noteText = await page.locator('[data-testid="preview-note"]:not([hidden])').textContent().catch(() => null);
check((noteText ?? null) === EXPECT.note && s.note === EXPECT.note, `note ${JSON.stringify(noteText)} != ${JSON.stringify(EXPECT.note)}`);
const scroll = await page.evaluate(() => ({ space: !!document.querySelector(".scroll-space"), beats: !!document.querySelector(".hero-copy"), height: document.documentElement.scrollHeight, inner: innerHeight }));
check(scroll.space === EXPECT.story && scroll.beats === EXPECT.story, `story DOM ${JSON.stringify(scroll)} != story:${EXPECT.story}`);
if (!EXPECT.story) check(scroll.height <= scroll.inner + 2, `single scene must not scroll (${scroll.height} > ${scroll.inner})`);
await shot("01-hero");

const zoomResults = {};
const themes = EXPECT.story ? ["day", "white", "blue", "dark", "night"] : [null];
for (const theme of themes) {
  if (theme) await setTheme(theme);
  const before = await state();
  await zoomTo(4, 0.46, 0.4);
  const want = !theme || EXPECT.zoomThemes.includes(theme);
  const zoomed = want ? await waitDetail(1024) : (await page.waitForTimeout(2500), (await state()).detailWidth > 1024);
  const after = await state();
  zoomResults[theme ?? "mushroom"] = { maxZoom: +before.maxZoom.toFixed(2), detailWidth: after.detailWidth, targetZoom: +after.targetZoom.toFixed(2) };
  check(zoomed === want, `${theme ?? "mushroom"}: zoom detail ${zoomed ? "present" : "absent"} (detailWidth ${after.detailWidth}, maxZoom ${before.maxZoom.toFixed(2)}), expected ${want ? "present" : "absent"}`);
  if (!want) check(before.maxZoom <= 1.001, `${theme}: plate-only theme must not zoom (maxZoom ${before.maxZoom})`);
  if (want && (theme === "blue" || !theme || PREVIEW === "scenes-gigapixel" && theme === "day")) { await page.waitForTimeout(1200); await shot(`02-zoom-${theme ?? "mushroom"}`); }
  await zoomTo(1); await page.waitForTimeout(900);
}

if (!EXPECT.story) {
  // Real touch pinch (CDP) + one-finger pan on the single scene.
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  await touch("touchStart", [[180, 460], [230, 460]]);
  for (let i = 1; i <= 12; i++) { await touch("touchMove", [[180 - i * 10, 460], [230 + i * 10, 460]]); await page.waitForTimeout(16); }
  await touch("touchEnd", []);
  await page.waitForTimeout(600);
  const pinched = await state();
  zoomResults.pinch = { targetZoom: +pinched.targetZoom.toFixed(2) };
  check(pinched.targetZoom > 1.5, `pinch did not zoom (targetZoom ${pinched.targetZoom})`);
  const focusBefore = await page.evaluate(() => window.__QUACKLES_INSPECTION__.getState().targetFocusX);
  await touch("touchStart", [[200, 450]]);
  for (let i = 1; i <= 10; i++) { await touch("touchMove", [[200 - i * 12, 450]]); await page.waitForTimeout(16); }
  await touch("touchEnd", []);
  await page.waitForTimeout(600);
  const focusAfter = await page.evaluate(() => window.__QUACKLES_INSPECTION__.getState().targetFocusX);
  zoomResults.pan = { from: +focusBefore.toFixed(3), to: +focusAfter.toFixed(3) };
  check(Math.abs(focusAfter - focusBefore) > 0.01, `pan did not move focus (${focusBefore} -> ${focusAfter})`);
  check(await waitDetail(1024), "no detail after pinch");
  await page.waitForTimeout(1200);
  await shot("03-pinch-pan");
} else {
  await setTheme("blue");
  await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(0.6));
  await page.waitForTimeout(1500);
  const mid = await state();
  check(mid.progress > 0.5, `story scroll did not move (progress ${mid.progress})`);
  await shot("03-story-mid");
  await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(0));
  await page.waitForTimeout(800);
}

s = await state();
const families = [...new Set(tiles.map((u) => u.replace(/^.*?\/quackles-assets\//, "").replace(/\/\d+_\d+\.webp.*/, "")))].sort();
if (!EXPECT.family) check(tiles.length === 0, `expected zero tile requests, got ${tiles.length}: ${families.join(" ")}`);
else {
  check(tiles.length > 0, "expected tile requests, got none");
  const stray = tiles.filter((u) => !EXPECT.family.test(u));
  check(stray.length === 0, `tile requests outside the configured family: ${[...new Set(stray.map((u) => u.replace(/\/\d+_\d+\.webp.*/, "")))].join(" ")}`);
}
check(pageErrors.length === 0, `page errors: ${pageErrors.join(" | ")}`);
check(s.errors.length === 0, `player errors: ${s.errors.join(" | ")}`);
console.log(JSON.stringify({ preview: PREVIEW, frames: s.frameCount, buttons, note: noteText, story: scroll.space, tileRequests: tiles.length, tileLevels: families, zoom: zoomResults, failures }, null, 1));
await browser.close(); server.kill();
process.exit(failures.length ? 1 : 0);
