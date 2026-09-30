#!/usr/bin/env node
/** Flag-off guard for the native simulator (desktop headless Chromium).
 * Without ?sim=1 the site must behave exactly like nightly for normal users:
 *  - zero /sim/ and zero 3D (robot / GLB / HDR / kinematics / studio-set / robot-surface) requests, through the
 *    whole story including sustained down-scroll at the end;
 *  - no simulator global, no Worker, no WebGL canvas;
 *  - first-load JS (encoded bytes of scripts fetched by the load event) within BASELINE + 5 KiB, where BASELINE is
 *    measured the same way from BASELINE_OUT_DIR (a nightly build) or taken from BASELINE_JS_BYTES.
 * With ?sim=1 but before p=0.78 the script set must be identical to flag-off (the gate is in the main bundle).
 * OUT_DIR (+BASE_PATH) or TARGET_URL; PORT; BASELINE_OUT_DIR / BASELINE_PORT; ASSETS. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const SLACK = 5 * 1024;
const servers = [];
const serve = (dir, port) => { servers.push(spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" })); return `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`; };
const target = process.env.TARGET_URL || serve(process.env.OUT_DIR || "out", process.env.PORT || "49420");
const baselineUrl = process.env.BASELINE_OUT_DIR ? serve(process.env.BASELINE_OUT_DIR, process.env.BASELINE_PORT || "49421") : null;
await new Promise((r) => setTimeout(r, servers.length ? 1500 : 0));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function visit(url, { scrollToEnd = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => {
    const NativeWorker = window.Worker; window.__workers = 0;
    window.Worker = class extends NativeWorker { constructor(...a) { super(...a); window.__workers++; } };
  });
  const page = await ctx.newPage();
  await page.route("**/quackles-assets/**", async (route) => {
    const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
  });
  const reqs = []; let loaded = false;
  page.on("requestfinished", async (r) => {
    const entry = { u: new URL(r.url()).pathname, type: r.resourceType(), beforeLoad: !loaded, bytes: 0 };
    reqs.push(entry);
    try { entry.bytes = (await r.sizes()).responseBodySize; } catch { /* ignore */ }
  });
  page.on("load", () => { loaded = true; });
  await page.goto(url, { waitUntil: "load" });
  loaded = true;
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const scripts = reqs.filter((r) => r.type === "script" && r.beforeLoad);
  const out = { url, firstLoadJsBytes: scripts.reduce((a, r) => a + r.bytes, 0), scripts: scripts.map((r) => r.u).sort() };
  if (scrollToEnd) {
    for (const p of [0.3, 0.6, 0.8, 0.95, 1]) { await page.evaluate((v) => window.__QUACKLES_SEQUENCE__.setProgress(v), p); await page.waitForTimeout(900); }
    const box = await page.locator(".poster-frame").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(40); }
    await page.waitForTimeout(3000);
  }
  out.progress = await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.progress);
  out.simOrThreeD = reqs.filter((r) => /\/sim\/|\/robot\/|\.glb|\.hdr|kinematics|studio-set|robot-surface/.test(r.u)).map((r) => r.u);
  out.simGlobal = await page.evaluate(() => "__QUACKLES_SIM__" in window);
  out.workers = await page.evaluate(() => window.__workers);
  out.webglCanvases = await page.evaluate(() => [...document.querySelectorAll("canvas")].filter((c) => { try { return !!(c.getContext("2d") === null); } catch { return true; } }).length);
  out.requests = reqs.length;
  await ctx.close();
  return out;
}

const fail = [];
const R = {};
R.flagOff = await visit(target, { scrollToEnd: true });
if (R.flagOff.simOrThreeD.length) fail.push(`flag-off made sim/3D requests: ${R.flagOff.simOrThreeD.slice(0, 5).join(", ")}`);
if (R.flagOff.simGlobal) fail.push("flag-off exposes __QUACKLES_SIM__");
if (R.flagOff.workers) fail.push(`flag-off created ${R.flagOff.workers} workers`);
if (R.flagOff.webglCanvases) fail.push(`flag-off created ${R.flagOff.webglCanvases} WebGL canvases`);
if (R.flagOff.progress < 0.999) fail.push("story did not reach the end");
if (baselineUrl) R.baseline = await visit(baselineUrl);
const baselineBytes = R.baseline?.firstLoadJsBytes ?? (process.env.BASELINE_JS_BYTES ? Number(process.env.BASELINE_JS_BYTES) : null);
if (baselineBytes == null) fail.push("no baseline: set BASELINE_OUT_DIR (nightly build) or BASELINE_JS_BYTES");
else {
  R.jsDeltaBytes = R.flagOff.firstLoadJsBytes - baselineBytes;
  if (R.jsDeltaBytes > SLACK) fail.push(`first-load JS +${R.jsDeltaBytes} B over baseline (limit ${SLACK})`);
}
R.flagOnEarly = await visit(new URL("?sim=1", target).href);
if (R.flagOnEarly.simOrThreeD.length) fail.push(`?sim=1 before p=0.78 made sim/3D requests: ${R.flagOnEarly.simOrThreeD.slice(0, 5).join(", ")}`);
if (JSON.stringify(R.flagOnEarly.scripts) !== JSON.stringify(R.flagOff.scripts)) fail.push("?sim=1 changed the first-load script set");
for (const k of ["flagOff", "baseline", "flagOnEarly"]) if (R[k]) R[k] = { ...R[k], scripts: R[k].scripts.length };
console.log(JSON.stringify(R, null, 1));
await browser.close(); servers.forEach((s) => s.kill());
if (fail.length) { console.error("FAIL", fail); process.exit(1); }
console.log("PASS sim-budget-browser");
