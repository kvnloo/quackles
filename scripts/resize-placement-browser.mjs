#!/usr/bin/env node
/** Regression (found by an adversarial verifier): resizing the viewport while zoomed must keep the sharp layer registered.
 * After each resize the detail canvas rect must equal the rect implied by its data-crop within its parent (+-1 px), and must
 * still cover the hero viewport. OUT_DIR(+BASE_PATH). Desktop Chromium; a mobile URL-bar resize is a height-only change (included). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45100", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
const settle = async () => { let last = -1, since = Date.now(), calm = 0; for (let i = 0; i < 150; i++) { const s = await page.evaluate(() => { const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { d: q.drawCount, m: c.cameraMoving, dz: Math.abs(c.zoom - c.targetZoom) }; }); if (s.d !== last) { last = s.d; since = Date.now(); } calm = !s.m && s.dz < 1e-3 && Date.now() - since > 900 ? calm + 1 : 0; if (calm >= 5) return; await page.waitForTimeout(80); } };
const geom = () => page.evaluate(() => { const d = document.querySelector(".sequence-detail"), par = d.offsetParent, pr = par.getBoundingClientRect(), dr = d.getBoundingClientRect(); const [x, y, w, h] = d.dataset.crop.split(",").map(Number);
  const ex = { l: pr.left + x * pr.width, t: pr.top + y * pr.height, r: pr.left + (x + w) * pr.width, b: pr.top + (y + h) * pr.height }; const host = document.querySelector(".sequence-camera").parentElement.getBoundingClientRect();
  return { err: [dr.left - ex.l, dr.top - ex.t, dr.right - ex.r, dr.bottom - ex.b].map((v) => +v.toFixed(2)), visible: getComputedStyle(d).visibility, w: window.__QUACKLES_SEQUENCE__.getState().detailWidth, host: [host.width, host.height].map((v) => Math.round(v)) }; });
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.44, 0.28)); await settle();
const res = { initial: await geom() }, bad = []; const SIZES = [[1100, 700], [800, 600], [1920, 1080], [1440, 840], [1440, 900]];
for (const [w, h] of SIZES) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(400); await settle(); await page.waitForTimeout(600); const g = await geom(); res[`${w}x${h}`] = g;
  if (g.visible === "visible" && g.err.some((e) => Math.abs(e) > 1)) bad.push(`${w}x${h}: detail rect off by ${JSON.stringify(g.err)} px`); if (!g.w) bad.push(`${w}x${h}: detail lost`); }
console.log(JSON.stringify(res)); await browser.close(); server.kill();
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
