#!/usr/bin/env node
/** Scroll-feel contracts (desktop Chromium, synthetic wheel; not device evidence). OUT_DIR(+BASE_PATH) or TARGET_URL.
 * A. carry-over: a continuous wheel-up that brings the story home must NOT flow into inspection zoom (<=1.002);
 *    a fresh gesture after a pause still zooms (>1.3).
 * B. resize keeps story progress (|dp| < 0.002), not the pixel offset.
 * D. a zoom-out wheel during zoom-in catch-up must not keep zooming in.
 * C. slow trackpad scroll is smooth: mean |dv| / mean |v| of published progress per frame < 0.05. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43480";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/quackles-assets/**", (route) => route.fulfill({ status: 404, body: "" }));
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`);
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.waitForTimeout(2000);
await page.mouse.move(720, 450);
const sleep = (ms) => page.waitForTimeout(ms);
const state = () => page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { p: s.current.progress, z: s.inspection.zoom }; });
const wheel = async (n, dy, gap) => { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await sleep(gap); } };
const failures = [], out = {};

// A. carry-over
await wheel(25, 100, 60); await sleep(700);
out.midStory = (await state()).p;
await page.evaluate(() => { const w = window.__feelZ = { max: 1 }; const t = () => { const z = window.__QUACKLES_SEQUENCE__.getState().inspection.zoom; if (z > w.max) w.max = z; if (!w.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
await wheel(60, -100, 60); await sleep(1500);
out.carryOverMaxZoom = await page.evaluate(() => { window.__feelZ.stop = true; return window.__feelZ.max; });
out.afterHomeProgress = (await state()).p;
if (out.carryOverMaxZoom > 1.002) failures.push(`carry-over zoom ${out.carryOverMaxZoom.toFixed(3)} > 1.002`);
if (out.afterHomeProgress > 0.002) failures.push(`story did not come home (p=${out.afterHomeProgress.toFixed(4)})`);
await sleep(400);
await wheel(4, -100, 90); await sleep(1500);
out.freshGestureZoom = (await state()).z;
if (out.freshGestureZoom <= 1.3) failures.push(`fresh wheel-up gesture after a pause did not zoom (${out.freshGestureZoom.toFixed(3)})`);
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await sleep(2500);

// D. zoom reversal: fast zoom-in burst, then one wheel-down mid-catch-up must not keep zooming in
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await sleep(2500);
await sleep(400);
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await sleep(30); }
await page.evaluate(() => { const w = window.__feelR = { max: 0, at: null }; addEventListener("wheel", (e) => { if (e.deltaY > 0 && w.at === null) { w.at = window.__QUACKLES_SEQUENCE__.getState().inspection.zoom; w.max = w.at; } }, { capture: true }); const t = () => { const z = window.__QUACKLES_SEQUENCE__.getState().inspection.zoom; if (w.at !== null && z > w.max) w.max = z; if (!w.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
await page.mouse.wheel(0, 120); await sleep(1500);
const { max: rev, at: atReverse } = await page.evaluate(() => { window.__feelR.stop = true; return window.__feelR; });
out.reversal = { atReverse: +atReverse.toFixed(3), maxAfter: +rev.toFixed(3), final: +(await state()).z.toFixed(3) };
if (rev > atReverse + 0.01) failures.push(`zoom kept rising after a zoom-out wheel (${atReverse.toFixed(3)} -> ${rev.toFixed(3)})`);
if (out.reversal.final > atReverse + 0.01) failures.push(`zoom-out wheel ended above where it was reversed (${out.reversal.final})`);
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await sleep(2500);

// B. resize keeps progress
await wheel(18, 100, 60); await sleep(1500);
const before = (await state()).p;
await page.setViewportSize({ width: 1100, height: 760 }); await sleep(1500);
const after = (await state()).p;
await page.setViewportSize({ width: 1440, height: 900 }); await sleep(1500);
const back = (await state()).p;
out.resize = { before, after, back };
if (!(before > 0.1)) failures.push(`resize check did not start mid-story (p=${before})`);
if (Math.abs(after - before) >= 0.002 || Math.abs(back - before) >= 0.002) failures.push(`resize moved the story ${before.toFixed(4)} -> ${after.toFixed(4)} -> ${back.toFixed(4)}`);

// C. slow-scroll smoothness
// continue from mid-story (after B) so the story is free to move in both directions
await page.evaluate(() => { const r = window.__feelP = []; const t = () => { r.push(window.__QUACKLES_SEQUENCE__.getState().current.progress); if (!window.__feelStop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
await wheel(150, 12, 16);
const ps = await page.evaluate(() => { window.__feelStop = true; return window.__feelP; });
const v = ps.slice(1).map((p, i) => p - ps[i]).filter((d, i, a) => i > 5 && i < a.length - 5);
const dv = v.slice(1).map((x, i) => Math.abs(x - v[i]));
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
out.slowTravel = +(ps.at(-1) - ps[0]).toFixed(4);
out.slowRoughness = +(mean(dv) / Math.max(1e-9, mean(v.map(Math.abs)))).toFixed(4);
if (!(out.slowTravel > 0.02)) failures.push(`slow scroll did not move the story (travel ${out.slowTravel})`);
if (!(out.slowRoughness < 0.05)) failures.push(`slow-scroll roughness ${out.slowRoughness} >= 0.05`);

console.log(JSON.stringify(out));
for (const f of failures) console.log("FAIL:", f);
await browser.close(); server.kill();
process.exit(failures.length ? 1 : 0);
