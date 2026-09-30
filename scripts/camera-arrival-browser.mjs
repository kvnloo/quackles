#!/usr/bin/env node
/** Camera arrival smoothness: per-frame translation of the camera transform through the end of the ease. The last steps must not contain
 * a jump (a snap to the exact target must be sub-pixel). Reports the largest per-frame step in the final 12 frames and the final-frame step
 * at 4x/8x from several routes. OUT_DIR(+BASE_PATH). Desktop Chromium; not device evidence. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45200", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const CASES = [[4, 0.44, 0.28, []], [8, 0.44, 0.28, []], [8, 0.44, 0.28, [[9, 0.5, 0.5]]], [8, 0.7, 0.6, []], [6, 0.3, 0.7, [[2, 0.5, 0.5]]], [24, 0.44, 0.28, []], [12, 0.2, 0.8, [[3, 0.5, 0.5]]]]; // 24 -> clamps to maxZoom (19.3)
const out = []; let worst = 0; let idleDone = false;
for (const [z, fx, fy, pre] of CASES) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
  const settle = async () => { let calm = 0; for (let i = 0; i < 150; i++) { const s = await page.evaluate(() => { const c = window.__QUACKLES_INSPECTION__.getState(); return { m: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom) }; }); calm = !s.m && s.dz < 1e-3 ? calm + 1 : 0; if (calm >= 8) return; await page.waitForTimeout(60); } };
  for (const [a, b, c] of pre) { await page.evaluate(([x, y, w]) => window.__QUACKLES_INSPECTION__.setTarget(x, y, w), [a, b, c]); await settle(); }
  await page.evaluate(() => { const cam = document.querySelector(".sequence-camera"); const f = window.__ca = { rows: [], stop: false }; const t = () => { const m = new DOMMatrixReadOnly(getComputedStyle(cam).transform); const c = window.__QUACKLES_INSPECTION__.getState(); f.rows.push([m.a, m.e, m.f, c.cameraMoving ? 1 : 0]); if (!f.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
  await page.evaluate(([x, y, w]) => window.__QUACKLES_INSPECTION__.setTarget(x, y, w), [z, fx, fy]); await settle(); await page.waitForTimeout(400);
  const rows = await page.evaluate(() => { window.__ca.stop = true; return window.__ca.rows; }); await page.close();
  // steps between consecutive frames (translation magnitude, screen px)
  const steps = []; for (let i = 1; i < rows.length; i++) steps.push(Math.hypot(rows[i][1] - rows[i - 1][1], rows[i][2] - rows[i - 1][2]));
  // The snap happens ~40 frames AFTER cameraMoving goes false: take the largest step over every frame after the last moving frame
  // (measuring only the last "moving" frame missed it - a mutation with a real 1.65 px snap passed).
  let last = rows.findLastIndex((r) => r[3] === 1); const after = steps.slice(last); const tail = steps.slice(Math.max(0, last - 12), last + 2); const finalStep = Math.max(0, ...after); const maxTail = Math.max(...tail);
  worst = Math.max(worst, finalStep); out.push({ target: [z, fx, fy], pre: pre.length, lastMovingFrame: last, tailSteps: tail.map((v) => +v.toFixed(2)), finalStepPx: +finalStep.toFixed(2), maxTailStepPx: +maxTail.toFixed(2) });
}
console.log(JSON.stringify({ worstFinalStepPx: +worst.toFixed(2), cases: out.map((c) => ({ target: c.target, pre: c.pre, finalStepPx: c.finalStepPx })) }));
// idle render loop: a tiny zoom target (1.0001-1.0006: stored zoom pinned at 1) must not keep the rAF loop hot
const idle = await (async () => { const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); await ctx.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__raf++; return o(cb); }; });
  const pg = await ctx.newPage(); await pg.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await pg.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await pg.waitForTimeout(2200);
  const count = async () => { const a = await pg.evaluate(() => window.__raf); await pg.waitForTimeout(2000); return (await pg.evaluate(() => window.__raf)) - a; }; // ALL rAF requests in 2 s, app included
  const rest = await count(); await pg.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1.0004, 0.3, 0.3)); await pg.waitForTimeout(1500); const tiny = await count(); await ctx.close(); return { rest, tiny }; })();
console.log(JSON.stringify({ idleRaf2s: idle })); await browser.close(); server.kill();
if (worst > 1.0) { console.error(`FAIL: camera arrival jumps ${worst.toFixed(2)} px in a single frame after motion stops (limit 1.0)`); process.exit(1); }
if (idle.tiny > idle.rest * 1.3) { console.error(`FAIL: tiny zoom target keeps the rAF loop hot (${idle.tiny} vs ${idle.rest} at rest per 2 s)`); process.exit(1); }
