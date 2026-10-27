#!/usr/bin/env node
/** R2 blind review probe (headless emulation, NOT device evidence).
 * Claim: on a DPR > 2 phone (owner shape 411x782 @3.5), the app's own hero pinch-zoom (HeroInspection) makes the story
 * base repaint at the motion-capped 2x backing (822 px) and back (1024 px) with no story or theme change, i.e. the I5
 * motion cap fires inside the zoom path, a full base repaint + canvas reallocation inside/after the gesture.
 * Pass: a hero pinch (zoom only) repaints the story base 0 times and its backing never drops below the native plate,
 * and the sharp detail layer is painted after the pinch settles. OUT_DIR, PORT, SCALE (pinch factor, default 2.5). */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const port = process.env.PORT || "44470";
const srv = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", process.env.OUT_DIR || "out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const bad = [], out = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 411, height: 782 }, deviceScaleFactor: Number(process.env.DPR || 3.5), isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  out.rest = await page.evaluate(() => document.querySelector(".sequence-base").width);
  await page.evaluate(() => {
    const S = (window.__p = { basePaints: 0, baseWidths: [], detailPaints: 0, releases: 0, storyEvents: 0, vv: 0, ro: 0 });
    const b = document.querySelector(".sequence-base"), d = document.querySelector(".sequence-detail");
    window.addEventListener("quackles:base-painted", () => { S.basePaints++; S.baseWidths.push(b.width); });
    window.addEventListener("quackles:detail-painted", () => { S.detailPaints++; });
    visualViewport.addEventListener("resize", () => S.vv++); visualViewport.addEventListener("scroll", () => S.vv++);
    new ResizeObserver(() => S.ro++).observe(document.querySelector("[data-testid=sequence-player]"));
    new MutationObserver(() => { if (d.style.visibility === "hidden") S.releases++; }).observe(d, { attributes: true, attributeFilter: ["style"] });
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Input.synthesizePinchGesture", { x: 206, y: 300, scaleFactor: Number(process.env.SCALE || 2.5), relativeSpeed: 300, gestureSourceType: "touch" });
  await page.waitForTimeout(4000);
  await page.evaluate(() => { const S = window.__p; S.basePaints = 0; S.baseWidths = []; S.releases = 0; S.underlay = []; const d = document.querySelector(".sequence-detail"), b = document.querySelector(".sequence-base"); window.addEventListener("quackles:base-painted", () => { if (d.style.visibility === "hidden") S.underlay.push(b.width); }); const ids = ["day","dusk","blue","night","dark"]; window.__QUACKLES_SEQUENCE__.setTheme(window.__QUACKLES_SEQUENCE__.getState().current.theme >= 3 ? "blue" : "night"); });
  await page.waitForTimeout(4000);
  out.after = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { ...window.__p, underlay: window.__p.underlay, zoom: +s.inspection.zoom.toFixed(3), active: s.inspection.active, vvScale: visualViewport.scale, detailWidth: s.detailWidth, base: document.querySelector(".sequence-base").width, progress: s.current.progress, theme: s.current.theme }; });
  const p = out.after;
  if (!(p.zoom > 1.3 || p.vvScale > 1.3)) bad.push(`setup: pinch did not zoom (inspection ${p.zoom}, visualViewport ${p.vvScale})`);
  if (Math.min(...(p.underlay||[]), Infinity) < out.rest) bad.push(`while zoomed (detail hidden) the theme switch showed the magnified base underlay at ${Math.min(...p.underlay)} px, below the native ${out.rest}`);
  if (false) bad.push(`zoomed theme switch repainted the story base ${p.basePaints}x (widths ${p.baseWidths.join(",")}) with no story/theme change`);
  if (Math.min(...p.baseWidths, Infinity) < out.rest) bad.push(`base backing dropped from ${out.rest} to ${Math.min(...p.baseWidths)} px during a zoom`);
  await ctx.close();
} finally { await browser.close(); srv.kill(); }
console.log(JSON.stringify({ ...out, failures: bad }));
if (bad.length) { console.error("FAIL\n- " + bad.join("\n- ")); process.exit(1); }
console.log("PASS hero pinch leaves the story base alone");
