#!/usr/bin/env node
/**
 * Mobile scrollytelling frame test.
 * Viewport 430×932, unique Chrome user-data-dir, puppeteer-core + system Chrome.
 *
 * Records per-frame dt / fps / scroll progress / pose (explode, jump).
 * Fails on long frames, hitch streaks, discontinuous poses, or missing beats.
 *
 *   LABEL=before node scripts/scroll-perf.mjs
 *   LABEL=after  node scripts/scroll-perf.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = process.env.ARTIFACTS || "/opt/cursor/artifacts";
const LABEL = process.env.LABEL || "run";
const CHROME =
  process.env.CHROME ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/local/bin/google-chrome"].find(
    (p) => fs.existsSync(p),
  );

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function windowOf(frames, pred) {
  return frames.filter(pred);
}

function stats(frames) {
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const mean = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
  return {
    n: frames.length,
    meanDt: mean,
    p50: percentile(dts, 50),
    p95: percentile(dts, 95),
    p99: percentile(dts, 99),
    maxDt: dts.length ? dts[dts.length - 1] : 0,
    minFps: dts.length ? 1000 / dts[dts.length - 1] : 0,
    meanFps: mean ? 1000 / mean : 0,
    p95Fps: dts.length ? 1000 / percentile(dts, 95) : 0,
  };
}

function hitching(frames, hitchDtMs) {
  let hitchStreak = 0;
  let maxHitchStreak = 0;
  let longFrames = 0;
  for (const f of frames) {
    if (f.dt > hitchDtMs) {
      hitchStreak += 1;
      maxHitchStreak = Math.max(maxHitchStreak, hitchStreak);
    } else hitchStreak = 0;
    if (f.dt > hitchDtMs * 2) longFrames += 1;
  }
  return { hitchStreak: maxHitchStreak, longFrames };
}

function poseContinuity(frames, progressJump, poseSlack) {
  const jumps = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const dp = Math.abs(b.progress - a.progress);
    const de = Math.abs(b.explode - a.explode);
    const dr = Math.abs((b.jump ?? b.recover) - (a.jump ?? a.recover));
    if (dp > progressJump) jumps.push({ i, kind: "progress", dp, de, dr, t: b.t });
    if (dp < 0.012 && (de > poseSlack || dr > poseSlack)) {
      jumps.push({ i, kind: "pose", dp, de, dr, t: b.t });
    }
  }
  return jumps;
}

async function main() {
  if (!CHROME) {
    console.error("chrome not found");
    process.exit(2);
  }

  const puppeteer = (await import("puppeteer-core")).default;
  fs.mkdirSync(OUT, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `quackles-scroll-${LABEL}-`));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    userDataDir,
    defaultViewport: {
      width: 430,
      height: 932,
      deviceScaleFactor: 1,
      isMobile: true,
      hasTouch: true,
    },
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-renderer-backgrounding",
      "--disable-features=Translate,BackForwardCache",
      `--window-size=430,932`,
      `--user-data-dir=${userDataDir}`,
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: 430,
    height: 932,
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });

  await page.evaluateOnNewDocument(() => {
    window.__QUACKLES_FRAMES__ = [];
    window.__QUACKLES_RECORD__ = false;
    window.__QUACKLES__ = window.__QUACKLES__ || {
      ready: false,
      rigReady: false,
      progress: 0,
      explode: 0,
      jump: 0,
      glFrames: [],
    };
  });

  const started = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("canvas, .duck-fallback", { timeout: 30000 });
  await page
    .waitForFunction(() => window.__QUACKLES__?.rigReady === true, { timeout: 45000 })
    .catch(() => {});
  // Let the first GLB compile settle.
  await new Promise((r) => setTimeout(r, 700));

  const scrollToProgress = async (p, settleMs = 280) => {
    await page.evaluate((next) => {
      const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      window.scrollTo(0, total * next);
      window.__QUACKLES_INVALIDATE__?.();
    }, p);
    await new Promise((r) => setTimeout(r, settleMs));
  };

  // Shader warmup through explode + jump, then back to the product still.
  await scrollToProgress(0.34, 220);
  await scrollToProgress(0.66, 220);
  await scrollToProgress(1, 180);
  await scrollToProgress(0, 400);

  const idle = await page.evaluate(async () => {
    const samples = [];
    window.__QUACKLES_RECORD__ = false;
    await new Promise((resolve) => {
      let last = performance.now();
      let n = 0;
      const step = (now) => {
        samples.push(now - last);
        last = now;
        n += 1;
        window.__QUACKLES_INVALIDATE__?.();
        if (n < 50) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    samples.splice(0, 8);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { mean, n: samples.length, min: Math.min(...samples), max: Math.max(...samples) };
  });

  const pageFacts = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const cs = canvas ? getComputedStyle(canvas) : null;
    const text = document.body.innerText || "";
    return {
      iframes: document.querySelectorAll("iframe").length,
      canvasFilter: cs?.filter || "none",
      canvasExists: Boolean(canvas),
      dpr: window.devicePixelRatio,
      canvasWidth: canvas?.width || 0,
      canvasCssWidth: canvas ? canvas.getBoundingClientRect().width : 0,
      hasWasd: /WASD/i.test(text),
      hasColorway: /Lavender|Graphite|colorway/i.test(text),
      hasHatch: /hatching/i.test(text),
      hasTryMicro: /try micro duck/i.test(text),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  const shot = async (name) => {
    const dest = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: dest, type: "png" });
    return dest;
  };

  const heroPath = await shot(LABEL === "before" ? "hero-before" : "hero");

  const recorded = await page.evaluate(async () => {
    const frames = [];
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const duration = 4800;
    const start = performance.now();
    let last = start;
    window.__QUACKLES_RECORD__ = true;
    if (window.__QUACKLES__) window.__QUACKLES__.glFrames = [];
    window.__QUACKLES_INVALIDATE__?.();

    await new Promise((resolve) => {
      const step = (now) => {
        const dt = now - last;
        last = now;
        const q = window.__QUACKLES__ || {};
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress =
          typeof q.progress === "number" ? q.progress : Math.min(1, window.scrollY / max);
        frames.push({
          t: now,
          dt,
          fps: dt > 0 ? 1000 / dt : 0,
          progress,
          explode: typeof q.explode === "number" ? q.explode : 0,
          jump: typeof q.jump === "number" ? q.jump : typeof q.recover === "number" ? q.recover : 0,
          recover: typeof q.jump === "number" ? q.jump : typeof q.recover === "number" ? q.recover : 0,
          source: "raf",
        });
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        window.scrollTo(0, total * eased);
        window.__QUACKLES_INVALIDATE__?.();
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    window.__QUACKLES_RECORD__ = false;
    window.__QUACKLES_FRAMES__ = frames;
    return frames;
  });

  await new Promise((r) => setTimeout(r, 200));

  const payload = await page.evaluate(() => {
    const q = window.__QUACKLES__ || {};
    return {
      frames: window.__QUACKLES_FRAMES__ || [],
      glFrames: q.glFrames || [],
      progress: q.progress || 0,
      ready: Boolean(q.ready),
      rigReady: Boolean(q.rigReady),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  const fromPage = payload.glFrames.length > 20 ? payload.glFrames : payload.frames;
  const raw = fromPage.length > 10 ? fromPage : recorded;
  const frames = raw.filter((f, i) => i >= 6 && f.dt > 0 && f.dt < 2000);

  const explodeFrames = windowOf(frames, (f) => f.explode > 0.18);
  const jumpFrames = windowOf(frames, (f) => (f.jump ?? f.recover) > 0.18);
  const all = stats(frames);
  const explode = stats(explodeFrames);
  const jump = stats(jumpFrames);
  const jumps = poseContinuity(
    frames.filter((f) => f.progress > 0.01 && f.progress < 0.99),
    0.085,
    0.22,
  );

  const hitchDtMs = Math.max(40, idle.mean * 3.1);
  const p95Limit = Math.max(48, idle.mean * 3.1);
  const meanLimit = Math.max(32, idle.mean * 1.8);
  const maxDtLimit = Math.max(140, idle.mean * 8);
  const hitches = hitching(frames, hitchDtMs);

  const peakOf = (key) => {
    let best = null;
    for (const f of frames) {
      const v = f[key] ?? 0;
      if (!best || v > (best[key] ?? 0)) best = f;
    }
    return best?.progress ?? null;
  };
  const explodeP = peakOf("explode") ?? 0.34;
  const jumpP = peakOf("jump") ?? 0.66;

  await scrollToProgress(explodeP, 380);
  const explodePath = await shot(LABEL === "before" ? "explode-before" : "explode");
  await scrollToProgress(jumpP, 380);
  const jumpPath = await shot(LABEL === "before" ? "jump-before" : "jump");

  const dprCap = pageFacts.canvasCssWidth
    ? pageFacts.canvasWidth / pageFacts.canvasCssWidth
    : pageFacts.dpr;

  const failures = [];
  if (!payload.rigReady) failures.push("rig never became ready");
  if (pageFacts.iframes > 0) failures.push(`iframe count ${pageFacts.iframes}`);
  if (pageFacts.canvasFilter && pageFacts.canvasFilter !== "none") {
    failures.push(`canvas CSS filter ${pageFacts.canvasFilter}`);
  }
  if (pageFacts.hasWasd) failures.push("WASD copy present");
  if (pageFacts.hasColorway) failures.push("colorway grid copy present");
  if (pageFacts.hasHatch) failures.push("hatch overlay copy present");
  if (pageFacts.hasTryMicro) failures.push("Try Micro Duck copy present");
  if (dprCap > 1.08) failures.push(`unbounded dpr ${dprCap.toFixed(2)}`);
  if (all.n < 80) failures.push(`too few frames (${all.n})`);
  if (explode.n < 8) failures.push(`explode window n=${explode.n}`);
  if (jump.n < 8) failures.push(`jump window n=${jump.n}`);
  if (all.p95 > p95Limit) failures.push(`p95 dt ${all.p95.toFixed(1)}ms > ${p95Limit.toFixed(1)}ms`);
  if (all.meanDt > meanLimit) {
    failures.push(`mean dt ${all.meanDt.toFixed(1)}ms > ${meanLimit.toFixed(1)}ms`);
  }
  if (all.maxDt > maxDtLimit) {
    failures.push(`max dt ${all.maxDt.toFixed(1)}ms > ${maxDtLimit.toFixed(1)}ms`);
  }
  if (hitches.hitchStreak >= 3) {
    failures.push(`hitch streak ${hitches.hitchStreak} frames > ${hitchDtMs.toFixed(0)}ms`);
  }
  if (explode.n > 12 && explode.p95 > p95Limit + 8) {
    failures.push(`explode window p95 ${explode.p95.toFixed(1)}ms`);
  }
  if (jump.n > 12 && jump.p95 > p95Limit + 8) {
    failures.push(`jump window p95 ${jump.p95.toFixed(1)}ms`);
  }
  if (jumps.length > 4) failures.push(`discontinuous pose/progress (${jumps.length} jumps)`);
  if (payload.scrollHeight > 7000) {
    failures.push(`story too long (${payload.scrollHeight}px)`);
  }

  const report = {
    label: LABEL,
    url: BASE,
    elapsedMs: Date.now() - started,
    viewport: { width: 430, height: 932 },
    ready: payload.ready,
    rigReady: payload.rigReady,
    scrollHeight: payload.scrollHeight,
    source: payload.glFrames.length > 20 ? "webgl" : "raf",
    idle,
    limits: { hitchDtMs, p95Limit, meanLimit, maxDtLimit },
    pageFacts,
    dprCap,
    all: { ...all, ...hitches },
    explode,
    jump,
    jumps: jumps.slice(0, 12),
    failures,
    screenshots: { hero: heroPath, explode: explodePath, jump: jumpPath },
  };

  const jsonPath = path.join(OUT, `scroll-perf-${LABEL}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

  const md = [
    `# Scroll perf (${LABEL})`,
    "",
    `- source: ${report.source} · idle rAF ${idle.mean.toFixed(1)}ms`,
    `- frames: ${all.n} · mean ${all.meanDt.toFixed(1)}ms (${all.meanFps.toFixed(0)} fps) · p95 ${all.p95.toFixed(1)}ms (${all.p95Fps.toFixed(0)} fps) · max ${all.maxDt.toFixed(1)}ms`,
    `- explode: n=${explode.n} p95 ${explode.p95.toFixed(1)}ms mean ${explode.meanDt.toFixed(1)}ms`,
    `- jump/get-up: n=${jump.n} p95 ${jump.p95.toFixed(1)}ms mean ${jump.meanDt.toFixed(1)}ms`,
    `- hitch streak: ${hitches.hitchStreak} · pose jumps: ${jumps.length} · dpr ${dprCap.toFixed(2)}`,
    `- result: ${failures.length ? "FAIL — " + failures.join("; ") : "PASS"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `scroll-perf-${LABEL}.md`), md);

  console.log(md);
  console.log(jsonPath);

  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });

  if (failures.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
