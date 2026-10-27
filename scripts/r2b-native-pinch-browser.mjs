#!/usr/bin/env node
/** R2 blind review probe (headless emulation, NOT device evidence).
 * Claim: on a DPR > 2 phone, a native (visual-viewport) pinch on the hero makes the story base repaint at the capped
 * 2x backing and, because native pinch is not "inspecting", releaseDetail() hides the sharp detail layer, which then
 * re-dissolves (fresh lock fade). Before the I5 change the base key did not depend on motion, so a pinch never repainted
 * the base or dropped the detail layer.
 * Expect (pass): during and after a native pinch that is already magnified, 0 base repaints, 0 detail releases, and the
 * base backing never drops below the native plate. OUT_DIR, PORT. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const port = process.env.PORT || "44470";
const srv = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", process.env.OUT_DIR || "out"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const bad = [], out = {};
try {
  const ctx = await browser.newContext({ viewport: { width: 411, height: 782 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  const cdp = await ctx.newCDPSession(page);
  const frame = await page.evaluate(() => { const r = document.querySelector(".sequence-base").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  out.frame = frame;
  // First pinch: zoom the page natively (anchor below the hero frame so the app's own pinch handler is not the target).
  const anchor = { x: Math.round(frame.x + frame.w / 2), y: Math.min(770, Math.round(frame.y + frame.h + 20)) };
  out.anchor = anchor;
  await cdp.send("Input.synthesizePinchGesture", { x: anchor.x, y: anchor.y, scaleFactor: 2.2, relativeSpeed: 400, gestureSourceType: "touch" });
  await page.waitForTimeout(3000);
  out.afterFirst = await page.evaluate(() => ({ scale: visualViewport.scale, base: document.querySelector(".sequence-base").width, detail: document.querySelector(".sequence-detail").width, detailVis: document.querySelector(".sequence-detail").style.visibility, inspecting: window.__QUACKLES_SEQUENCE__.getState().inspection.active, detailWidth: window.__QUACKLES_SEQUENCE__.getState().detailWidth }));
  if (!(out.afterFirst.scale > 1.2)) { bad.push(`setup: native pinch did not zoom (visualViewport.scale ${out.afterFirst.scale})`); }
  // Instrument, then a second, small native pinch / pan while already zoomed.
  await page.evaluate(() => {
    const S = (window.__p = { basePaints: 0, baseWidths: [], detailPaints: 0, releases: 0 });
    const b = document.querySelector(".sequence-base"), d = document.querySelector(".sequence-detail");
    window.addEventListener("quackles:base-painted", () => { S.basePaints++; S.baseWidths.push(b.width); });
    window.addEventListener("quackles:detail-painted", () => { S.detailPaints++; });
    new MutationObserver(() => { if (d.style.visibility === "hidden") S.releases++; }).observe(d, { attributes: true, attributeFilter: ["style"] });
  });
  await cdp.send("Input.synthesizePinchGesture", { x: 206, y: 400, scaleFactor: 1.15, relativeSpeed: 400, gestureSourceType: "touch" });
  await page.waitForTimeout(1500);
  out.during = await page.evaluate(() => ({ ...window.__p, scale: visualViewport.scale, restBase: document.querySelector(".sequence-base").width }));
  const p = out.during;
  if (p.basePaints > 0) bad.push(`native pinch repainted the story base ${p.basePaints}x (widths ${p.baseWidths.join(",")}) with no story/theme change`);
  if (Math.min(...p.baseWidths, Infinity) < out.afterFirst.base) bad.push(`base backing dropped from ${out.afterFirst.base} to ${Math.min(...p.baseWidths)} px under a native pinch (softer magnified plate)`);
  if (p.releases > 0) bad.push(`detail layer released ${p.releases}x during a native pinch`);
  await ctx.close();
} finally { await browser.close(); srv.kill(); }
console.log(JSON.stringify({ ...out, failures: bad }, null, 1));
if (bad.length) { console.error("FAIL\n- " + bad.join("\n- ")); process.exit(1); }
console.log("PASS native pinch keeps base + detail");
