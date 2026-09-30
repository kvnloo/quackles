#!/usr/bin/env node
/** M4 touch-input contracts via CDP multi-touch (desktop Chromium emulation; NOT physical-device evidence).
 *  T1 pinch: fingers 4x apart -> zoom within 8% of 4x; settles sharp (detailWidth>0) after release; no blank frames.
 *  T2 pan tracks the finger 1:1: dragging 100 px moves the content 100 px (+-4 px).
 *  T3 held-still pan: while the finger stays down and still, cameraMoving must go false within 300 ms (else sharp lock waits for lift-off).
 * OUT_DIR(+BASE_PATH). Tiles from the local clone. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44200", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true }); const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const st = () => page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { zoom: c.zoom, target: c.targetZoom, moving: c.cameraMoving, w: q.detailWidth, fx: c.targetFocusX, fy: c.targetFocusY }; });
const settle = async (ms = 6000) => { const t0 = Date.now(); let calm = 0; while (Date.now() - t0 < ms) { const s = await st(); calm = !s.moving && Math.abs(s.zoom - s.target) < 1e-3 ? calm + 1 : 0; if (calm >= 6) return; await page.waitForTimeout(80); } };
await page.evaluate(() => { const f = window.__t = { frames: 0, blank: 0, stop: false }; const vis = (q) => getComputedStyle(document.querySelector(q)).visibility; const t = () => { f.frames++; if (vis(".sequence-base") !== "visible" && vis(".sequence-detail") !== "visible") f.blank++; if (!f.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
const res = {}, bad = [];
// T1 pinch: centre of hero (x 720, y 450), fingers 40 px apart -> 160 px apart (4x)
const cx = 720, cy = 450; await touch("touchStart", [[cx - 20, cy], [cx + 20, cy]]);
for (let i = 1; i <= 12; i++) { const half = 20 + (60 * i) / 12; await touch("touchMove", [[cx - half, cy], [cx + half, cy]]); await page.waitForTimeout(30); }
await page.waitForTimeout(300); const held = await st(); await touch("touchEnd", []); await settle(); const after = await st();
res.pinch = { heldTargetZoom: +held.target.toFixed(2), settledZoom: +after.zoom.toFixed(2), detailWidth: after.w };
if (Math.abs(held.target - 4) / 4 > 0.08) bad.push(`pinch scale off: ${held.target.toFixed(2)} vs 4`); if (!after.w) bad.push("no sharp lock after pinch release");
// T2 pan tracks finger 1:1
const shot = async () => sharp(await page.screenshot()).extract({ left: 420, top: 0, width: 600, height: 900 }).greyscale().blur(1.5).raw().toBuffer();
const shift = (A, B) => { let best = null; const W = 600, H = 900; for (let dy = -130; dy <= 130; dy += 2) for (let dx = -130; dx <= 130; dx += 2) { let e = 0, n = 0; for (let y = 300; y < 600; y += 6) for (let x = 200; x < 400; x += 6) { const yy = y + dy, xx = x + dx; if (yy < 0 || yy >= H || xx < 0 || xx >= W) continue; e += Math.abs(A[y * W + x] - B[yy * W + xx]); n++; } e /= n; if (!best || e < best[0]) best = [e, dy, dx]; } return best; };
const A = await shot(); await touch("touchStart", [[cx, cy]]); for (let i = 1; i <= 10; i++) { await touch("touchMove", [[cx + i * 10, cy + i * 6]]); await page.waitForTimeout(25); }
// T3 held still: finger stays down, no movement
await page.waitForTimeout(350); const held2 = await st(); res.heldPanMovingAt350ms = held2.moving; const b3 = await page.evaluate(() => 0);
if (held2.moving) bad.push("held-still pan keeps cameraMoving=true (sharp lock waits for lift-off)");
const B = await shot(); const sh = shift(A, B); res.panTracking = { fingerDelta: [100, 60], contentShift: [sh[2], sh[1]] };
// content should move WITH the finger (content point at (x) appears at x+dx): registration shift of B relative to A
if (Math.abs(sh[2] - 100) > 4 || Math.abs(sh[1] - 60) > 4) bad.push(`pan does not track finger 1:1: content moved (${sh[2]},${sh[1]}) for finger (100,60)`);
await touch("touchEnd", []); await settle();
// T4 zoomed: a horizontal drag pans and must NOT change the theme
const themeOf = () => page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.target);
const th0 = await themeOf(); await touch("touchStart", [[cx - 150, cy]]); for (let i = 1; i <= 12; i++) { await touch("touchMove", [[cx - 150 + i * 25, cy]]); await page.waitForTimeout(20); } await touch("touchEnd", []); await settle(); const th1 = await themeOf();
res.zoomedHorizontalDrag = { themeBefore: th0, themeAfter: th1 }; if (th1 !== th0) bad.push("horizontal drag while zoomed changed the theme (should pan)");
// T6 pinch back out to 1x releases the sharp layer and recentres
await touch("touchStart", [[cx - 80, cy], [cx + 80, cy]]); for (let i = 1; i <= 14; i++) { const half = 80 - (68 * i) / 14; await touch("touchMove", [[cx - half, cy], [cx + half, cy]]); await page.waitForTimeout(30); } await touch("touchEnd", []); await settle(); const out = await st();
res.pinchOut = { zoom: +out.zoom.toFixed(3), detailWidth: out.w }; if (out.zoom > 1.05) bad.push(`pinch-out did not return to ~1x (zoom ${out.zoom.toFixed(2)})`); if (out.zoom <= 1.02 && out.w) bad.push("sharp layer not released at 1x");
// T5 at 1x a horizontal swipe changes theme (existing feature)
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await settle(); const t50 = await themeOf(); await touch("touchStart", [[cx + 200, cy + 300]]); for (let i = 1; i <= 12; i++) { await touch("touchMove", [[cx + 200 - i * 30, cy + 300]]); await page.waitForTimeout(20); } await touch("touchEnd", []); await page.waitForTimeout(1500); const t51 = await themeOf();
res.swipeAt1x = { themeBefore: t50, themeAfter: t51 };
const f = await page.evaluate(() => { window.__t.stop = true; return window.__t; }); res.blankFrames = f.blank; if (f.blank) bad.push("blank frames during touch interaction");
console.log(JSON.stringify(res)); await ctx.close(); await browser.close(); server.kill();
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
