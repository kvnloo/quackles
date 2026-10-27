#!/usr/bin/env node
/** ONLY-WHITE (gigapixel-single; Chromium emulation, NOT physical-device evidence).
 *  A single-scene White preview must never touch another scene. From navigation start until 10 s after load, and through
 *  zoom-in, pans, a touch pinch-out/pan and zoom-out, this gate fails on any of:
 *   - a network request for a non-White plate, tile, pyramid or hidden asset (path segment day|blue|dark|night|hidden),
 *   - a canvas paint (drawImage) of a bitmap decoded from such a URL, or the fallback <img> showing a non-White plate,
 *   - store theme/target/presented != White (index 1) on any frame where the debug hook exists,
 *   - html/body/stage background or --paper / --paper-deep equal to Blue's (#0000f2 / #0000c2) on any frame from the first.
 *  Phone: 412x915 at DPR 3.5, touch. OUT_DIR (+BASE_PATH), PORT, ASSETS (local 1GP clone). Exits 1 on any violation. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45941", base = process.env.BASE_PATH || "";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
const WHITE = 1;
const FOREIGN = /\/(day|blue|dark|night|hidden)\//;

// Installed before any page script: blob/bitmap provenance, paint log, per-frame theme + chrome colour sampling.
const INIT = `(() => {
  const FOREIGN = ${FOREIGN};
  const BLUE = ["#0000f2", "#0000c2", "rgb(0, 0, 242)", "rgb(0, 0, 194)"];
  const V = window.__onlyWhite = { paints: [], theme: [], chrome: [], fallback: [], frames: 0 };
  const born = new WeakMap(), bitmapUrl = new WeakMap();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); if (this.url) born.set(b, this.url); return b; };
  const cib = window.createImageBitmap;
  window.createImageBitmap = async function (src, ...rest) {
    const bitmap = await cib.call(this, src, ...rest);
    const url = src instanceof Blob ? born.get(src) : src instanceof HTMLImageElement ? src.currentSrc : null;
    if (url) bitmapUrl.set(bitmap, url);
    return bitmap;
  };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) {
    const url = bitmapUrl.get(src) || (src instanceof HTMLImageElement ? src.currentSrc : null);
    if (url && FOREIGN.test(new URL(url, location.href).pathname)) V.paints.push(url);
    return draw.call(this, src, ...rest);
  };
  const tick = () => {
    V.frames++;
    const root = document.documentElement, cs = getComputedStyle(root);
    const vals = { paper: cs.getPropertyValue("--paper").trim(), deep: cs.getPropertyValue("--paper-deep").trim(), html: cs.backgroundColor };
    if (document.body) vals.body = getComputedStyle(document.body).backgroundColor;
    const stage = document.querySelector(".poster-stage"); if (stage) vals.stage = getComputedStyle(stage).backgroundImage + " " + getComputedStyle(stage).backgroundColor;
    for (const [k, v] of Object.entries(vals)) if (BLUE.some((b) => v.toLowerCase().includes(b))) V.chrome.push(V.frames + ":" + k + "=" + v.slice(0, 60));
    const img = document.querySelector(".poster-plate");
    if (img && img.currentSrc && FOREIGN.test(new URL(img.currentSrc).pathname) && getComputedStyle(img).visibility !== "hidden") V.fallback.push(V.frames + ":" + img.currentSrc);
    const s = window.__QUACKLES_SEQUENCE__?.getState?.().current;
    if (s && (s.theme !== ${WHITE} || s.target !== ${WHITE} || s.presented !== ${WHITE})) V.theme.push(V.frames + ":" + s.theme + "/" + s.target + "/" + s.presented);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();`;

const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const bad = [];
try {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const requests = [], pageErrors = [];
  page.on("request", (req) => requests.push(req.url()));
  page.on("pageerror", (e) => pageErrors.push(String(e)));
  await page.route("**/quackles-assets/**", async (route) => {
    const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" }).catch(() => {});
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${port}${base}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  await page.waitForTimeout(10000); // idle warm-up, floor, tier probes all get their chance
  const insp = (zoom, x, y) => page.evaluate(([z, a, b]) => window.__QUACKLES_INSPECTION__.setTarget(z, a, b), [zoom, x, y]);
  for (const [z, x, y] of [[5, 0.5, 0.45], [5, 0.2, 0.3], [5, 0.8, 0.7], [17, 0.55, 0.4], [17, 0.6, 0.45], [3, 0.4, 0.6], [1, 0.5, 0.5]]) {
    await insp(z, x, y); await page.waitForTimeout(1500);
  }
  // A real touch pinch-out, a one-finger pan while zoomed, and a pinch back in (CDP touch events).
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const pinch = async (from, to) => {
    await touch("touchStart", [[206 - from, 300], [206 + from, 300]]);
    for (let i = 1; i <= 12; i++) { const d = from + (to - from) * i / 12; await touch("touchMove", [[206 - d, 300], [206 + d, 300]]); await page.waitForTimeout(16); }
    await touch("touchEnd", []);
  };
  await pinch(40, 170); await page.waitForTimeout(1500);
  await touch("touchStart", [[200, 320]]);
  for (let i = 1; i <= 15; i++) { await touch("touchMove", [[200 + i * 6, 320 + i * 4]]); await page.waitForTimeout(16); }
  await touch("touchEnd", []); await page.waitForTimeout(1500);
  await pinch(170, 30); await page.waitForTimeout(2000);
  const v = await page.evaluate(() => ({ ...window.__onlyWhite, state: window.__QUACKLES_SEQUENCE__.getState().current }));
  const foreign = [...new Set(requests.filter((u) => FOREIGN.test(new URL(u).pathname)))];
  const tiles = requests.filter((u) => /\/white\/.*\/\d+_\d+\.webp$/.test(u)).length;
  console.log(JSON.stringify({ requests: requests.length, whiteTiles: tiles, foreignRequests: foreign, foreignPaints: [...new Set(v.paints)], fallbackForeignFrames: v.fallback.length, firstFallback: v.fallback.slice(0, 2), themeFrames: v.theme.length, firstTheme: v.theme.slice(0, 3), chromeBlueFrames: v.chrome.length, firstChrome: v.chrome.slice(0, 4), frames: v.frames, final: v.state, pageErrors }, null, 1));
  if (foreign.length) bad.push(`${foreign.length} non-White requests`);
  if (v.paints.length) bad.push(`${v.paints.length} non-White canvas paints`);
  if (v.fallback.length) bad.push(`${v.fallback.length} frames show a non-White fallback plate`);
  if (v.theme.length) bad.push(`${v.theme.length} frames with a non-White store theme`);
  if (v.chrome.length) bad.push(`${v.chrome.length} frame samples with Blue chrome`);
  if (!tiles) bad.push("no White tiles were requested (the gestures did not inspect)");
  if (pageErrors.length) bad.push(`${pageErrors.length} page errors`);
  await ctx.close();
} finally { await browser.close(); server.kill(); }
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
console.log("only-white ok");
