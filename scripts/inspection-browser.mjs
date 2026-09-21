#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = path.resolve(
  process.env.ARTIFACTS || "artifacts/hero-inspection",
);
const CHROME =
  process.env.CHROME ||
  [
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].find((candidate) => fs.existsSync(candidate));

if (!CHROME)
  throw new Error("Hero inspection validation requires Chrome/Chromium");
await fsp.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const errors = [];

const imageRequests = (page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) =>
        /\/sequence\/.*\.(?:webp|png|avif)(?:\?|$)/i.test(url),
      ),
  );

const state = (page) =>
  page.evaluate(() => ({
    inspection: window.__QUACKLES_INSPECTION__?.getState() ?? null,
    sequence: window.__QUACKLES_SEQUENCE__?.getState() ?? null,
    cinematic: window.__QUACKLES_CINEMATIC__?.getState?.() ?? null,
    viewfinder: window.__QUACKLES_VIEWFINDER__?.getState() ?? null,
    scrollY,
    transform: getComputedStyle(
      document.querySelector(".sequence-camera"),
    ).transform,
    willChange: getComputedStyle(
      document.querySelector(".sequence-camera"),
    ).willChange,
    origin: getComputedStyle(
      document.querySelector(".sequence-camera"),
    ).transformOrigin,
    viewfinderBounds: (() => {
      const node = document.querySelector(".inspection-viewfinder");
      const viewport = window.visualViewport;
      if (!node || !viewport) return null;
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        viewportLeft: viewport.offsetLeft,
        viewportTop: viewport.offsetTop,
        viewportRight: viewport.offsetLeft + viewport.width,
        viewportBottom: viewport.offsetTop + viewport.height,
      };
    })(),
  }));

async function open(context) {
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(
    () =>
      window.__QUACKLES_SEQUENCE__?.getState().ready &&
      window.__QUACKLES_VIEWFINDER__,
    undefined,
    { timeout: 30000 },
  );
  return page;
}

function expectedInspectionCrop(inspection) {
  const scale = Math.max(1, inspection.zoom);
  const width = 1 / scale;
  const height = 1 / scale;
  return {
    x: Math.max(0, Math.min(1 - width, inspection.focusX * (1 - width))),
    y: Math.max(0, Math.min(1 - height, inspection.focusY * (1 - height))),
    width,
    height,
    scale,
  };
}

function near(actual, expected, epsilon = 0.02) {
  return Math.abs(actual - expected) <= epsilon;
}

try {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
  });
  const page = await open(desktopContext);
  await page.waitForFunction(
    () => window.__QUACKLES_INSPECTION__?.getState().maxZoom > 1.05,
    undefined,
    { timeout: 30000 },
  );

  const rect = await page.locator(".poster-frame").boundingBox();
  if (!rect) throw new Error("poster frame is missing");
  const firstCursor = {
    x: rect.x + rect.width * 0.68,
    y: rect.y + rect.height * 0.56,
  };
  await page.mouse.move(firstCursor.x, firstCursor.y);

  const requestsBefore = await imageRequests(page);
  const before = await state(page);
  if (before.viewfinder.active)
    throw new Error("viewfinder should be hidden at 1x");
  if (before.willChange !== "auto")
    throw new Error("camera keeps will-change allocated while idle");

  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(40);
  const early = await state(page);
  await page.waitForTimeout(700);
  const settled = await state(page);
  const requestsSettled = await imageRequests(page);

  if (before.scrollY !== 0 || early.scrollY !== 0 || settled.scrollY !== 0)
    throw new Error("inspection wheel input leaked into story scroll");
  if (!(early.inspection.targetZoom > 1))
    throw new Error("wheel-up did not enter inspection");
  if (
    !(
      early.inspection.zoom > 1 &&
      early.inspection.zoom < early.inspection.targetZoom
    )
  )
    throw new Error("inspection camera snapped instead of easing");
  if (Math.abs(settled.inspection.zoom - settled.inspection.targetZoom) > 0.01)
    throw new Error("inspection camera failed to settle");
  const expectedFocus = {
    x: 0.5 + (0.68 - 0.5) * 0.42,
    y: 0.5 + (0.56 - 0.5) * 0.42,
  };
  if (
    Math.abs(settled.inspection.focusX - expectedFocus.x) > 0.04 ||
    Math.abs(settled.inspection.focusY - expectedFocus.y) > 0.04
  )
    throw new Error("inspection camera did not settle near damped cursor focus");
  if (settled.transform === "none")
    throw new Error("inspection camera transform was not applied");
  if (settled.willChange !== "transform")
    throw new Error("camera was not promoted during active inspection");
  if (!settled.viewfinder.active)
    throw new Error("viewfinder did not appear during inspection");
  if (
    settled.viewfinder.backingBytes <= 0 ||
    settled.viewfinder.backingBytes > 96 * 1024
  )
    throw new Error(
      `viewfinder backing surface is unexpectedly large: ${settled.viewfinder.backingBytes}`,
    );

  const expected = expectedInspectionCrop(settled.inspection);
  for (const key of ["x", "y", "width", "height"]) {
    if (!near(settled.viewfinder.crop[key], expected[key]))
      throw new Error(
        `viewfinder ${key} differs from camera crop: ${settled.viewfinder.crop[key]} vs ${expected[key]}`,
      );
  }

  if (requestsSettled.length !== requestsBefore.length)
    throw new Error(
      "low-zoom viewfinder motion requested detail assets before they were needed",
    );
  if (
    settled.viewfinder.snapshotCount - before.viewfinder.snapshotCount >
    2
  )
    throw new Error("viewfinder copied the base canvas on camera frames");
  if (settled.sequence.drawCount - before.sequence.drawCount > 1)
    throw new Error("camera spring woke the full sequence renderer repeatedly");

  await page.screenshot({
    path: path.join(OUT, "cursor-inspection-viewfinder.png"),
    fullPage: false,
  });

  const secondCursor = {
    x: rect.x + rect.width * 0.34,
    y: rect.y + rect.height * 0.42,
  };
  await page.mouse.move(secondCursor.x, secondCursor.y);
  await page.waitForTimeout(260);
  const followed = await state(page);
  if (!(followed.inspection.focusX < settled.inspection.focusX))
    throw new Error("inspection camera did not follow the cursor laterally");
  if (!(followed.inspection.focusY < settled.inspection.focusY))
    throw new Error("inspection camera did not follow the cursor vertically");
  if (!(followed.viewfinder.crop.x < settled.viewfinder.crop.x))
    throw new Error("viewfinder did not track lateral camera focus");
  if (!(followed.viewfinder.crop.y < settled.viewfinder.crop.y))
    throw new Error("viewfinder did not track vertical camera focus");

  // Progressive hero detail should promote only after the camera settles.
  await page.mouse.wheel(0, -180);
  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    () => (window.__QUACKLES_SEQUENCE__?.getState().detailWidth ?? 0) >= 2048,
    undefined,
    { timeout: 10000 },
  );
  const promoted2k = await state(page);
  if (!(promoted2k.sequence.detailWidth >= 2048))
    throw new Error(
      `hero inspection did not promote to the 2K tier: ${promoted2k.sequence.detailWidth}`,
    );

  await page.mouse.wheel(0, -180);
  await page.waitForFunction(
    () => (window.__QUACKLES_SEQUENCE__?.getState().detailWidth ?? 0) >= 4096,
    undefined,
    { timeout: 10000 },
  );
  const promoted4k = await state(page);
  if (!(promoted4k.sequence.detailWidth >= 4096))
    throw new Error(
      `hero inspection did not promote to the 4K tiled tier: ${promoted4k.sequence.detailWidth}`,
    );
  if (!(promoted4k.sequence.detailTiles > 0))
    throw new Error("4K hero inspection did not use progressive tiles");

  const detailRequests = await imageRequests(page);
  if (detailRequests.length <= requestsSettled.length)
    throw new Error("progressive inspection did not request higher-resolution assets");

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(24);
  }
  await page.waitForFunction(
    () => !window.__QUACKLES_INSPECTION__?.getState().active,
    undefined,
    { timeout: 5000 },
  );
  await page.waitForTimeout(80);
  const home = await state(page);
  if (Math.abs(home.inspection.zoom - 1) > 0.01)
    throw new Error("inspection camera did not return to 1x");
  if (home.scrollY !== 0)
    throw new Error("zoom-out consumed story position incorrectly");
  if (home.viewfinder.active)
    throw new Error("viewfinder remained visible after returning to 1x");
  if (home.willChange !== "auto")
    throw new Error("camera will-change was not released at rest");

  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(250);
  const released = await state(page);
  if (released.cinematic) {
    if (released.scrollY !== 0)
      throw new Error("desktop story wheel leaked into document scroll");
    if (!(released.cinematic.storyProgress > 0))
      throw new Error("post-inspection wheel was not handed to story authority");
    if (released.viewfinder.active)
      throw new Error("viewfinder appeared during downward story motion");
  } else if (!(released.scrollY > 0)) {
    throw new Error("normal downward mobile story scroll was not released after zoom-out");
  }

  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await mobileContext.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, "deviceMemory", {
        configurable: true,
        get: () => 4,
      });
      Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
        configurable: true,
        get: () => 4,
      });
    } catch {}
  });
  const mobile = await open(mobileContext);
  const mobileBefore = await state(mobile);
  if (mobileBefore.sequence.profile.id !== "balanced")
    throw new Error(
      `mobile capability policy did not select balanced profile: ${mobileBefore.sequence.profile.id}`,
    );

  const cdp = await mobileContext.newCDPSession(mobile);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await mobile.waitForTimeout(350);
  const mobileZoomed = await state(mobile);

  if (!mobileZoomed.viewfinder.active)
    throw new Error("native mobile pinch did not show the viewfinder");
  if (!(mobileZoomed.viewfinder.crop.width < 0.75))
    throw new Error("mobile viewfinder crop does not reflect pinch zoom");
  const mobileBounds = mobileZoomed.viewfinderBounds;
  if (
    !mobileBounds ||
    mobileBounds.left < mobileBounds.viewportLeft - 2 ||
    mobileBounds.top < mobileBounds.viewportTop - 2 ||
    mobileBounds.right > mobileBounds.viewportRight + 2 ||
    mobileBounds.bottom > mobileBounds.viewportBottom + 2
  )
    throw new Error(
      `mobile viewfinder escaped the visual viewport: ${JSON.stringify(mobileBounds)}`,
    );
  if (mobileZoomed.viewfinder.backingBytes > 64 * 1024)
    throw new Error("mobile viewfinder backing surface exceeded 64 KiB");
  if (mobileZoomed.sequence.profile.tileOverscan !== 0)
    throw new Error("mobile profile retained tile overscan");
  if (mobileZoomed.sequence.profile.maxActiveJobs > 2)
    throw new Error("mobile profile allows too many concurrent jobs");
  if (mobileZoomed.sequence.cache.budgetBytes > 64 * 1024 * 1024)
    throw new Error("mobile decoded cache budget is too large");
  if (mobileZoomed.sequence.profile.maxDetailWidth > 8192)
    throw new Error("mobile profile can request an excessive detail tier");

  await mobile.screenshot({
    path: path.join(OUT, "mobile-pinch-viewfinder.png"),
    fullPage: false,
  });

  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });
  await mobile.waitForTimeout(250);
  const mobileHome = await state(mobile);
  if (mobileHome.viewfinder.active)
    throw new Error("mobile viewfinder remained visible after pinch reset");
  await cdp.detach();
  await mobileContext.close();

  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);

  const report = {
    base: BASE,
    desktop: {
      before,
      early,
      settled,
      followed,
      home,
      released,
      promoted2k,
      promoted4k,
      requestsBefore: requestsBefore.length,
      requestsSettled: requestsSettled.length,
      detailRequests: detailRequests.length,
    },
    mobile: {
      before: mobileBefore,
      zoomed: mobileZoomed,
      home: mobileHome,
    },
    errors,
  };
  await fsp.writeFile(
    path.join(OUT, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify({ passed: true, artifact: OUT }, null, 2));
} finally {
  await browser.close();
}
