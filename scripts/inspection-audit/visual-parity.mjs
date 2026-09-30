#!/usr/bin/env node
/** Build-vs-build visual parity at identical settled camera states (desktop Chromium, tiles from local clone).
 * Usage: A=<static export> B=<static export> SHOTS=<dir> node visual-parity.mjs  -> JSON; exit 1 if any state exceeds tolerance.
 * Tolerance derived from the measured same-build noise floor (see TOL). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
import sharp from "sharp";
// Tolerance = measured noise floor of the SAME build vs itself (issue-43-evidence/visual-parity-floor): max meanAbs 0.3035, max fracOver8 0.0096 over 3 runs x 7 states.
const TOL = { meanAbs: 0.35, fracOver8: 0.011 };
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const STATES = [["z1", 1, 0.5, 0.5], ["z2", 2, 0.44, 0.28], ["z4", 4, 0.44, 0.28], ["z6", 6, 0.44, 0.28], ["z6-pan-small", 6, 0.47, 0.30], ["z6-pan-large", 6, 0.62, 0.42], ["z8", 8, 0.44, 0.28]];
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
async function capture(dir, port) {
  const server = spawn("node", ["scripts/static-server.mjs", "--port", String(port), "--directory", dir], { stdio: "ignore" });
  await new Promise((r) => setTimeout(r, 1500));
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const reqs = { n: 0 };
  await page.route("**/quackles-assets/**", async (route) => {
    const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); reqs.n++;
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
  });
  await page.goto(`http://127.0.0.1:${port}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
  await page.waitForTimeout(2500);
  const out = {};
  for (const [name, z, x, y] of STATES) {
    await page.evaluate(([zz, xx, yy]) => window.__QUACKLES_INSPECTION__.setTarget(zz, xx, yy), [z, x, y]);
    let last = -1, lastDraw = -1, since = Date.now(), calm = 0;
    // Settled = camera stopped easing AND detail width stable AND camera at target, for several consecutive polls.
    for (let i = 0; i < 200; i++) {
      const st = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { w: q.detailWidth, d: q.drawCount, moving: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom) }; });
      if (st.w !== last || st.d !== lastDraw) { last = st.w; lastDraw = st.d; since = Date.now(); }
      calm = !st.moving && st.dz < 1e-3 && Date.now() - since > 800 ? calm + 1 : 0;
      if (calm >= 6) break; await page.waitForTimeout(80);
    }
    out[name] = { png: await page.screenshot(), detailWidth: last };
  }
  await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await page.close(); server.kill();
  return { out, requests: reqs.n };
}
const A = await capture(process.env.A, 43370), B = await capture(process.env.B, 43371);
const report = { A: { dir: process.env.A, requests: A.requests }, B: { dir: process.env.B, requests: B.requests }, states: {} };
let fail = false;
for (const [name] of STATES) {
  const [x, y] = await Promise.all([sharp(A.out[name].png).removeAlpha().raw().toBuffer(), sharp(B.out[name].png).removeAlpha().raw().toBuffer()]);
  let sum = 0, big = 0; for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); sum += d; if (d > 8) big++; }
  const r = { meanAbs: +(sum / x.length).toFixed(4), fracOver8: +(big / x.length).toFixed(6), detailA: A.out[name].detailWidth, detailB: B.out[name].detailWidth };
  r.pass = r.meanAbs <= TOL.meanAbs && r.fracOver8 <= TOL.fracOver8 && r.detailA === r.detailB; if (!r.pass) fail = true; report.states[name] = r;
  if (process.env.SHOTS) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); fs.writeFileSync(`${process.env.SHOTS}/${name}-A.png`, A.out[name].png); fs.writeFileSync(`${process.env.SHOTS}/${name}-B.png`, B.out[name].png); }
}
console.log(JSON.stringify(report, null, 1)); await browser.close(); process.exit(fail ? 1 : 0);
