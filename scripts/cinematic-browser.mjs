#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = path.resolve(
  process.env.ARTIFACTS || "artifacts/cinematic-handoff",
);
const CHROME =
  process.env.CHROME ||
  [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => fs.existsSync(candidate));

if (!CHROME) throw new Error("Cinematic validation requires Chrome/Chromium");
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
page.on("pageerror", (error) => pageErrors.push(error.message));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = () =>
  page.evaluate(() => ({
    scrollY,
    inspection: window.__QUACKLES_INSPECTION__?.getState?.() ?? null,
    cinematic: window.__QUACKLES_CINEMATIC__?.getState?.() ?? null,
    probe: window.__QUACKLES_DEBUG__?.getState?.() ?? null,
    phase:
      document.querySelector(".poster-frame")?.getAttribute("data-cinematic-phase") ??
      null,
    liveReady:
      document.querySelector(".poster-frame")?.getAttribute("data-live-ready") ??
      null,
  }));

try {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(
    () =>
      Boolean(
        window.__QUACKLES_INSPECTION__ &&
          window.__QUACKLES_CINEMATIC__ &&
          window.__QUACKLES_DEBUG__?.getState?.()?.ready,
      ),
    { timeout: 120000 },
  );
  await pause(500);

  const frame = await page.locator(".poster-frame").boundingBox();
  if (!frame) throw new Error("poster frame missing");
  await page.mouse.move(frame.x + frame.width * 0.5, frame.y + frame.height * 0.5);

  const report = { base: BASE, states: {}, screenshots: {}, pageErrors };
  report.states.initial = await state();

  // First prove inspection retains authority over wheel-up.
  await page.mouse.wheel({ deltaY: -160 });
  await pause(80);
  report.states.inspecting = await state();
  if (!(report.states.inspecting.inspection?.targetZoom > 1))
    throw new Error("wheel-up did not enter inspection");
  if (report.states.inspecting.cinematic?.phase !== "idle")
    throw new Error("cinematic stole authority from inspection");
  if (report.states.inspecting.scrollY !== 0)
    throw new Error("inspection leaked into page scroll");

  // Return home. The cinematic must not launch until inspection is fully idle.
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel({ deltaY: 240 });
    await pause(30);
  }
  await page.waitForFunction(
    () => !window.__QUACKLES_INSPECTION__?.getState?.().active,
    { timeout: 5000 },
  );
  report.states.home = await state();
  if (report.states.home.scrollY !== 0)
    throw new Error("return-to-home leaked into page scroll");

  // A small downward intent is consumed at the hero but must not launch.
  await page.mouse.wheel({ deltaY: 80 });
  await pause(50);
  report.states.intent = await state();
  if (report.states.intent.scrollY !== 0)
    throw new Error("launch intent leaked into page scroll");
  if (report.states.intent.cinematic?.phase !== "idle")
    throw new Error("small launch intent triggered cinematic");
  if (!(report.states.intent.cinematic?.launchIntent > 0))
    throw new Error("launch intent was not accumulated");

  // Cross the hysteresis threshold and let wall-clock phases advance.
  await page.mouse.wheel({ deltaY: 400 });
  await page.waitForFunction(
    () => window.__QUACKLES_CINEMATIC__?.getState?.().phase === "jump",
    { timeout: 5000 },
  );
  report.states.jump = await state();
  report.screenshots.jump = path.join(OUT, "jump.png");
  await page.screenshot({ path: report.screenshots.jump, fullPage: false });

  await page.waitForFunction(
    () => window.__QUACKLES_CINEMATIC__?.getState?.().phase === "explode",
    { timeout: 5000 },
  );
  report.states.explode = await state();

  await page.waitForFunction(
    () => window.__QUACKLES_CINEMATIC__?.getState?.().phase === "reassemble",
    { timeout: 5000 },
  );
  report.states.reassemble = await state();

  await page.waitForFunction(
    () => window.__QUACKLES_CINEMATIC__?.getState?.().phase === "sim-ready",
    { timeout: 5000 },
  );
  report.states.simReady = await state();
  report.screenshots.simReady = path.join(OUT, "sim-ready.png");
  await page.screenshot({ path: report.screenshots.simReady, fullPage: false });

  if (report.states.simReady.cinematic?.authority !== "simulator-pending")
    throw new Error("authority did not reach simulator-pending");
  if ((report.states.simReady.cinematic?.handoff?.maxAbs ?? Infinity) > 1e-6)
    throw new Error(
      `simulator handoff joint error too large: ${report.states.simReady.cinematic?.handoff?.maxAbs}`,
    );
  if (report.states.simReady.scrollY !== 0)
    throw new Error("cinematic phases changed page scroll");
  if (pageErrors.length)
    throw new Error(`page errors: ${pageErrors.join(" | ")}`);

  await fsp.writeFile(
    path.join(OUT, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify({ passed: true, artifact: OUT }, null, 2));
} finally {
  await browser.close();
}
