#!/usr/bin/env node
/** I5 story-fling budget (headless Chromium emulation, NOT device evidence).
 * Guards (process/ISSUES.md I5):
 *  B1 story canvas backing <= 2 px per CSS px, on the owner's phone shape (411x782, DPR 3.5) and the verifier phone (412x915, DPR 2.625);
 *  B2 the phone ("balanced") profile decodes <= 2 plates at once.
 * Symptom (the verifier's I5 scroll-fling journey: 5 touch flings of 420 px in 110 ms down the story, 5 back, 1.2 s apart;
 * 412x915, DPR 2.625, 4x CPU): per-rAF frame time p99 and the longest run of frames > 20 ms, decodes/s and evictions/s.
 * With BASELINE_OUT_DIR (the v0 control, 13da0af) the same journey runs on both builds in this browser, alternating REPS times
 * (default 2), and the medians are judged with the I5 rules: p99 <= v0 + 0.2 ms, streak <= v0, rates <= v0 * 1.1 + 0.5.
 * Without a baseline only B1/B2 gate and the frame numbers are reported. Also reported: stale frames, where the painted
 * story trails the scrolled progress by more than 0.01 (one dense frame span), i.e. the story image freezes mid-scroll.
 * OUT_DIR(+BASE_PATH), PORT, BASELINE_OUT_DIR, BASELINE_PORT, REPS. JSON on stdout; exit 1 on failure. */
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const serve = (dir, port) => { const p = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); return { url: `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`, stop: () => p.kill() }; };
const cand = serve(process.env.OUT_DIR || "out", process.env.PORT || "44410");
const base = process.env.BASELINE_OUT_DIR ? serve(process.env.BASELINE_OUT_DIR, process.env.BASELINE_PORT || "44411") : null;
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const UA = "Mozilla/5.0 (Linux; Android 15; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const bad = [], res = {};

async function open(url, viewport, dpr) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, userAgent: UA });
  await ctx.route("**/quackles-assets/**", (route) => route.fulfill({ status: 404, body: "" })); // plates only; no tiles on the story
  const page = await ctx.newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  return { ctx, page };
}
const guards = (page) => page.evaluate(() => {
  const c = document.querySelector(".sequence-base"), r = c.getBoundingClientRect(), s = window.__QUACKLES_SEQUENCE__.getState();
  return { dpr: devicePixelRatio, cssWidth: r.width, backing: c.width, perCssPx: +(c.width / r.width).toFixed(3), profile: s.profile.id, maxActiveJobs: s.cache.maxActiveJobs };
});

// B1 + B2 on the owner's phone shape and on the verifier's phone profile.
for (const [name, viewport, dpr] of [["owner", { width: 411, height: 782 }, 3.5], ["verifier", { width: 412, height: 915 }, 2.625]]) {
  const { ctx, page } = await open(cand.url, viewport, dpr);
  const g = res[`guards_${name}`] = await guards(page);
  if (!(g.perCssPx <= 2.01)) bad.push(`B1 ${name}: story backing ${g.backing} px for ${g.cssWidth} CSS px = ${g.perCssPx} px/CSS px (> 2) at DPR ${dpr}`);
  if (g.profile !== "balanced" || !(g.maxActiveJobs <= 2)) bad.push(`B2 ${name}: profile ${g.profile} decodes ${g.maxActiveJobs} at once (want balanced, <= 2)`);
  await ctx.close();
}

async function fling(url) {
  const { ctx, page } = await open(url, { width: 412, height: 915 }, 2.625);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(() => {
    const S = (window.__fl = { dt: [], lag: [], last: 0, stop: false, c0: window.__QUACKLES_SEQUENCE__.getState().cache, t0: performance.now() });
    const tick = (t) => {
      if (S.last) { S.dt.push(t - S.last); const s = window.__QUACKLES_SEQUENCE__.getState(); S.lag.push(Math.abs((s.rendered?.progress ?? 0) - s.current.progress)); }
      S.last = t; if (!S.stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
  const pan = async (x, y, dy, ms) => {
    await touch("touchStart", x, y); const t0 = Date.now();
    for (;;) { const k = Math.min(1, (Date.now() - t0) / ms); await touch("touchMove", x, y + dy * k); if (k >= 1) break; await page.waitForTimeout(Math.max(0, 16 - ((Date.now() - t0) % 16))); }
    await touch("touchEnd");
  };
  for (let i = 0; i < 5; i++) { await pan(206, 580, -420, 110); await page.waitForTimeout(1200); }
  for (let i = 0; i < 5; i++) { await pan(206, 160, 420, 110); await page.waitForTimeout(1200); }
  await page.waitForTimeout(3000);
  const out = await page.evaluate(() => {
    const S = window.__fl; S.stop = true;
    const c1 = window.__QUACKLES_SEQUENCE__.getState().cache, secs = (performance.now() - S.t0) / 1000;
    const dt = [...S.dt].sort((a, b) => a - b), q = (f) => +dt[Math.min(dt.length - 1, Math.floor(f * dt.length))].toFixed(1);
    let streak = 0, run = 0; for (const d of S.dt) { run = d > 20 ? run + 1 : 0; streak = Math.max(streak, run); }
    const evict = (c1.closedBitmaps - c1.staleDiscard) - (S.c0.closedBitmaps - S.c0.staleDiscard);
    // Stale story: frames whose painted progress trails the scrolled progress by more than 0.01 (one dense frame span).
    const stale = S.lag.filter((l) => l > 0.01).length, staleMax = +Math.max(...S.lag).toFixed(3);
    return { staleFrames: stale, staleMax, frames: dt.length, p95: q(0.95), p99: q(0.99), over25: dt.filter((d) => d > 25).length, streak,
      decodesPerS: +((c1.completedDecodes - S.c0.completedDecodes) / secs).toFixed(2), evictionsPerS: +(evict / secs).toFixed(2), scrollY: scrollY };
  });
  await ctx.close();
  return out;
}
const reps = Number(process.env.REPS || 2), runs = { candidate: [], baseline: [] };
for (let i = 0; i < reps; i++) {
  if (base) runs.baseline.push(await fling(base.url));
  runs.candidate.push(await fling(cand.url));
}
const med = (list, k) => { const v = list.map((r) => r[k]).sort((a, b) => a - b); return v.length ? v[Math.floor((v.length - 1) / 2)] : null; };
const keys = ["p95", "p99", "over25", "streak", "decodesPerS", "evictionsPerS", "staleFrames", "staleMax"];
res.fling = { candidate: Object.fromEntries(keys.map((k) => [k, med(runs.candidate, k)])), runs };
if (base) {
  const c = res.fling.candidate, b = res.fling.baseline = Object.fromEntries(keys.map((k) => [k, med(runs.baseline, k)]));
  if (!(c.p99 <= b.p99 + 0.2)) bad.push(`I5 frame p99 ${c.p99} ms > v0 ${b.p99} + 0.2`);
  if (!(c.streak <= b.streak)) bad.push(`I5 longest miss streak ${c.streak} > v0 ${b.streak}`);
  if (!(c.decodesPerS <= b.decodesPerS * 1.1 + 0.5)) bad.push(`I5 decodes/s ${c.decodesPerS} > v0 ${b.decodesPerS} * 1.1 + 0.5`);
  if (!(c.evictionsPerS <= b.evictionsPerS * 1.1 + 0.5)) bad.push(`I5 evictions/s ${c.evictionsPerS} > v0 ${b.evictionsPerS} * 1.1 + 0.5`);
}
for (const r of runs.candidate) if (!(r.frames > 300)) bad.push("fling journey did not run");
await browser.close(); cand.stop(); base?.stop();
console.log(JSON.stringify({ ...res, failures: bad }, null, 1));
if (bad.length) { console.error("FAIL\n- " + bad.join("\n- ")); process.exit(1); }
console.log("PASS story-fling budget");
