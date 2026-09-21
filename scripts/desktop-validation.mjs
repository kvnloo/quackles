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
    window.__QUACKLES_DESKTOP__?.setZoom(zoom);
  }, value);
  await page.waitForFunction(
    () => {
      const current = window.__QUACKLES_DESKTOP__?.getState();
      return (
        current &&
        Math.abs(current.zoom - current.targetZoom) < 0.003
      );
    },
    { timeout: 10000 },
  );
};
const waitPhase = (phase, timeout = 10000) =>
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

  await page.evaluate(() => window.__QUACKLES_DESKTOP__?.wheel(400));
  await waitPhase("jump");
  await pause(520);
  report.states.jump = await state();
  report.screenshots.jump = await screenshot("04-jump");

  await waitPhase("explode");
  await pause(650);
  report.states.explode = await state();
  report.screenshots.explode = await screenshot("05-explode");

  await waitPhase("reassemble");
  await pause(450);
  report.states.reassemble = await state();
  report.screenshots.reassemble = await screenshot("06-reassemble");

  await waitPhase("sim-ready");
  await pause(200);
  report.states.simReady = await state();
  report.screenshots.simReady = await screenshot("07-sim-ready");

  if (!report.states.simReady.desktop.simReady)
    throw new Error("SIM READY boundary was not reached");
  if (report.states.simReady.desktop.authority !== "simulator-pending")
    throw new Error("control authority did not reach simulator-pending");
  if (report.states.simReady.canvasCount !== 1)
    throw new Error(
      `expected exactly one visible desktop canvas, got ${report.states.simReady.canvasCount}`,
    );
  if (!report.states.simReady.probe?.rigLoaded)
    throw new Error("official Microduck rig did not load");
  if (!report.states.simReady.probe?.setReady)
    throw new Error("studio set did not load");
  if (!report.states.simReady.probe?.ready)
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
