#!/usr/bin/env node
/** M6 UI stability (desktop Chromium; not device evidence): layout-shift (CLS) + per-frame movement of UI chrome that must stay
 * still during pure zoom / theme change / hover. Reports max per-frame deviation (px) per element per phase.
 * OUT_DIR(+BASE_PATH). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44300", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.addInitScript(() => { window.__cls = { total: 0, entries: [] }; new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls.total += e.value; window.__cls.entries.push({ v: +e.value.toFixed(4), t: Math.round(e.startTime), src: (e.sources || []).map((s) => (s.node && (s.node.className || s.node.nodeName)) + "").slice(0, 2) }); } }).observe({ type: "layout-shift", buffered: true }); });
await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2500);
const SEL = { header: "header", themeSeg: ".theme-seg", heroTitle: "h1", viewfinder: ".inspection-viewfinder, [data-testid=viewfinder], .viewfinder", camera: ".sequence-camera" };
const found = await page.evaluate((S) => Object.fromEntries(Object.entries(S).map(([k, q]) => { const e = document.querySelector(q); const r = e && e.getBoundingClientRect(); return [k, r ? [r.left, r.top, r.width, r.height].map((v) => +v.toFixed(1)) : null]; })), SEL);
console.log("elements:", JSON.stringify(found));
async function phase(name, fn) {
  await page.evaluate((S) => { const f = window.__ui = { S, base: {}, dev: {}, frames: 0, stop: false }; const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
    for (const [k, q] of Object.entries(S)) { f.base[k] = r(q); f.dev[k] = 0; }
    const tick = () => { f.frames++; for (const [k, q] of Object.entries(S)) { const b = r(q), a = f.base[k]; if (a && b) f.dev[k] = Math.max(f.dev[k], ...b.map((v, i) => Math.abs(v - a[i]))); } if (!f.stop) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }, SEL);
  const cls0 = await page.evaluate(() => window.__cls.total); await fn();
  const out = await page.evaluate(() => { window.__ui.stop = true; return { dev: window.__ui.dev, frames: window.__ui.frames, cls: window.__cls.total }; }); out.clsDelta = +(out.cls - cls0).toFixed(4); delete out.cls;
  return [name, out];
}
const results = Object.fromEntries([
  await phase("zoom-in-out", async () => { for (const z of [3, 6, 2, 8, 1]) { await page.evaluate((zz) => window.__QUACKLES_INSPECTION__.setTarget(zz, 0.44, 0.28), z); await page.waitForTimeout(1600); } }),
  await phase("theme-changes", async () => { for (const t of ["day", "blue", "dark", "night", "white", "blue"]) { await page.evaluate((id) => window.__QUACKLES_SEQUENCE__.setTheme(id), t); await page.waitForTimeout(700); } }),
  await phase("hover-and-idle", async () => { for (let i = 0; i < 10; i++) { await page.mouse.move(700 + i * 30, 300 + i * 20); await page.waitForTimeout(120); } await page.waitForTimeout(800); }),
]);
const cls = await page.evaluate(() => window.__cls); console.log(JSON.stringify({ results, totalCLS: +cls.total.toFixed(4), clsEntries: cls.entries.slice(0, 8) }, null, 1));
await browser.close(); server.kill();
