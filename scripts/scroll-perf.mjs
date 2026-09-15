#!/usr/bin/env node
/**
 * Mobile scrollytelling frame test.
 * Viewport 430×932, unique Chrome user-data-dir, puppeteer-core + system Chrome.
 *
 * Records per-frame dt / fps / scroll progress / pose (explode, recover).
 * Fails on long frames, hitch streaks, or discontinuous pose vs scroll.
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
    (p) => fs.existsSync(p)
  );

const LIMITS = {
  warmupFrames: 8,
  p95DtMs: 36,
  meanDtMs: 28,
  maxDtMs: 90,
  hitchDtMs: 50,
  hitchStreak: 3,
  progressJump: 0.085,
  poseSlack: 0.22,
};

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
  let hitchStreak = 0;
  let maxHitchStreak = 0;
  let longFrames = 0;
  for (const f of frames) {
    if (f.dt > LIMITS.hitchDtMs) {
      hitchStreak += 1;
      maxHitchStreak = Math.max(maxHitchStreak, hitchStreak);
    } else hitchStreak = 0;
    if (f.dt > LIMITS.maxDtMs) longFrames += 1;
  }
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
    longFrames,
    maxHitchStreak,
  };
}

function poseContinuity(frames) {
  const jumps = [];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    const dp = Math.abs(b.progress - a.progress);
    const de = Math.abs(b.explode - a.explode);
    const dr = Math.abs(b.recover - a.recover);
    if (dp > LIMITS.progressJump) {
      jumps.push({ i, kind: "progress", dp, de, dr, t: b.t });
    }
    if (dp < 0.012 && (de > LIMITS.poseSlack || dr > LIMITS.poseSlack)) {
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
      recover: 0,
      glFrames: [],
    };
  });

  const started = Date.now();
  await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("canvas, svg", { timeout: 30000 }).catch(() => {});
  await page
    .waitForFunction(
      () => window.__QUACKLES__?.ready || window.__QUACKLES__?.rigReady || document.querySelector("canvas"),
      { timeout: 25000 }
    )
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 1800));

  const shot = async (name) => {
    const dest = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: dest, type: "png" });
    return dest;
  };

  const heroPath = await shot(LABEL === "before" ? "hero-before" : "hero");

  const recorded = await page.evaluate(async () => {
    const frames = [];
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const duration = 4200;
    const start = performance.now();
    let last = start;
    window.__QUACKLES_RECORD__ = true;
    if (window.__QUACKLES__) window.__QUACKLES__.glFrames = [];

    await new Promise((resolve) => {
      const step = (now) => {
        const dt = now - last;
        last = now;
        const q = window.__QUACKLES__ || {};
        const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress =
          typeof q.progress === "number" && q.progress > 0
            ? q.progress
            : Math.min(1, window.scrollY / max);
        frames.push({
          t: now,
          dt,
          fps: dt > 0 ? 1000 / dt : 0,
          progress,
          explode: typeof q.explode === "number" ? q.explode : 0,
          recover: typeof q.recover === "number" ? q.recover : 0,
          source: "raf",
        });
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        window.scrollTo(0, total * eased);
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

  const fromPage = payload.glFrames.length > 30 ? payload.glFrames : payload.frames;
  const raw = fromPage.length > 10 ? fromPage : recorded;
  const frames = raw.filter((f, i) => i >= LIMITS.warmupFrames && f.dt > 0 && f.dt < 2000);

  const explodeFrames = windowOf(frames, (f) => f.explode > 0.18);
  const jumpFrames = windowOf(frames, (f) => f.recover > 0.18);
  const all = stats(frames);
  const explode = stats(explodeFrames);
  const jump = stats(jumpFrames);
  const jumps = poseContinuity(frames.filter((f) => f.progress > 0.01 && f.progress < 0.99));

  await page.evaluate(() => {
    window.__QUACKLES_RECORD__ = false;
  });

  const findProgress = (pred) => {
    const hit = frames.find(pred);
    return hit ? hit.progress : null;
  };
  const explodeP = findProgress((f) => f.explode > 0.75) ?? 0.34;
  const jumpP = findProgress((f) => f.recover > 0.75) ?? 0.66;

  await page.evaluate((p) => {
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, total * p);
  }, explodeP);
  await new Promise((r) => setTimeout(r, 350));
  const explodePath = await shot(LABEL === "before" ? "explode-before" : "explode");

  await page.evaluate((p) => {
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, total * p);
  }, jumpP);
  await new Promise((r) => setTimeout(r, 350));
  const jumpPath = await shot(LABEL === "before" ? "jump-before" : "jump");

  const failures = [];
  if (all.n < 80) failures.push(`too few frames (${all.n})`);
  if (all.p95 > LIMITS.p95DtMs) failures.push(`p95 dt ${all.p95.toFixed(1)}ms > ${LIMITS.p95DtMs}ms`);
  if (all.meanDt > LIMITS.meanDtMs) failures.push(`mean dt ${all.meanDt.toFixed(1)}ms > ${LIMITS.meanDtMs}ms`);
  if (all.maxDt > LIMITS.maxDtMs) failures.push(`max dt ${all.maxDt.toFixed(1)}ms > ${LIMITS.maxDtMs}ms`);
  if (all.maxHitchStreak >= LIMITS.hitchStreak) {
    failures.push(`hitch streak ${all.maxHitchStreak} frames > ${LIMITS.hitchDtMs}ms`);
  }
  if (explode.n > 20 && explode.p95 > LIMITS.p95DtMs + 4) {
    failures.push(`explode window p95 ${explode.p95.toFixed(1)}ms`);
  }
  if (jump.n > 20 && jump.p95 > LIMITS.p95DtMs + 4) {
    failures.push(`jump window p95 ${jump.p95.toFixed(1)}ms`);
  }
  if (jumps.length > 4) failures.push(`discontinuous pose/progress (${jumps.length} jumps)`);

  const report = {
    label: LABEL,
    url: BASE,
    elapsedMs: Date.now() - started,
    viewport: { width: 430, height: 932 },
    ready: payload.ready,
    rigReady: payload.rigReady,
    scrollHeight: payload.scrollHeight,
    source: payload.glFrames.length > 30 ? "webgl" : "raf",
    limits: LIMITS,
    all,
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
    `- source: ${report.source}`,
    `- frames: ${all.n} · mean ${all.meanDt.toFixed(1)}ms (${all.meanFps.toFixed(0)} fps) · p95 ${all.p95.toFixed(1)}ms (${all.p95Fps.toFixed(0)} fps) · max ${all.maxDt.toFixed(1)}ms`,
    `- explode: n=${explode.n} p95 ${explode.p95.toFixed(1)}ms mean ${explode.meanDt.toFixed(1)}ms`,
    `- jump/get-up: n=${jump.n} p95 ${jump.p95.toFixed(1)}ms mean ${jump.meanDt.toFixed(1)}ms`,
    `- hitch streak: ${all.maxHitchStreak} · pose jumps: ${jumps.length}`,
    `- result: ${failures.length ? "FAIL — " + failures.join("; ") : "PASS"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `scroll-perf-${LABEL}.md`), md);

  console.log(md);
  console.log(jsonPath);

  await browser.close();
  fs.rmSync(userDataDir, { recursive: true, force: true });

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
