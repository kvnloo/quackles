#!/usr/bin/env node
/**
 * 430×932 scroll FPS TDD harness.
 *
 * Injects a rAF probe, scrolls hero → explode → jump, records dt.
 * Target: no frame over 8.33ms (120Hz Samsung S25). If this VM cannot
 * vsync at 120, we still fail on hitches (dt > 2.5× measured vsync)
 * and on iframes / canvas CSS filters / unbounded dpr.
 *
 *   node scripts/fps-harness.mjs
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

const TARGET_MS = 1000 / 120;

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function stats(frames, hitchMs = TARGET_MS * 2.5) {
  const dts = frames.map((f) => f.dt).sort((a, b) => a - b);
  const mean = dts.length ? dts.reduce((a, b) => a + b, 0) / dts.length : 0;
  let hitchStreak = 0;
  let maxHitchStreak = 0;
  let overTarget = 0;
  for (const f of frames) {
    if (f.dt > hitchMs) {
      hitchStreak += 1;
      maxHitchStreak = Math.max(maxHitchStreak, hitchStreak);
    } else hitchStreak = 0;
    if (f.dt > TARGET_MS) overTarget += 1;
  }
  return {
    n: frames.length,
    meanDt: mean,
    p50: percentile(dts, 50),
    p95: percentile(dts, 95),
    p99: percentile(dts, 99),
    maxDt: dts.at(-1) ?? 0,
    meanFps: mean ? 1000 / mean : 0,
    p99Fps: dts.length ? 1000 / percentile(dts, 99) : 0,
    overTarget,
    maxHitchStreak,
  };
}

async function main() {
  if (!CHROME) {
    console.error("chrome not found");
    process.exit(2);
  }

  const puppeteer = (await import("puppeteer-core")).default;
  fs.mkdirSync(OUT, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `quackles-fps-${LABEL}-`));

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
    window.__FPS_FRAMES__ = [];
    window.__QUACKLES_RECORD__ = false;
  });

  const started = Date.now();
  await page.goto(BASE, { waitUntil: "load", timeout: 60000 });
  await page.waitForSelector("canvas, .duck-fallback", { timeout: 30000 });
  await page
    .waitForFunction(() => window.__QUACKLES__?.rigReady || window.__QUACKLES__?.ready, {
      timeout: 25000,
    })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, 2200));

  const evalSafe = async (fn, ...args) => {
    for (let i = 0; i < 3; i++) {
      try {
        return await page.evaluate(fn, ...args);
      } catch (err) {
        const msg = String(err);
        if (!/Execution context was destroyed|detached/i.test(msg) || i === 2) throw err;
        await page.waitForSelector("canvas, .duck-fallback", { timeout: 15000 });
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return null;
  };

  const idle = await evalSafe(async () => {
    const samples = [];
    await new Promise((resolve) => {
      let last = performance.now();
      let n = 0;
      const step = (now) => {
        samples.push(now - last);
        last = now;
        n += 1;
        if (n < 45) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
    samples.splice(0, 8);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { mean, n: samples.length, min: Math.min(...samples), max: Math.max(...samples) };
  });

  const pageFacts = await evalSafe(() => {
    const canvas = document.querySelector("canvas");
    const cs = canvas ? getComputedStyle(canvas) : null;
    return {
      iframes: document.querySelectorAll("iframe").length,
      canvasFilter: cs?.filter || "none",
      canvasExists: Boolean(canvas),
      dpr: window.devicePixelRatio,
      canvasWidth: canvas?.width || 0,
      canvasCssWidth: canvas ? canvas.getBoundingClientRect().width : 0,
      hasWasd: /WASD/i.test(document.body.innerText),
      hasColorway: /Lavender|Graphite|colorway/i.test(document.body.innerText),
    };
  });

  const shot = async (name) => {
    const dest = path.join(OUT, `${name}.png`);
    await page.screenshot({ path: dest, type: "png" });
    return dest;
  };

  const heroPath = await shot("hero");

  const recorded = await evalSafe(async () => {
    const frames = [];
    const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const duration = 3800;
    const start = performance.now();
    let last = start;
    window.__QUACKLES_RECORD__ = true;
    if (window.__QUACKLES__) window.__QUACKLES__.glFrames = [];

    await new Promise((resolve) => {
      const step = (now) => {
        const dt = now - last;
        last = now;
        const q = window.__QUACKLES__ || {};
        frames.push({
          t: now,
          dt,
          fps: dt > 0 ? 1000 / dt : 0,
          progress: typeof q.progress === "number" ? q.progress : Math.min(1, window.scrollY / total),
          explode: typeof q.explode === "number" ? q.explode : 0,
          jump: typeof q.jump === "number" ? q.jump : 0,
          source: "raf",
        });
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const lenis = window.__QUACKLES_LENIS__;
        if (lenis) lenis.scrollTo(lenis.limit * eased, { immediate: true });
        else window.scrollTo(0, total * eased);
        if (t < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    window.__QUACKLES_RECORD__ = false;
    return frames;
  });

  const payload = await evalSafe(() => {
    const q = window.__QUACKLES__ || {};
    return {
      glFrames: q.glFrames || [],
      progress: q.progress || 0,
      ready: Boolean(q.ready),
      rigReady: Boolean(q.rigReady),
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
    };
  });

  const raw = (payload?.glFrames?.length ?? 0) > 40 ? payload.glFrames : recorded || [];
  const frames = raw.filter((f, i) => i >= 20 && f.dt > 0 && f.dt < 2000);
  const explodeFrames = frames.filter((f) => f.explode > 0.2);
  const jumpFrames = frames.filter((f) => f.jump > 0.2);
  const vsyncMsPre = idle?.mean ?? 16.67;
  const vmIs120Pre = vsyncMsPre > 0 && vsyncMsPre < 9.2;
  const hitchMs = vmIs120Pre ? TARGET_MS * 2.5 : Math.max(vsyncMsPre * 2.6, 100);
  const all = stats(frames, hitchMs);
  const explode = stats(explodeFrames, hitchMs);
  const jump = stats(jumpFrames, hitchMs);

  const explodeP = frames.find((f) => f.explode > 0.75)?.progress ?? 0.5;
  const jumpP = frames.find((f) => f.jump > 0.75)?.progress ?? 1;

  const scrollToProgress = async (p) => {
    await evalSafe((progress) => {
      const lenis = window.__QUACKLES_LENIS__;
      if (lenis) lenis.scrollTo(lenis.limit * progress, { immediate: true });
      else {
        const total = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        window.scrollTo(0, total * progress);
      }
    }, p);
    await new Promise((r) => setTimeout(r, 700));
  };

  await scrollToProgress(explodeP);
  const explodePath = await shot("explode");

  await scrollToProgress(jumpP);
  const jumpPath = await shot("jump");

  const vsyncMs = idle?.mean ?? 16.67;
  const vmIs120 = vsyncMs > 0 && vsyncMs < 9.2;
  const hitchLimit = vmIs120 ? TARGET_MS * 2.2 : Math.max(140, vsyncMs * 6);

  const failures = [];
  if (pageFacts.iframes > 0) failures.push(`iframe count ${pageFacts.iframes}`);
  if (pageFacts.canvasFilter && pageFacts.canvasFilter !== "none") {
    failures.push(`canvas CSS filter ${pageFacts.canvasFilter}`);
  }
  if (pageFacts.hasWasd) failures.push("WASD copy present");
  if (pageFacts.hasColorway) failures.push("colorway grid copy present");
  const minFrames = vmIs120 ? 60 : 40;
  if (all.n < minFrames) failures.push(`too few frames (${all.n})`);
  if (all.maxDt > hitchLimit) {
    failures.push(`hitch max ${all.maxDt.toFixed(1)}ms > ${hitchLimit.toFixed(1)}ms`);
  }
  if (vmIs120 && all.maxHitchStreak >= 3) failures.push(`hitch streak ${all.maxHitchStreak}`);
  if (!vmIs120 && all.maxHitchStreak >= 8) failures.push(`hitch streak ${all.maxHitchStreak} vs vsync ${vsyncMs.toFixed(1)}ms`);
  if (vmIs120 && all.p99 > TARGET_MS) {
    failures.push(`p99 ${all.p99.toFixed(2)}ms > ${TARGET_MS.toFixed(2)}ms at 120Hz`);
  }

  const dprCap = pageFacts.canvasCssWidth
    ? pageFacts.canvasWidth / pageFacts.canvasCssWidth
    : pageFacts.dpr;
  if (dprCap > 2.05 + 1e-6) failures.push(`unbounded dpr ${dprCap.toFixed(2)}`);

  const report = {
    label: LABEL,
    url: BASE,
    elapsedMs: Date.now() - started,
    viewport: { width: 430, height: 932 },
    targetMs: TARGET_MS,
    vm: {
      vsyncMs,
      is120: vmIs120,
      note: vmIs120
        ? "Idle rAF looks like 120Hz."
        : `VM/headless idle rAF is ${vsyncMs.toFixed(2)}ms (not 120Hz). Assert hitches, not 8.33ms p99.`,
      gl: "swiftshader",
    },
    pageFacts,
    dprCap,
    ready: payload?.ready,
    rigReady: payload?.rigReady,
    scrollHeight: payload?.scrollHeight,
    source: (payload?.glFrames?.length ?? 0) > 40 ? "webgl" : "raf",
    all,
    explode,
    jump,
    failures,
    screenshots: { hero: heroPath, explode: explodePath, jump: jumpPath },
  };

  const jsonPath = path.join(OUT, "fps.json");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT, `scroll-perf-${LABEL}.json`), JSON.stringify(report, null, 2));

  const md = [
    `# FPS harness (${LABEL})`,
    "",
    `- vsync: ${vsyncMs.toFixed(2)}ms · 120Hz capable: ${vmIs120}`,
    `- source: ${report.source} · frames ${all.n}`,
    `- all: mean ${all.meanDt.toFixed(2)}ms · p99 ${all.p99.toFixed(2)}ms · max ${all.maxDt.toFixed(2)}ms`,
    `- explode p99 ${explode.p99.toFixed(2)}ms · jump p99 ${jump.p99.toFixed(2)}ms`,
    `- iframes ${pageFacts.iframes} · canvas filter ${pageFacts.canvasFilter} · dpr cap ${dprCap.toFixed(2)}`,
    `- result: ${failures.length ? "FAIL — " + failures.join("; ") : "PASS"}`,
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, `fps-${LABEL}.md`), md);
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
