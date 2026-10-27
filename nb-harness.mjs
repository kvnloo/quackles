// Blind no-blue harness (reviewer's own; not part of the repo). Serves out/ at /quackles/preview/gigapixel-single/,
// a same-origin stub "other preview" at /quackles/other/, assets from the real asset site (or local clone with LOCAL=1).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import sharp from "sharp";
import { chromium } from "playwright-core";

const OUT = process.env.OUT_DIR || "out";
const BASE = "/quackles/preview/gigapixel-single";
const PORT = +(process.env.PORT || 45977);
const ORIGIN_URL = process.env.TARGET || `http://127.0.0.1:${PORT}${BASE}/`;
const OTHER = process.env.OTHER || `http://127.0.0.1:${PORT}/quackles/other/`;
const SEEDPAGE = process.env.SEEDPAGE || OTHER;
const SEEDJS = `for (const s of [localStorage, sessionStorage]) for (const [k, v] of Object.entries({"quackles.theme": "blue", "quackles-theme": "2", theme: "blue", "quackles.scene": "blue", "quackles:theme": "2", tone: "blue", "quackles.sequence.theme": "2", "quackles.preview": "scenes-gigapixel"})) s.setItem(k, v); document.cookie = "theme=blue; path=/"; caches.open("quackles-sequence-preview").then(c => c.put(location.origin + "/fake/blue/p0000000-1024.webp", new Response("x"))).then(() => "ok")`;
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
const FOREIGN = /\/(day|blue|dark|night|hidden|mushroom)\//;
const LOGDIR = process.env.LOGDIR || "nb-logs";
fs.mkdirSync(LOGDIR, { recursive: true });

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".txt": "text/plain", ".svg": "image/svg+xml" };
const STUB = `<!doctype html><title>other</title><body style="background:#888"><script>
for (const s of [localStorage, sessionStorage]) for (const [k, v] of Object.entries({
 "quackles.theme": "blue", "quackles-theme": "2", theme: "blue", "quackles.scene": "blue", "quackles:theme": "2", tone: "blue",
 "quackles.sequence.theme": "2", "quackles.preview": "scenes-gigapixel", "quackles.haptics": "off" })) s.setItem(k, v);
document.cookie = "theme=blue; path=/"; document.cookie = "quackles-theme=2; path=/";
caches.open("quackles-sequence-preview").then(c => c.put(location.origin + "/fake/blue/p0000000-1024.webp", new Response("x"))).then(() => document.title = "seeded");
</script>other preview (seeded blue)</body>`;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/quackles/other")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(STUB); }
  let file = null;
  if (u.pathname.startsWith(BASE)) { file = path.join(OUT, u.pathname.slice(BASE.length)); if (file.endsWith("/")) file += "index.html"; }
  if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "max-age=600" });
  fs.createReadStream(file).pipe(res);
});
if (!process.env.TARGET) await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

const INIT = `(() => {
  const FOREIGN = ${FOREIGN};
  const V = window.__nb = { paints: [], allPaints: 0, chrome: [], fallback: [], theme: [], imgs: [], frames: 0, pageshow: [], vis: [] };
  addEventListener("pageshow", (e) => V.pageshow.push(e.persisted));
  document.addEventListener("visibilitychange", () => V.vis.push(document.visibilityState));
  const born = new WeakMap(), bm = new WeakMap();
  const respUrl = new WeakMap(); if (window.Cache) { const cm = Cache.prototype.match;
  Cache.prototype.match = async function (req, ...rest) { const r = await cm.call(this, req, ...rest); if (r) respUrl.set(r, "cache:" + (typeof req === "string" ? req : req.url)); return r; }; }
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); const u = this.url || respUrl.get(this); if (u) born.set(b, u); return b; };
  const cib = window.createImageBitmap;
  window.createImageBitmap = async function (src, ...rest) { const b = await cib.call(this, src, ...rest);
    const url = src instanceof Blob ? born.get(src) : src instanceof HTMLImageElement ? src.currentSrc : (bm.get(src) || null);
    if (url) bm.set(b, url); else if (src instanceof Blob) bm.set(b, "blob-unknown:" + src.type + ":" + src.size); return b; };
  const draw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (src, ...rest) { V.allPaints++;
    const url = bm.get(src) || (src instanceof HTMLImageElement ? src.currentSrc : null);
    if (url && (FOREIGN.test(url) || url.startsWith("blob-unknown"))) V.paints.push(url);
    return draw.call(this, src, ...rest); };
  const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");
  Object.defineProperty(HTMLImageElement.prototype, "src", { ...desc, set(v) { if (FOREIGN.test(String(v))) V.imgs.push(String(v)); return desc.set.call(this, v); } });
  const BLUE = ["#0000f2", "#0000c2", "rgb(0, 0, 242)", "rgb(0, 0, 194)"];
  const tick = () => { V.frames++;
    const cs = getComputedStyle(document.documentElement);
    const vals = { paper: cs.getPropertyValue("--paper").trim(), deep: cs.getPropertyValue("--paper-deep").trim(), html: cs.backgroundColor, tone: document.documentElement.dataset.tone || "" };
    if (document.body) vals.body = getComputedStyle(document.body).backgroundColor;
    for (const sel of [".poster-stage", ".poster-frame", ".experience-shell"]) { const el = document.querySelector(sel); if (el) { const c = getComputedStyle(el); vals[sel] = c.backgroundImage + " " + c.backgroundColor; } }
    for (const [k, v] of Object.entries(vals)) if (BLUE.some((b) => String(v).toLowerCase().includes(b)) || (k === "tone" && v && v !== "white")) V.chrome.push(V.frames + ":" + k + "=" + String(v).slice(0, 80));
    for (const img of document.querySelectorAll("img")) if (img.currentSrc && FOREIGN.test(img.currentSrc)) V.fallback.push(V.frames + ":" + img.currentSrc);
    const s = window.__QUACKLES_SEQUENCE__?.getState?.().current;
    if (s && (s.theme !== 1 || s.target !== 1 || s.presented !== 1)) V.theme.push(V.frames + ":" + s.theme + "/" + s.target + "/" + s.presented);
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
})();`;

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"], ...(process.env.BF ? { ignoreDefaultArgs: ["--disable-back-forward-cache"] } : {}) });
const PHONE = { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true };
const results = {};

async function blueFraction(buf) {
  const { data, info } = await sharp(buf).resize(120).raw().toBuffer({ resolveWithObject: true });
  let n = 0, t = 0; for (let i = 0; i < data.length; i += info.channels) { t++; const [r, g, b] = [data[i], data[i + 1], data[i + 2]]; if (b > 150 && r < 70 && g < 70) n++; }
  return n / t;
}

async function scenario(name, { ctxOpts = PHONE, seed = true, url = ORIGIN_URL, net = null, cpu = 1, reduced = false, body }) {
  if (ONLY && !ONLY.includes(name)) return;
  const ctx = await browser.newContext({ ...ctxOpts, ...(reduced ? { reducedMotion: "reduce" } : {}) });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page); const extra0 = {};
  await cdp.send("Network.enable");
  const reqs = [], cached = new Set(), errors = [];
  cdp.on("Network.requestWillBeSent", (e) => reqs.push({ t: Date.now(), url: e.request.url, type: e.type }));
  cdp.on("Network.requestServedFromCache", (e) => cached.add(e.requestId));
  page.on("pageerror", (e) => errors.push(String(e)));
  const bfNot = []; cdp.on("Page.backForwardCacheNotUsed", (e) => bfNot.push(e.notRestoredExplanations.map((x) => x.reason).join(",")));
  await cdp.send("Page.enable");
  // screencast: every painted frame, blue-area fraction
  const frames = []; let maxBlue = 0, blueFrames = 0, shot = 0;
  cdp.on("Page.screencastFrame", async (f) => { cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    const buf = Buffer.from(f.data, "base64"); const fr = await blueFraction(buf).catch(() => 0); frames.push(fr);
    if (fr > maxBlue) { maxBlue = fr; fs.writeFileSync(`${LOGDIR}/${name}-maxblue.jpg`, buf); }
    if (fr > 0.2) { blueFrames++; if (shot++ < 3) fs.writeFileSync(`${LOGDIR}/${name}-blue-${shot}.jpg`, buf); } });
  if (seed) { await page.goto(SEEDPAGE, { waitUntil: "load" }); await page.waitForTimeout(process.env.TARGET ? 6000 : 300); extra0.seed = await page.evaluate(SEEDJS).catch((e) => String(e)); extra0.seededLS = await page.evaluate(() => Object.keys(localStorage).length); await page.goto("about:blank"); }
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1, maxWidth: 400, maxHeight: 900 });
  if (net) await cdp.send("Network.emulateNetworkConditions", net);
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
  const t0 = Date.now(); reqs.length = 0;
  await page.goto(url, { waitUntil: "commit" });
  const extra = extra0;
  try { await body({ page, cdp, ctx, extra }); } catch (e) { errors.push("harness: " + e.message); }
  await page.waitForTimeout(1000);
  await cdp.send("Page.stopScreencast").catch(() => {});
  const v = await page.evaluate(() => ({ ...window.__nb, state: window.__QUACKLES_SEQUENCE__?.getState?.().current, resources: performance.getEntriesByType("resource").map((e) => e.name), ls: { ...localStorage }, frame: (() => { const f = document.querySelector(".poster-frame"); if (!f) return null; const r = f.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }; })() })).catch((e) => ({ err: String(e) }));
  const foreign = [...new Set(reqs.filter((r) => FOREIGN.test(r.url)).map((r) => r.url))];
  const foreignRes = [...new Set((v.resources || []).filter((u) => FOREIGN.test(u)))];
  const imgReqs = reqs.filter((r) => /\.(webp|png|jpg)/.test(r.url));
  const whiteImg = imgReqs.filter((r) => /\/white\//.test(r.url)).length;
  const r = { ms: Date.now() - t0, requests: reqs.length, imageRequests: imgReqs.length, whiteImageRequests: whiteImg, foreignRequests: foreign, foreignResourceTiming: foreignRes,
    paintsTotal: v.allPaints, foreignPaints: [...new Set(v.paints || [])], foreignImgSrc: v.imgs, fallbackForeignFrames: (v.fallback || []).length, themeFrames: (v.theme || []).slice(0, 5), themeFrameCount: (v.theme || []).length,
    chromeBlue: (v.chrome || []).slice(0, 5), chromeBlueCount: (v.chrome || []).length, rafFrames: v.frames, screencastFrames: frames.length, maxBlueFraction: +maxBlue.toFixed(4), blueFrames, pageshow: v.pageshow, bfNotUsed: bfNot, vis: v.vis, state: v.state, frame: v.frame, errors, extra, err: v.err };
  results[name] = r;
  fs.writeFileSync(`${LOGDIR}/${name}-requests.json`, JSON.stringify(reqs, null, 0));
  console.log(name, JSON.stringify(r));
  await ctx.close();
}

const ready = (page, t = 60000) => page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: t });
const insp = (page, z, x, y) => page.evaluate(([z, a, b]) => window.__QUACKLES_INSPECTION__?.setTarget(z, a, b), [z, x, y]);
async function touchSpam(page, cdp, n = 6) {
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  for (let k = 0; k < n; k++) {
    const cx = 120 + (k * 47) % 180, cy = 200 + (k * 83) % 400;
    await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 10; i++) { const d = 30 + i * 18; await touch("touchMove", [[cx - d, cy - i], [cx + d, cy + i]]); await page.waitForTimeout(8); }
    await touch("touchEnd", []);
    await touch("touchStart", [[200, 400]]);
    for (let i = 1; i <= 10; i++) { await touch("touchMove", [[200 + ((i * 37) % 120) - 60, 400 + ((i * 53) % 160) - 80]]); await page.waitForTimeout(8); }
    await touch("touchEnd", []);
    await touch("touchStart", [[cx - 200, cy], [cx + 200, cy]]);
    for (let i = 1; i <= 10; i++) { const d = 200 - i * 18; await touch("touchMove", [[cx - d, cy], [cx + d, cy]]); await page.waitForTimeout(8); }
    await touch("touchEnd", []);
  }
}
const FAST3G = { offline: false, latency: 562.5, downloadThroughput: 1.6 * 1024 * 1024 / 8 * 0.9, uploadThroughput: 750 * 1024 / 8 * 0.9 };

await scenario("cold-seeded", { body: async ({ page }) => { await ready(page); await page.waitForTimeout(12000); } });
await scenario("cold-unseeded", { seed: false, body: async ({ page }) => { await ready(page); await page.waitForTimeout(8000); } });
await scenario("warm-reload", { body: async ({ page }) => { await ready(page); await page.waitForTimeout(6000); for (let i = 0; i < 3; i++) { await page.reload({ waitUntil: "commit" }); await ready(page); await page.waitForTimeout(3000); } } });
await scenario("fast3g-cpu4", { net: FAST3G, cpu: 4, body: async ({ page, cdp }) => { await ready(page, 180000); await page.waitForTimeout(8000); await touchSpam(page, cdp, 3); await page.waitForTimeout(5000); } });
await scenario("pinch-pan-spam", { body: async ({ page, cdp }) => { await ready(page); await page.waitForTimeout(3000); await touchSpam(page, cdp, 12); await page.waitForTimeout(4000); } });
await scenario("max-zoom", { body: async ({ page, cdp, extra }) => { await ready(page); await page.waitForTimeout(3000);
  for (const [z, x, y] of [[1000, 0.5, 0.45], [1000, 0, 0], [1000, 1, 1], [64, 0.3, 0.7], [0.01, 0.5, 0.5], [-5, 0.5, 0.5], [1e9, 0.5, 0.5], [1, 0.5, 0.5], [32, 0.55, 0.4]]) { await insp(page, z, x, y); await page.waitForTimeout(1500); }
  extra.inspection = await page.evaluate(() => { try { return JSON.stringify(window.__QUACKLES_INSPECTION__?.getState?.() ?? Object.keys(window.__QUACKLES_INSPECTION__ || {})).slice(0, 300); } catch (e) { return String(e); } });
  await touchSpam(page, cdp, 4); await insp(page, 1, 0.5, 0.5); await page.waitForTimeout(3000); } });
await scenario("rotate-resize", { body: async ({ page, extra }) => { await ready(page); await page.waitForTimeout(3000); extra.frames = [];
  for (const [w, h] of [[915, 412], [412, 915], [360, 640], [1920, 1080], [800, 600], [600, 1400], [1280, 720], [412, 915]]) { await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(1500);
    extra.frames.push(await page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return [innerWidth, innerHeight, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; })); } } });
await scenario("hide-show", { body: async ({ page, cdp, ctx, extra }) => { await ready(page); await page.waitForTimeout(3000);
  const other = await ctx.newPage(); await other.goto("about:blank"); await other.bringToFront(); await page.waitForTimeout(2000);
  await page.bringToFront(); await page.waitForTimeout(2000);
  await cdp.send("Page.setWebLifecycleState", { state: "frozen" }); await page.waitForTimeout(1500); await cdp.send("Page.setWebLifecycleState", { state: "active" }); await page.waitForTimeout(3000);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); Object.defineProperty(document, "hidden", { value: false, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(3000); await other.close(); } });
await scenario("bfcache", { body: async ({ page, extra }) => { await ready(page); await page.waitForTimeout(4000);
  for (let i = 0; i < 3; i++) { await page.goto(OTHER, { waitUntil: "load" }); await page.waitForTimeout(800); await page.goBack({ waitUntil: "commit" }); await page.waitForTimeout(3000); }
  await page.goForward({ waitUntil: "commit" }); await page.waitForTimeout(1000); await page.goBack({ waitUntil: "commit" }); await page.waitForTimeout(3000);
  extra.lastPageshow = await page.evaluate(() => window.__nb?.pageshow); } });
await scenario("reduced-motion", { reduced: true, body: async ({ page, cdp }) => { await ready(page); await page.waitForTimeout(6000); await touchSpam(page, cdp, 3); await page.waitForTimeout(3000); } });
for (const q of ["?theme=blue", "?theme=2&scene=blue&tone=blue", "?inspectionCandidates=1&sim=1&pigment=1", "#blue", "?preview=scenes-gigapixel&t=2"])
  await scenario("url" + q.replace(/[^a-z0-9]+/gi, "_"), { url: ORIGIN_URL + q, body: async ({ page, cdp }) => { await ready(page); await page.waitForTimeout(6000); await touchSpam(page, cdp, 2); await page.waitForTimeout(2000); } });

await browser.close(); server.close();
fs.writeFileSync(`${LOGDIR}/summary.json`, JSON.stringify(results, null, 1));
const bad = Object.entries(results).filter(([, r]) => r.foreignRequests.length || r.foreignResourceTiming.length || r.foreignPaints.length || r.foreignImgSrc.length || r.fallbackForeignFrames || r.themeFrameCount || r.chromeBlueCount || r.blueFrames || r.errors.length || !r.whiteImageRequests);
console.log("BAD:", bad.map(([k]) => k));
