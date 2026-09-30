#!/usr/bin/env node
/** Story-follow contracts on a phone viewport (412x915, DPR 2.6, isMobile, hasTouch). CDP touch input: Chromium emulation,
 * NOT physical-device evidence. Targets are the owner-trace metrics (t3b vs v0 s1) and factory.ai's native scroll model.
 * Every sample is taken AFTER the frame's rAF callbacks (rAF -> MessageChannel), from the progress the player last PAINTED.
 *  S1 drag tracking: during a steady one-finger drag, |painted story px - page scrollY| p95 <= 5 px, and story px per page px in [0.95, 1.05].
 *  S2 no drift: after a slow drag is lifted, the story moves <= 2 px once the page has stopped.
 *  S3 fling settle: after a touch fling, the story stops <= 50 ms after the page stops, at the page's position (<= 2 px).
 *  S4 idle: after 2 s at rest, the scroll driver requests no animation frames (<= 2 rAF requests in the next 2 s, whole page).
 * OUT_DIR(+BASE_PATH), PORT. JSON result on stdout; exit 1 on failure. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44330";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (Linux; Android 16; SM-S938U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36" });
await ctx.addInitScript(() => {
  // Count every rAF request the page makes (the sampler below uses the saved original, so it is not counted).
  const raw = window.requestAnimationFrame.bind(window); window.__rawRaf = raw; window.__rafRequests = 0;
  window.requestAnimationFrame = (cb) => { window.__rafRequests++; return raw(cb); };
});
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
await page.route("**/quackles-assets/**", (route) => route.fulfill({ status: 404, body: "" }));
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`);
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const S = window.__sf = { rows: [], phase: "idle", stop: false };
  const ch = new MessageChannel();
  ch.port1.onmessage = () => {
    const s = window.__QUACKLES_SEQUENCE__.getState(), max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    S.rows.push({ t: performance.now(), phase: S.phase, y: scrollY, story: (s.rendered?.progress ?? 0) * max, pub: s.current.progress * max });
  };
  const loop = () => { if (S.stop) return; ch.port2.postMessage(0); window.__rawRaf(loop); };
  window.__rawRaf(loop);
});
const wait = (ms) => page.waitForTimeout(ms);
const phase = (p) => page.evaluate((x) => { window.__sf.phase = x; }, p);
const rows = async (p) => (await page.evaluate(() => window.__sf.rows)).filter((r) => r.phase === p);
const touch = (type, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: 206, y, id: 1 }] });
const goto = async (p) => { await page.evaluate((v) => window.__QUACKLES_SEQUENCE__.setProgress(v), p); await wait(1200); };
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : NaN; };
const r1 = (v) => +(+v).toFixed(1);
const res = {}, bad = [];

// S1 + S2: slow steady drag upward (content scrolls down the story), 16 ms steps, then a held finger before lift (no fling).
await goto(0.3);
await phase("drag");
await touch("touchStart", 700);
for (let i = 1; i <= 50; i++) { await touch("touchMove", 700 - i * 8); await wait(16); }   // 400 px at ~500 px/s
await phase("hold");
for (let i = 0; i < 12; i++) { await touch("touchMove", 300); await wait(16); }             // finger rests: release velocity ~0
await touch("touchEnd"); await phase("lift"); await wait(1500);
const drag = (await rows("drag")).slice(8);                                                    // skip touch slop / scroll start
const gaps = drag.map((r) => Math.abs(r.story - r.y));
const dy = drag.at(-1).y - drag[0].y, ds = drag.at(-1).story - drag[0].story;
res.drag = { frames: drag.length, pageTravel: r1(dy), gapP50: r1(q(gaps, 0.5)), gapP95: r1(q(gaps, 0.95)), gapMax: r1(Math.max(...gaps)), storyPerPagePx: +(ds / Math.max(1, dy)).toFixed(3) };
if (!(dy > 150)) bad.push(`drag did not scroll the page (${r1(dy)} px)`);
if (!(res.drag.gapP95 <= 5)) bad.push(`story trails the page during a drag: gap p95 ${res.drag.gapP95} px > 5`);
if (!(res.drag.storyPerPagePx >= 0.95 && res.drag.storyPerPagePx <= 1.05)) bad.push(`story moves ${res.drag.storyPerPagePx} px per page px during a drag (want 0.95..1.05)`);
const after = [...await rows("hold"), ...await rows("lift")];
const stopAt = after.findIndex((r, i) => after.slice(i, i + 3).every((x) => Math.abs(x.y - r.y) < 0.5));
const tail = after.slice(Math.max(0, stopAt));
res.lift = { storyMoveAfterPageStopped: r1(tail.length ? Math.abs(tail.at(-1).story - tail[0].story) : NaN), finalGap: r1(Math.abs(after.at(-1).story - after.at(-1).y)) };
if (!(res.lift.storyMoveAfterPageStopped <= 2)) bad.push(`story drifted ${res.lift.storyMoveAfterPageStopped} px after the page stopped`);
if (!(res.lift.finalGap <= 2)) bad.push(`story rests ${res.lift.finalGap} px away from the page`);

// S3: touch fling (native momentum), then measure when the page vs the story come to rest.
res.flings = [];
for (const ms of [240, 110]) {                                                                  // ~1,750 and ~3,800 px/s flicks
  await goto(0.2);
  const name = `fling${ms}`; await phase(name);
  const steps = Math.max(4, Math.round(ms / 16)); await touch("touchStart", 620);
  for (let i = 1; i <= steps; i++) { await touch("touchMove", 620 - (420 * i) / steps); await wait(ms / steps); }
  await touch("touchEnd"); await wait(3000); await phase("idle");
  const rs = await rows(name);
  const settledAt = (key) => { for (let i = rs.length - 1; i > 0; i--) if (Math.abs(rs[i][key] - rs[i - 1][key]) > 0.5) return rs[Math.min(rs.length - 1, i)].t; return rs[0].t; };
  const pageStop = settledAt("y"), storyStop = settledAt("story");
  const f = { flickMs: ms, pageTravel: r1(rs.at(-1).y - rs[0].y), storyLagMs: r1(storyStop - pageStop), finalGap: r1(Math.abs(rs.at(-1).story - rs.at(-1).y)) };
  res.flings.push(f);
  if (!(f.storyLagMs <= 50)) bad.push(`${name}: story settles ${f.storyLagMs} ms after the page`);
  if (!(f.finalGap <= 2)) bad.push(`${name}: story rests ${f.finalGap} px from the page`);
}

// S4: idle — no animation-frame loop while nothing moves.
await page.evaluate(() => { window.__sf.stop = true; });
await wait(2000);
const r0 = await page.evaluate(() => window.__rafRequests); await wait(2000);
res.idleRafRequests2s = (await page.evaluate(() => window.__rafRequests)) - r0;
if (!(res.idleRafRequests2s <= 2)) bad.push(`${res.idleRafRequests2s} rAF requests in 2 s at rest (want <= 2)`);

console.log(JSON.stringify(res));
for (const b of bad) console.log("FAIL:", b);
await browser.close(); server.kill();
process.exit(bad.length ? 1 : 0);
