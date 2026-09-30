#!/usr/bin/env node
/** Seeded input fuzz (desktop Chromium; not device evidence). Random mixes of wheel / pinch / pan / setTarget / theme / resize / scroll /
 * Escape / lifecycle freeze, checking EVERY FRAME: never both canvases hidden, no console/page errors, decoded bytes <= budget,
 * in-flight <= maxActiveJobs; and at the end (after letting everything settle): camera not moving, rAF loop idle (<= 1.3x rest),
 * sharp layer present when zoomed on a tiled theme. Usage: SEED=1 STEPS=60 OUT_DIR=.. node fuzz-browser.mjs  (exit 1 with the seed + action log on failure). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45700", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo", SEED = +(process.env.SEED || 1), STEPS = +(process.env.STEPS || 60);
let s = SEED >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); const pick = (a) => a[Math.floor(rnd() * a.length)];
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true }); await ctx.addInitScript(() => { window.__raf = 0; const o = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = (cb) => { window.__raf++; return o(cb); }; });
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page); const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error" && !/404|Failed to load resource/.test(m.text())) errors.push("console: " + m.text().slice(0, 160)); });
await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
const restRaf = await (async () => { const a = await page.evaluate(() => window.__raf); await page.waitForTimeout(2000); return (await page.evaluate(() => window.__raf)) - a; })();
await page.evaluate(() => { const f = window.__fz = { frames: 0, blank: [], over: [], stop: false }; const vis = (q) => getComputedStyle(document.querySelector(q)).visibility;
  const t = () => { const q = window.__QUACKLES_SEQUENCE__.getState(); f.frames++; if (vis(".sequence-base") !== "visible" && vis(".sequence-detail") !== "visible") f.blank.push(f.frames);
    if (q.cache) { if (q.cache.totalBytes > q.cache.budgetBytes && f.over.length < 3) f.over.push(["decoded", q.cache.totalBytes]); if (q.cache.inflight > q.cache.maxActiveJobs && f.over.length < 3) f.over.push(["inflight", q.cache.inflight]); }
    if (!f.stop) requestAnimationFrame(t); }; requestAnimationFrame(t); });
const log = []; const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });
const themes = ["day", "white", "blue", "dark", "night"]; let vw = 1440, vh = 900;
const ACTIONS = {
  wheelIn: async () => { const x = 450 + rnd() * 560, y = 100 + rnd() * 700; await page.mouse.move(x, y); const n = 1 + Math.floor(rnd() * 12); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, -(60 + rnd() * 240)); await page.waitForTimeout(10 + rnd() * 50); } return `wheelIn ${n}`; },
  wheelOut: async () => { const n = 1 + Math.floor(rnd() * 14); await page.mouse.move(700, 450); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, 60 + rnd() * 240); await page.waitForTimeout(10 + rnd() * 50); } return `wheelOut ${n}`; },
  setTarget: async () => { const z = pick([1, 1.5, 2, 3.7, 6, 8, 12, 24, 1.0004]); const x = rnd(), y = rnd(); await page.evaluate(([a, b, c]) => window.__QUACKLES_INSPECTION__.setTarget(a, b, c), [z, x, y]); return `setTarget ${z} ${x.toFixed(2)},${y.toFixed(2)}`; },
  theme: async () => { const t = pick(themes); await page.evaluate((id) => window.__QUACKLES_SEQUENCE__.setTheme(id), t); return `theme ${t}`; },
  resize: async () => { vw = pick([375, 800, 1100, 1440, 1920]); vh = pick([600, 700, 812, 900, 1080]); await page.setViewportSize({ width: vw, height: vh }); return `resize ${vw}x${vh}`; },
  pinch: async () => { const cx = vw / 2, cy = vh / 2, a = 20 + rnd() * 40, b = 60 + rnd() * 200, out = rnd() < 0.5; await touch("touchStart", [[cx - a, cy], [cx + a, cy]]); for (let i = 1; i <= 8; i++) { const h = a + ((out ? b : -a * 0.5) * i) / 8; await touch("touchMove", [[cx - h, cy], [cx + h, cy]]); await page.waitForTimeout(25); } await touch("touchEnd", []); return `pinch ${out ? "out" : "in"}`; },
  pan: async () => { const cx = vw / 2, cy = vh / 2, dx = (rnd() - 0.5) * 300, dy = (rnd() - 0.5) * 300; await touch("touchStart", [[cx, cy]]); for (let i = 1; i <= 8; i++) { await touch("touchMove", [[cx + (dx * i) / 8, cy + (dy * i) / 8]]); await page.waitForTimeout(20); } if (rnd() < 0.4) await page.waitForTimeout(300); await touch("touchEnd", []); return `pan ${dx | 0},${dy | 0}`; },
  scroll: async () => { await page.mouse.move(vw / 2, vh / 2); const n = 1 + Math.floor(rnd() * 8), d = rnd() < 0.5 ? 1 : -1; for (let i = 0; i < n; i++) { await page.mouse.wheel(0, d * 200); await page.waitForTimeout(30); } return `scroll ${d * n}`; },
  escape: async () => { await page.keyboard.press("Escape"); return "escape"; },
  freeze: async () => { await cdp.send("Page.setWebLifecycleState", { state: "frozen" }); await page.waitForTimeout(200); await cdp.send("Page.setWebLifecycleState", { state: "active" }); return "freeze"; },
};
const names = Object.keys(ACTIONS); let failed = null;
for (let i = 0; i < STEPS && !failed; i++) { const name = pick(names); try { log.push(await ACTIONS[name]()); } catch (e) { log.push(name + " threw " + String(e).slice(0, 80)); } await page.waitForTimeout(rnd() * 350); if (errors.length) failed = "errors during run"; }
// let everything settle: back to hero, camera settled
await page.setViewportSize({ width: 1440, height: 900 });
// programmatic scroll is overridden while Lenis inertia (~1.2 s) is still gliding: wait it out and retry until at the top
for (let i = 0; i < 8; i++) { await page.waitForTimeout(1500); await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" })); await page.waitForTimeout(400); if ((await page.evaluate(() => Math.round(scrollY))) === 0) break; }
await page.waitForTimeout(800); await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("blue")); await page.waitForTimeout(800);
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28)); await page.waitForTimeout(4500);
const end = await page.evaluate(() => { window.__fz.stop = true; const q = window.__QUACKLES_SEQUENCE__.getState(), c = q.inspection; return { blank: window.__fz.blank.length, frames: window.__fz.frames, over: window.__fz.over, moving: c.cameraMoving, zoom: c.zoom, target: c.targetZoom, detailWidth: q.detailWidth, progress: q.current.progress, errors: q.errors.length, failures: q.cache ? q.cache.failures : 0 }; });
const endRaf = await (async () => { const a = await page.evaluate(() => window.__raf); await page.waitForTimeout(2000); return (await page.evaluate(() => window.__raf)) - a; })();
const bad = []; if (end.blank) bad.push(`${end.blank} blank frames (first at frame ${end.blank})`); if (end.over.length) bad.push("budget breach " + JSON.stringify(end.over)); if (errors.length) bad.push(...errors.slice(0, 3)); if (end.errors || end.failures) bad.push(`app errors ${end.errors} failures ${end.failures}`);
if (end.moving) bad.push("camera stuck moving"); if (Math.abs(end.zoom - end.target) > 1e-3) bad.push(`camera not at target ${end.zoom} vs ${end.target}`); if (!end.detailWidth) bad.push("no sharp layer at 4x on Blue after settling"); if (endRaf > restRaf * 1.3) bad.push(`rAF loop still hot at rest (${endRaf} vs ${restRaf}/2s)`);
console.log(JSON.stringify({ seed: SEED, steps: STEPS, frames: end.frames, end, restRaf, endRaf, bad })); if (bad.length) console.error("ACTION LOG:", log.join(" | "));
await browser.close(); server.kill(); process.exit(bad.length ? 1 : 0);
