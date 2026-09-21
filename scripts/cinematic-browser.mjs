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

await page.evaluateOnNewDocument(() => {
  const nativeMatchMedia = window.matchMedia.bind(window);
  window.matchMedia = (query) => {
    if (query !== "(hover: hover) and (pointer: fine)")
      return nativeMatchMedia(query);
    return {
      matches: true,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    };
  };
});

const pageErrors = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const state = () =>
  page.evaluate(() => ({
    scrollY,
    inspection: window.__QUACKLES_INSPECTION__?.getState?.() ?? null,
    cinematic: window.__QUACKLES_CINEMATIC__?.getState?.() ?? null,
    sequence: window.__QUACKLES_SEQUENCE__?.getState?.() ?? null,
    viewfinder: window.__QUACKLES_VIEWFINDER__?.getState?.() ?? null,
    probe: window.__QUACKLES_DEBUG__?.getState?.() ?? null,
    audit: window.__QUACKLES_DEBUG__?.getAuditState?.() ?? null,
    phase:
      document
        .querySelector(".poster-frame")
        ?.getAttribute("data-cinematic-phase") ?? null,
  }));

try {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 120000 });
  await page.waitForFunction(
    () =>
      Boolean(
        window.__QUACKLES_INSPECTION__ &&
          window.__QUACKLES_CINEMATIC__ &&
          window.__QUACKLES_SEQUENCE__?.getState?.().ready &&
          window.__QUACKLES_DEBUG__?.getState?.()?.ready,
      ),
    { timeout: 120000 },
  );
  await pause(500);

  const frame = await page.locator(".poster-frame").boundingBox();
  if (!frame) throw new Error("poster frame missing");
  await page.mouse.move(
    frame.x + frame.width * 0.5,
    frame.y + frame.height * 0.5,
  );

  const report = { base: BASE, states: {}, screenshots: {}, pageErrors };
  report.states.initial = await state();

  if (report.states.initial.audit?.robotSurfaces?.blenderSkin !== true)
    throw new Error("authored Blender robot skin is not the default live surface");

  // Inspection owns wheel-up at story origin.
  await page.mouse.wheel({ deltaY: -160 });
  await pause(120);
  report.states.inspecting = await state();
  if (!(report.states.inspecting.inspection?.targetZoom > 1))
    throw new Error("wheel-up did not enter inspection");
  if (report.states.inspecting.cinematic?.storyProgress !== 0)
    throw new Error("story advanced while inspection owned the wheel");
  if (report.states.inspecting.scrollY !== 0)
    throw new Error("inspection leaked into document scroll");

  // Wheel-down first returns inspection to 1x.
  for (let i = 0; i < 10; i++) {
    await page.mouse.wheel({ deltaY: 240 });
    await pause(30);
  }
  await page.waitForFunction(
    () => !window.__QUACKLES_INSPECTION__?.getState?.().active,
    { timeout: 5000 },
  );
  report.states.home = await state();
  if (report.states.home.cinematic?.storyProgress !== 0)
    throw new Error("zoom-out accidentally advanced the product story");

  // One controlled wheel step advances only one reversible story slice.
  await page.mouse.wheel({ deltaY: 180 });
  await pause(100);
  report.states.jump = await state();
  if (report.states.jump.cinematic?.phase !== "jump")
    throw new Error("first story step did not enter jump");
  if (!(report.states.jump.cinematic?.storyProgress > 0))
    throw new Error("story progress did not advance");
  if (report.states.jump.viewfinder?.active)
    throw new Error("viewfinder remained visible during downward story motion");

  // Nothing should autoplay after wheel input stops.
  const frozenProgress = report.states.jump.cinematic.storyProgress;
  await pause(700);
  report.states.frozen = await state();
  if (
    Math.abs(
      report.states.frozen.cinematic.storyProgress - frozenProgress,
    ) > 1e-6
  )
    throw new Error("story autoplayed after the wheel stopped");

  // Continue down through the authored reversible phases.
  await page.mouse.wheel({ deltaY: 180 });
  await pause(80);
  report.states.explode = await state();
  if (report.states.explode.cinematic?.phase !== "explode")
    throw new Error("second story step did not enter explode");

  await page.mouse.wheel({ deltaY: 180 });
  await pause(80);
  report.states.explodeDeep = await state();

  await page.mouse.wheel({ deltaY: 180 });
  await pause(80);
  report.states.reassemble = await state();
  if (report.states.reassemble.cinematic?.phase !== "reassemble")
    throw new Error("fourth story step did not enter reassemble");

  await page.mouse.wheel({ deltaY: 180 });
  await pause(100);
  report.states.simReady = await state();
  if (report.states.simReady.cinematic?.phase !== "sim-ready")
    throw new Error("story did not reach specs/sim-ready at the end");
  if (report.states.simReady.cinematic?.authority !== "simulator-pending")
    throw new Error("final authority did not reach simulator-pending");
  if ((report.states.simReady.cinematic?.handoff?.maxAbs ?? Infinity) > 1e-6)
    throw new Error(
      `simulator handoff joint error too large: ${report.states.simReady.cinematic?.handoff?.maxAbs}`,
    );

  report.screenshots.simReady = path.join(OUT, "sim-ready.png");
  await page.screenshot({
    path: report.screenshots.simReady,
    fullPage: false,
  });

  // Reverse the entire state machine with wheel-up.
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel({ deltaY: -180 });
    await pause(70);
  }
  report.states.reversedHome = await state();
  if (report.states.reversedHome.cinematic?.phase !== "idle")
    throw new Error("reverse wheel did not return the story to idle");
  if (report.states.reversedHome.cinematic?.storyProgress !== 0)
    throw new Error("reverse wheel did not return story progress to zero");
  if (report.states.reversedHome.scrollY !== 0)
    throw new Error("reversible desktop story changed document scroll");

  // Continue scrolling up and immediately regain inspection ownership.
  await page.mouse.wheel({ deltaY: -180 });
  await pause(120);
  report.states.reenteredInspection = await state();
  if (!(report.states.reenteredInspection.inspection?.targetZoom > 1))
    throw new Error("inspection did not reactivate after reversing the story");
  if (report.states.reenteredInspection.cinematic?.phase !== "idle")
    throw new Error("cinematic state did not stay reset during re-inspection");

  report.screenshots.reenteredInspection = path.join(
    OUT,
    "reentered-inspection.png",
  );
  await page.screenshot({
    path: report.screenshots.reenteredInspection,
    fullPage: false,
  });

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
