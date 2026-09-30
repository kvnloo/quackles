#!/usr/bin/env node
/** M5 scroll state-machine probe (desktop Chromium; not device evidence). Scrolls top->bottom->top at slow/normal/fling speeds with real
 * mouse.wheel and samples EVERY frame: presented frame id/phase/progress, blank frames, non-monotonic frame flips, max progress jump per frame,
 * and whether reversing restores the same frames. OUT_DIR(+BASE_PATH). Tiles from the local clone. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44400", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const SPEEDS = { slow: [40, 90], normal: [110, 40], fling: [420, 12] };
const out = {};
for (const [name, [px, ms]] of Object.entries(SPEEDS)) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2500);
  await page.mouse.move(1000, 450);
  await page.evaluate(() => { const f = window.__s = { rows: [], stop: false, blank: 0, frames: 0 }; const vis = (q) => getComputedStyle(document.querySelector(q)).visibility;
    const tick = () => { const q = window.__QUACKLES_SEQUENCE__.getState(); f.frames++; const b = vis(".sequence-base") === "visible", d = vis(".sequence-detail") === "visible"; if (!b && !d) f.blank++;
      const rf = q.rendered && q.rendered.frameId; f.rows.push([rf, +q.current.progress.toFixed(4), scrollY | 0]); if (!f.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  const total = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const downTicks = Math.ceil(total / px), mark = () => page.evaluate(() => window.__s.rows.length);
  const m0 = await mark(); for (let i = 0; i < downTicks; i++) { await page.mouse.wheel(0, px); await page.waitForTimeout(ms); } await page.waitForTimeout(1200);
  const m1 = await mark(); for (let i = 0; i < downTicks + 3; i++) { await page.mouse.wheel(0, -px); await page.waitForTimeout(ms); } await page.waitForTimeout(1500);
  const s = await page.evaluate(() => { window.__s.stop = true; return window.__s; });
  const idx = (id) => (id ? +id.slice(1, 8) : -1);
  const analyse = (rows) => { let flips = 0, maxJump = 0, dir = 0, prevIdx = null; const seq = []; for (const r of rows) { const i = idx(r[0]); if (i !== prevIdx && i >= 0) { seq.push(i); prevIdx = i; } } return { distinctFrames: seq.length, seq: seq.slice(0, 40) }; };
  const down = s.rows.slice(m0, m1), up = s.rows.slice(m1);
  const mono = (seq, sign) => { let bad = 0; for (let i = 1; i < seq.length; i++) if (Math.sign(seq[i] - seq[i - 1]) === -sign) bad++; return bad; };
  const dA = analyse(down), uA = analyse(up);
  let maxDp = 0; for (let i = 1; i < s.rows.length; i++) maxDp = Math.max(maxDp, Math.abs(s.rows[i][1] - s.rows[i - 1][1]));
  const first = s.rows[m0][0], last = s.rows[s.rows.length - 1];
  out[name] = { totalScroll: total, frames: s.frames, blankFrames: s.blank, downNonMonotonic: mono(dA.seq, 1), upNonMonotonic: mono(uA.seq, -1), downFrames: dA.seq.length, upFrames: uA.seq.length, maxProgressJumpPerFrame: +maxDp.toFixed(4), startFrame: first, endFrame: last[0], endProgress: last[1], endScrollY: last[2] };
  await page.close();
}
console.log(JSON.stringify(out, null, 1)); await browser.close(); server.kill();
