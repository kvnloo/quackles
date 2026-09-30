#!/usr/bin/env node
/** Copy-reveal contracts (phone viewport 412x915 DPR 2.6; headless Chromium, not device evidence).
 * factory.ai model: no scroll-scrubbed text. A copy block is either shown or hidden by story position; the change
 * plays as a time-based reveal (fade + 20 px rise, ~0.6 s, ease-out) on the compositor (CSS transition of opacity and
 * translate only), so it looks the same at any scroll speed and can run at the display rate.
 *  R1 at rest the copy is never parked at a partial opacity (old scrub: 0.78 at p=.225).
 *  R2 a seek into a beat reveals over time with no further scroll: < 0.5 on the first frame, >= 0.99 within 0.4..0.9 s, monotone.
 *  R3 the running animations are CSS transitions of opacity/translate only.
 *  R4 prefers-reduced-motion: the copy is at its end state on the first frame.
 * OUT_DIR(+BASE_PATH), PORT. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44350";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const res = {}, bad = [];
async function open(reducedMotion) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true, reducedMotion: reducedMotion ? "reduce" : "no-preference" });
  const page = await ctx.newPage();
  await page.route("**/quackles-assets/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
  await page.waitForTimeout(1500);
  return page;
}
const opacity = (page, sel) => page.evaluate((s) => +getComputedStyle(document.querySelector(s)).opacity, sel);
// Seek, then record the copy's opacity every frame for `ms` without touching the scroll again.
const seekAndTrace = (page, p, sel, ms) => page.evaluate(([p, sel, ms]) => new Promise((done) => {
  const el = document.querySelector(sel), rows = []; let t0 = 0;
  window.__QUACKLES_SEQUENCE__.setProgress(p);
  const f = (t) => { t0 ||= t; rows.push([t - t0, +getComputedStyle(el).opacity]); if (t - t0 < ms) requestAnimationFrame(f); else done({ rows, anims: el.getAnimations().map((a) => ({ type: a.constructor.name, prop: a.transitionProperty ?? a.animationName })) }); };
  requestAnimationFrame(f);
}), [p, sel, ms]);

const page = await open(false);
// R1
res.atRest = {};
for (const p of [0.2, 0.225, 0.4, 0.58, 0.72]) {
  await page.evaluate((v) => window.__QUACKLES_SEQUENCE__.setProgress(v), p); await page.waitForTimeout(1200);
  const o = { jump: await opacity(page, ".jump-copy"), explode: await opacity(page, ".explode-copy"), hero: await opacity(page, ".hero-copy") };
  res.atRest[p] = o;
  for (const [k, v] of Object.entries(o)) if (v > 0.01 && v < 0.99) bad.push(`at rest p=${p}: ${k} copy parked at opacity ${v.toFixed(3)} (scrubbed)`);
}
// R2 + R3
await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(0.1)); await page.waitForTimeout(1200);
const tr = await seekAndTrace(page, 0.4, ".jump-copy", 1100);
const first = tr.rows[1]?.[1] ?? tr.rows[0][1], full = tr.rows.find(([, o]) => o >= 0.99);
const mono = tr.rows.every(([, o], i) => i === 0 || o >= tr.rows[i - 1][1] - 1e-3);
res.reveal = { firstFrame: +first.toFixed(3), fullAtMs: full ? Math.round(full[0]) : null, monotone: mono, anims: tr.anims };
if (!(first < 0.5)) bad.push(`jump copy appeared at ${first.toFixed(2)} on the first frame (not a timed reveal)`);
if (!full || full[0] < 400 || full[0] > 900) bad.push(`jump copy reached full opacity at ${full ? Math.round(full[0]) : "never"} ms (want 400..900)`);
if (!mono) bad.push("reveal is not monotone");
if (!tr.anims.length || tr.anims.some((a) => a.type !== "CSSTransition" || !["opacity", "translate", "transform"].includes(a.prop))) bad.push(`reveal is not a compositor CSS transition of opacity/translate: ${JSON.stringify(tr.anims)}`);
await page.context().close();
// R4
const reduced = await open(true);
await reduced.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(0.1)); await reduced.waitForTimeout(800);
const rt = await seekAndTrace(reduced, 0.4, ".jump-copy", 200);
res.reduced = { firstFrame: rt.rows[1]?.[1] ?? rt.rows[0][1] };
if (!(res.reduced.firstFrame >= 0.99)) bad.push(`reduced motion: jump copy at ${res.reduced.firstFrame} on the first frame`);

console.log(JSON.stringify(res));
for (const b of bad) console.log("FAIL:", b);
await browser.close(); server.kill();
process.exit(bad.length ? 1 : 0);
