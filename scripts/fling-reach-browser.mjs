#!/usr/bin/env node
/** Fling reach + settle on a phone viewport (412x915, DPR 2.6, isMobile, hasTouch), and desktop wheel tracking.
 * CDP touch with explicit event timestamps (deterministic release velocity; factory-scroll-model.md §3). Chromium's
 * headless fling curve is the desktop ui::FlingCurve, not Android's: compare builds with each other, not with a phone.
 *  R. From the hero (story top), one 300 px flick released at 1,500 / 2,200 / 3,000 px/s. Reported per speed:
 *     reach = page travel / story length (scrollHeight - innerHeight), settleMs = touchEnd -> last painted story change,
 *     restGap = |painted story px - page px| at rest.
 *  W. Desktop 1440x900: 5 wheel notches of 100 px, 60 ms apart, mid-story. wheelLagMs = last wheel event -> last story
 *     change; wheelGapP95 = |published story px - page px| per frame while moving.
 * EXPECT (optional) asserts a variant's contract:
 *  beats  every flick rests on a story beat (|page - beat| <= 2 px) ahead of where it was released, settle <= 1600 ms
 *  short  story length = 2/3 of the 4-viewport story (8/3 viewports +-1%), and the 2,200 px/s flick reaches >= 1.4x native's fraction
 *  boost  momentum (page travel after lift) at each speed is 1.6x..2.0x a native build's (NATIVE_JSON), rest gap <= 2 px
 *  wheel  wheel is native: page = sum of deltas, story on the page every frame (gap p95 <= 2 px), lag <= 50 ms
 * OUT_DIR(+BASE_PATH), PORT. JSON on stdout; exit 1 on failure. */
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44360", expect = process.env.EXPECT || "";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const url = `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`;
const BEATS = [0, 0.4, 0.7, 0.92, 1];
const r3 = (v) => +(+v).toFixed(3), r1 = (v) => +(+v).toFixed(1);
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const sampler = () => {
  const S = window.__fr = { rows: [], tag: "idle" };
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const s = window.__QUACKLES_SEQUENCE__.getState(), max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const at = window.__QUACKLES_SEQUENCE__.scrollAt ?? ((p) => p);
    S.rows.push({ t: performance.now(), tag: S.tag, y: scrollY, story: at(s.rendered?.progress ?? 0) * max, pub: at(s.current.progress) * max });
  };
  const loop = () => { ch.port2.postMessage(0); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
};
async function open(profile) {
  const ctx = await browser.newContext(profile);
  const page = await ctx.newPage();
  await page.route("**/quackles-assets/**", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto(url);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
  await page.waitForTimeout(2500);
  await page.evaluate(sampler);
  return { ctx, page, cdp: await ctx.newCDPSession(page) };
}
const res = { reach: [], wheel: null }, bad = [];

// R: flicks from the story top.
{
  const { ctx, page, cdp } = await open({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 16; SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
  const geo = await page.evaluate(() => ({ vh: innerHeight, max: document.documentElement.scrollHeight - innerHeight }));
  res.storyPx = geo.max; res.storyViewports = r3(geo.max / geo.vh);
  for (const v of [1500, 2200, 3000]) {
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); });
    await page.waitForTimeout(1500);
    await page.evaluate((tag) => { window.__fr.tag = tag; }, `v${v}`);
    const dist = 300, n = 12, dt = dist / v / n, x = 206, y0 = 690;
    let ts = Date.now() / 1000;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }], timestamp: ts });
    for (let i = 1; i <= n; i++) { ts += dt; await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - (dist * i) / n }], timestamp: ts }); }
    const tLift = await page.evaluate(() => performance.now());
    const yLift = await page.evaluate(() => scrollY);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: ts + 0.001 });
    await page.waitForTimeout(4000);
    const rs = await page.evaluate((tag) => window.__fr.rows.filter((r) => r.tag === tag), `v${v}`);
    await page.evaluate(() => { window.__fr.tag = "idle"; window.__fr.rows = []; });
    let stop = rs[0].t; for (let i = rs.length - 1; i > 0; i--) if (Math.abs(rs[i].story - rs[i - 1].story) > 0.5) { stop = rs[i].t; break; }
    const end = rs.at(-1);
    const row = { v, reach: r3((end.y - rs[0].y) / geo.max), travelPx: r1(end.y - rs[0].y), coastPx: r1(end.y - yLift), releasedAt: r3(yLift / geo.max), settleMs: Math.round(stop - tLift), restGap: r1(Math.abs(end.story - end.y)) };
    const at = await page.evaluate((b) => b.map((p) => (window.__QUACKLES_SEQUENCE__.scrollAt ?? ((x) => x))(p)), BEATS);
    row.restBeat = BEATS.find((_, i) => Math.abs(at[i] * geo.max - end.y) <= 2) ?? null;
    res.reach.push(row);
    if (row.restGap > 2) bad.push(`v${v}: story rests ${row.restGap} px from the page`);
    if (expect === "beats") {
      if (row.restBeat === null) bad.push(`v${v}: rests at ${row.reach} of the story, not on a beat`);
      else if (!(at[BEATS.indexOf(row.restBeat)] * geo.max > yLift)) bad.push(`v${v}: beat ${row.restBeat} is not ahead of the release point`);
      if (!(row.settleMs <= 1600)) bad.push(`v${v}: settles ${row.settleMs} ms after lift (> 1600)`);
    }
  }
  if (expect === "short") {
    if (Math.abs(res.storyViewports - 8 / 3) > 0.027) bad.push(`story is ${res.storyViewports} viewports long (want 2.667)`);
  }
  if (expect === "boost" || expect === "short") {
    const native = JSON.parse(fs.readFileSync(process.env.NATIVE_JSON, "utf8"));
    for (const row of res.reach) {
      const n0 = native.reach.find((r) => r.v === row.v);
      const ratio = row.coastPx / n0.coastPx; row.coastVsNative = r3(ratio);
      if (expect === "boost" && !(ratio >= 1.6 && ratio <= 2.0)) bad.push(`v${row.v}: momentum ${ratio.toFixed(2)}x native (want 1.6..2.0)`);
      if (expect === "short" && row.v === 2200 && !(row.reach >= 1.4 * n0.reach)) bad.push(`v2200: reach ${row.reach} < 1.4x native ${n0.reach}`);
    }
  }
  await ctx.close();
}

// W: desktop wheel.
{
  const { ctx, page } = await open({ viewport: { width: 1440, height: 900 } });
  await page.mouse.move(720, 450);
  await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, Math.round((document.documentElement.scrollHeight - innerHeight) * 0.3)); });
  await page.waitForTimeout(1500);
  const y0 = await page.evaluate(() => { window.__fr.rows = []; window.__fr.tag = "wheel"; return scrollY; });
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(60); }
  const tLast = await page.evaluate(() => performance.now());
  await page.waitForTimeout(2000);
  const rs = await page.evaluate(() => window.__fr.rows.filter((r) => r.tag === "wheel"));
  let stop = rs[0].t; for (let i = rs.length - 1; i > 0; i--) if (Math.abs(rs[i].pub - rs[i - 1].pub) > 0.5) { stop = rs[i].t; break; }
  const moving = rs.filter((r) => r.t <= stop);
  res.wheel = { travelPx: r1(rs.at(-1).y - y0), wheelLagMs: Math.round(stop - tLast), wheelGapP95: r1(q(moving.map((r) => Math.abs(r.pub - r.y)), 0.95)) };
  if (expect === "wheel") {
    if (Math.abs(res.wheel.travelPx - 500) > 2) bad.push(`wheel moved the page ${res.wheel.travelPx} px for 500 px of deltas`);
    if (!(res.wheel.wheelGapP95 <= 2)) bad.push(`story trails the page during wheel: gap p95 ${res.wheel.wheelGapP95} px`);
    if (!(res.wheel.wheelLagMs <= 50)) bad.push(`story keeps moving ${res.wheel.wheelLagMs} ms after the last wheel event`);
  }
  await ctx.close();
}

console.log(JSON.stringify(res));
for (const b of bad) console.log("FAIL:", b);
await browser.close(); server.kill();
process.exit(bad.length ? 1 : 0);
