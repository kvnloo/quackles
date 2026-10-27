#!/usr/bin/env node
/** FULL-BLEED scene layout (Chromium emulation, NOT physical-device evidence).
 *  Phones (portrait, width-bound): the scene element (.poster-frame) and the painted base canvas start at x = 0 and span the
 *  viewport width (+/-1 px); aspect = the plate aspect (+/-0.5%); the document never scrolls horizontally.
 *  Larger / landscape windows: the largest contain-fit (min(vw, vh x plate aspect)), centred horizontally and vertically,
 *  never cropped or distorted. The HUD box equals the scene box (it never shrinks the image).
 *  Inspection: on a phone and a desktop size, setTarget(4x) must paint detail tiles beyond the plate across the frame.
 *  OUT_DIR (+BASE_PATH), PORT, ASSETS. Exits 1 on any miss. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45942", base = process.env.BASE_PATH || "";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);
// [width, height, dpr, mobile, kind]. "phone" = width-bound full bleed; "contain" = largest contain-fit, centred.
const SIZES = [
  [412, 915, 3.5, true, "phone"], [390, 844, 3, true, "phone"], [360, 800, 3, true, "phone"], [430, 932, 2.6, true, "phone"],
  [1440, 900, 1, false, "contain"], [1920, 1080, 1, false, "contain"],
  [820, 1180, 2, true, "contain"], // tablet portrait / phone with Chrome page zoom: width-bound above 700 px
  [915, 412, 3.5, true, "contain"], [667, 375, 2, true, "contain"], // phone landscape (above / below 700 px)
  [980, 2177, 2.6, true, "contain"], // Chrome "Desktop site" on a 412 px phone: 980 px layout width, width-bound
];
const INSPECT = new Set(["412x915", "1440x900"]);

const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const bad = [], rows = [];
try {
  for (const [vw, vh, dpr, mobile, kind] of SIZES) {
    const key = `${vw}x${vh}`;
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, isMobile: mobile, hasTouch: mobile });
    const page = await ctx.newPage();
    await page.route("**/quackles-assets/**", async (route) => {
      const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" }).catch(() => {});
      await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }).catch(() => {});
    });
    await page.goto(`http://127.0.0.1:${port}${base}/`);
    await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; };
      const canvas = document.querySelector(".sequence-base");
      return { iw: innerWidth, ih: innerHeight, scrollW: document.scrollingElement.scrollWidth, frame: box(".poster-frame"), base: box(".sequence-base"), hud: box(".scene-hud"), plate: canvas.width && canvas.height ? canvas.height / canvas.width : null };
    });
    const aspect = m.plate ?? 1.5, f = m.frame, b = m.base, row = { size: key, kind, frame: [f.left, f.top, f.width, f.height].map((v) => +v.toFixed(1)), plateAspect: +aspect.toFixed(4), scrollW: m.scrollW };
    const miss = (what) => bad.push(`${key}: ${what}`);
    const near = (a, c, tol) => Math.abs(a - c) <= tol;
    for (const [name, r] of [["frame", f], ["base", b]]) {
      if (!near(r.height / r.width, aspect, aspect * 0.005)) miss(`${name} aspect ${(r.height / r.width).toFixed(4)} != plate ${aspect.toFixed(4)}`);
    }
    if (!near(b.left, f.left, 1) || !near(b.width, f.width, 1) || !near(b.top, f.top, 1) || !near(b.height, f.height, 1)) miss("painted base does not fill the scene box");
    if (m.hud && (!near(m.hud.width, f.width, 1) || !near(m.hud.height, f.height, 1))) miss("HUD box differs from the scene box");
    if (m.scrollW > m.iw) miss(`document scrolls horizontally (${m.scrollW} > ${m.iw})`);
    if (kind === "phone") {
      if (!near(f.left, 0, 1)) miss(`frame left ${f.left.toFixed(1)} != 0`);
      if (!near(f.width, m.iw, 1)) miss(`frame width ${f.width.toFixed(1)} != viewport ${m.iw}`);
    } else {
      const w = Math.min(m.iw, m.ih / aspect), h = w * aspect;
      row.expect = [+((m.iw - w) / 2).toFixed(1), +((m.ih - h) / 2).toFixed(1), +w.toFixed(1), +h.toFixed(1)];
      if (!near(f.width, w, 1) || !near(f.height, h, 1)) miss(`frame ${f.width.toFixed(1)}x${f.height.toFixed(1)} is not the contain-fit ${w.toFixed(1)}x${h.toFixed(1)}`);
      if (!near(f.left, (m.iw - w) / 2, 1) || !near(f.top, (m.ih - h) / 2, 1)) miss(`frame at ${f.left.toFixed(1)},${f.top.toFixed(1)} is not centred`);
    }
    if (INSPECT.has(key)) {
      await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.5, 0.45));
      await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__.getState().detailWidth > 1024, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      const d = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(), el = document.querySelector(".sequence-detail"), r = el.getBoundingClientRect(), fr = document.querySelector(".poster-frame").getBoundingClientRect(); return { width: s.detailWidth, visible: el.style.visibility === "visible", covers: r.left <= fr.left + 1 && r.right >= fr.right - 1 && r.top <= fr.top + 1 && r.bottom >= fr.bottom - 1, zoom: window.__QUACKLES_INSPECTION__.getState().zoom }; });
      row.inspect = d;
      if (!(d.width > 1024 && d.visible && d.covers && d.zoom > 3.9)) miss(`inspection at 4x did not paint detail across the frame (${JSON.stringify(d)})`);
    }
    rows.push(row);
    await ctx.close();
  }
} finally { await browser.close(); server.kill(); }
for (const row of rows) console.log(JSON.stringify(row));
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
console.log("full-bleed ok");
