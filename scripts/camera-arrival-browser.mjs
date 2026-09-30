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
const CASES = [[4, 0.44, 0.28, []], [8, 0.44, 0.28, []], [8, 0.44, 0.28, [[9, 0.5, 0.5]]], [8, 0.7, 0.6, []], [6, 0.3, 0.7, [[2, 0.5, 0.5]]]];
const out = []; let worst = 0;
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
  let last = rows.findLastIndex((r) => r[3] === 1); const tail = steps.slice(Math.max(0, last - 12), last + 2); const finalStep = steps[last] ?? 0; const maxTail = Math.max(...tail);
  worst = Math.max(worst, finalStep); out.push({ target: [z, fx, fy], pre: pre.length, lastMovingFrame: last, tailSteps: tail.map((v) => +v.toFixed(2)), finalStepPx: +finalStep.toFixed(2), maxTailStepPx: +maxTail.toFixed(2) });
}
console.log(JSON.stringify({ worstFinalStepPx: +worst.toFixed(2), cases: out })); await browser.close(); server.kill();
if (worst > 1.5) { console.error(`FAIL: camera arrival jumps ${worst.toFixed(2)} px in its final frame (limit 1.5)`); process.exit(1); }
