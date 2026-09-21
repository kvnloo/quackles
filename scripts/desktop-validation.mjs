#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = path.resolve(
  process.env.ARTIFACTS || "artifacts/desktop-validation",
);
const CHROME =
  process.env.CHROME ||
  [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => fs.existsSync(candidate));

if (!CHROME) throw new Error("Desktop validation requires Chrome/Chromium");

await fsp.mkdir(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});

const page = await browser.newPage();
await page.setViewport({
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  isMobile: false,
  hasTouch: false,
});

const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") consoleErrors.push(message.text());
});

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const screenshot = async (name) => {
  const target = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: target, fullPage: false });
  return target;
};
const state = () =>
  page.evaluate(() => ({
    desktop: window.__QUACKLES_DESKTOP__?.getState() ?? null,
    probe: window.__QUACKLES_DEBUG__?.getState() ?? null,
    phase: document
      .querySelector(".desktop-shell")
      ?.getAttribute("data-phase"),
    canvasCount: document.querySelectorAll(".desktop-shell canvas").length,
    desktopVisible:
      getComputedStyle(document.querySelector(".desktop-shell")).display !==
      "none",
  }));
const setZoom = async (value) => {
  await page.evaluate((zoom) => {
    window.__QUACKLES_DESKTOP__?.setZoomInstant(zoom);
  }, value);
  await page.waitForFunction(
    () => {
      const current = window.__QUACKLES_DESKTOP__?.getState();
      return current && Math.abs(current.zoom - current.targetZoom) < 1e-9;
    },
    { timeout: 5000 },
  );
};
const waitPhase = (phase, timeout = 15000) =>
  page.waitForFunction(
    (expected) => window.__QUACKLES_DESKTOP__?.getState().phase === expected,
    { timeout },
    phase,
  );

try {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForSelector('[data-testid="desktop-experience"]', {
    timeout: 30000,
  });
  await page.waitForFunction(
    () =>
      Boolean(
        window.__QUACKLES_DESKTOP__ &&
          window.__QUACKLES_DEBUG__?.getState()?.ready,
      ),
    { timeout: 60000 },
  );
  await pause(700);

  const report = {
    base: BASE,
    chrome: CHROME,
    startedAt: new Date().toISOString(),
    states: {},
    screenshots: {},
    pageErrors,
    consoleErrors,
  };

  report.states.hero = await state();
  report.screenshots.hero = await screenshot("01-hero");

  // Scroll-up must feel attached to the wheel without snapping to the target.
  // Sample multiple points so a regression to a one-frame jump or wrong-way
  // camera move fails even if the final clamp remains correct.
  await page.evaluate(() => window.__QUACKLES_DESKTOP__?.reset());
  await pause(32);
  report.states.zoomStart = await state();
  await page.mouse.wheel({ deltaY: -120 });

  report.states.scrollUpSamples = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        const sample = () => {
          const current = window.__QUACKLES_DESKTOP__?.getState() ?? null;
          samples.push(current);
          if (samples.length >= 12) {
            resolve(samples);
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );

  await pause(520);
  report.states.scrollUpSettled = await state();
  report.screenshots.scrollUpSettled = await screenshot("01b-scroll-up-zoom");

  const zoomStart = report.states.zoomStart.desktop;
  const zoomSamples = report.states.scrollUpSamples.filter(Boolean);
  const zoomSettled = report.states.scrollUpSettled.desktop;
  const zoomEarly = zoomSamples.find(
    (sample) =>
      sample.zoom < zoomStart.zoom - 0.0005 &&
      sample.zoom > sample.targetZoom + 0.0005,
  );
  const movingSamples = zoomSamples.filter(
    (sample) => sample.zoom < zoomStart.zoom - 0.0005,
  );

  if (!zoomSamples.length || !(zoomSamples[0].targetZoom < zoomStart.targetZoom))
    throw new Error("scroll-up did not move the zoom target inward");
  if (!zoomEarly)
    throw new Error("scroll-up produced no intermediate zoom state before settling");
  for (let i = 1; i < movingSamples.length; i++) {
    if (movingSamples[i].zoom > movingSamples[i - 1].zoom + 0.0005)
      throw new Error("scroll-up zoom reversed direction while converging");
  }
  if (Math.abs(zoomSettled.zoom - zoomSettled.targetZoom) > 0.004)
    throw new Error("scroll-up zoom did not settle on its target");
  if (zoomSettled.launchIntent !== 0 || zoomSettled.phase !== "inspect")
    throw new Error("scroll-up incorrectly armed or launched the cinematic");

  // Direction reversal must retarget cleanly instead of carrying stale inward
  // momentum through the user's downward input.
  await page.mouse.wheel({ deltaY: 90 });
  await pause(120);
  report.states.scrollReverse = await state();
  if (
    !(
      report.states.scrollReverse.desktop.targetZoom >
        zoomSettled.targetZoom &&
      report.states.scrollReverse.desktop.zoom > zoomSettled.zoom
    )
  )
    throw new Error("scroll direction reversal did not pull the camera back out");
  if (report.states.scrollReverse.desktop.phase !== "inspect")
    throw new Error("scroll reversal escaped inspect phase");

  await page.evaluate(() => window.__QUACKLES_DESKTOP__?.reset());
  await pause(32);

  await setZoom(0.1);
  report.states.near = await state();
  report.screenshots.near = await screenshot("02-near");

  if (report.states.near.desktop.zoom < 0.719)
    throw new Error("near zoom clamp was violated");

  await setZoom(99);
  report.states.far = await state();
  report.screenshots.far = await screenshot("03-far");

  if (report.states.far.desktop.zoom > 1.421)
    throw new Error("far zoom clamp was violated");

  await page.evaluate(() => window.__QUACKLES_DESKTOP__?.wheel(40));
  report.states.smallIntent = await state();
  if (report.states.smallIntent.desktop.phase !== "inspect")
    throw new Error("small wheel intent triggered jump");

  // Validate wall-clock phase sequencing independently of SwiftShader render
  // throughput. The live scene is already proven loaded above; pausing the
  // demand-render invalidation here prevents a software-rendered 1M+ triangle
  // frame from becoming the state-machine clock.
  await page.evaluate(() => {
    window.__QUACKLES_VALIDATION_INVALIDATE__ = window.__QUACKLES_INVALIDATE__;
    window.__QUACKLES_INVALIDATE__ = () => {};
    window.__QUACKLES_DESKTOP__?.wheel(400);
  });
  await waitPhase("jump");
  report.states.jumpTiming = await state();
  await waitPhase("explode");
  report.states.explodeTiming = await state();
  await waitPhase("reassemble");
  report.states.reassembleTiming = await state();
  await waitPhase("sim-ready");
  report.states.simReadyTiming = await state();

  await page.evaluate(() => {
    const invalidate = window.__QUACKLES_VALIDATION_INVALIDATE__;
    window.__QUACKLES_INVALIDATE__ = invalidate;
    delete window.__QUACKLES_VALIDATION_INVALIDATE__;
    invalidate?.();
  });

  // Deterministic visual checkpoints use the same pose functions, but do not
  // depend on CI render cadence to reach a timestamp.
  const visualCheckpoints = [
    ["jump", 0.58, "04-jump"],
    ["explode", 0.62, "05-explode"],
    ["reassemble", 0.55, "06-reassemble"],
    ["sim-ready", 1, "07-sim-ready"],
  ];
  for (const [phase, progress, name] of visualCheckpoints) {
    await page.evaluate(
      ({ phase, progress }) =>
        window.__QUACKLES_DESKTOP__?.seekPhase(phase, progress),
      { phase, progress },
    );
    await pause(80);
    report.states[`visual_${phase}`] = await state();
    report.screenshots[name] = await screenshot(name);
  }

  const simReady = report.states["visual_sim-ready"];
  if (!simReady.desktop.simReady)
    throw new Error("SIM READY boundary was not reached");
  if (simReady.desktop.authority !== "simulator-pending")
    throw new Error("control authority did not reach simulator-pending");
  if (simReady.desktop.handoff.maxAbs > 1e-6)
    throw new Error(
      `simulator handoff joint error too large: ${simReady.desktop.handoff.maxAbs}`,
    );
  if (simReady.canvasCount !== 1)
    throw new Error(
      `expected exactly one visible desktop canvas, got ${simReady.canvasCount}`,
    );
  if (!simReady.probe?.rigLoaded)
    throw new Error("official Microduck rig did not load");
  if (!simReady.probe?.setReady)
    throw new Error("studio set did not load");
  if (!simReady.probe?.ready)
    throw new Error("live desktop scene never became ready");
  if (pageErrors.length)
    throw new Error(`page errors: ${pageErrors.join(" | ")}`);

  report.completedAt = new Date().toISOString();
  await fsp.writeFile(
    path.join(OUT, "desktop-validation.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.evaluate(() => {
    window.__QUACKLES_RECORD__ = false;
  }).catch(() => {});
  const failure = {
    error: error instanceof Error ? error.stack || error.message : String(error),
    state: await state().catch(() => null),
    pageErrors,
    consoleErrors,
    at: new Date().toISOString(),
  };
  await fsp.writeFile(
    path.join(OUT, "desktop-validation-failure.json"),
    JSON.stringify(failure, null, 2),
  );
  await screenshot("failure").catch(() => {});
  throw error;
} finally {
  await browser.close();
}
