#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = path.resolve(
  process.env.ARTIFACTS || "artifacts/hero-inspection",
);
const ASSET_ORIGIN = "https://kvnloo.github.io/quackles-assets";
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

const sequenceRequests = (page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) =>
        /\/sequence\/.*\.(?:webp|png|avif)(?:\?|$)/i.test(url),
      ),
  );

const dziRequests = (page) =>
  page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /\/quackles-assets\/.*\.webp(?:\?|$)/i.test(url)),
  );

const assetProxyResponses = [];
async function installAssetProxy(context) {
  await context.route("**/quackles-assets/**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const assetPathname = requestUrl.pathname.replace(/^\/quackles-assets/, "");
    const upstream = `${ASSET_ORIGIN}${assetPathname}`;
    const response = await route.fetch({ url: upstream });
    assetProxyResponses.push({
      requested: requestUrl.pathname,
      upstream,
      status: response.status(),
      contentType: response.headers()["content-type"] ?? null,
    });
    await route.fulfill({ response });
  });
}

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
  await validateInitialSequenceState(page);
  return page;
}

async function validateInitialSequenceState(page) {
  const state = await page.evaluate(() => {
    const s = window.__QUACKLES_SEQUENCE__?.getState();
    const i = window.__QUACKLES_INSPECTION__?.getState();
    return {
      ready: s?.ready,
      manifestId: s?.manifestId,
      frameCount: s?.frameCount,
      errors: s?.errors,
      detailWidth: s?.detailWidth,
      detailTiles: s?.detailTiles,
      inspection: {
        active: i?.active,
        maxZoom: i?.maxZoom,
        zoom: i?.zoom,
      },
    };
  });

  const failures = [];
  if (state.ready !== true) failures.push(`ready: expected true, got ${state.ready}`);
  if (state.manifestId == null) failures.push(`manifestId: expected non-null, got ${state.manifestId}`);
  if (!Number.isFinite(state.frameCount) || state.frameCount <= 0) failures.push(`frameCount: expected > 0, got ${state.frameCount}`);
  if (!Array.isArray(state.errors) || state.errors.length > 0) failures.push(`errors: expected empty, got ${JSON.stringify(state.errors)}`);
  if (!Number.isFinite(state.inspection?.maxZoom) || state.inspection.maxZoom <= 1) failures.push(`inspection.maxZoom: expected > 1, got ${state.inspection?.maxZoom}`);

  if (failures.length > 0) {
    throw new Error(`Sequence initial state validation failed:\n${failures.map(f => `  - ${f}`).join("\n")}`);
  }

  console.log("Sequence initial state OK:", JSON.stringify(state, null, 2));
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
    deviceScaleFactor: 2,
  });
  await installAssetProxy(desktopContext);
  // The native-tier acceptance deliberately exercises the full desktop policy.
  // GitHub's standard ubuntu runner exposes only four CPUs, which correctly
  // selects the balanced production profile. The desktop fixture below forces
  // the full policy instead of depending on CI host capacity.
  await desktopContext.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, "deviceMemory", {
        configurable: true,
        get: () => 8,
      });
      Object.defineProperty(Navigator.prototype, "hardwareConcurrency", {
        configurable: true,
        get: () => 8,
      });
    } catch {}
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

  const requestsBefore = await sequenceRequests(page);
  const initialDziRequests = await dziRequests(page);
  const before = await state(page);
  if (before.sequence.profile.id !== "full")
    throw new Error(
      `native-tier desktop fixture did not select full profile: ${before.sequence.profile.id}`,
    );
  if (initialDziRequests.length)
    throw new Error("initial 1x hero fetched DZI tiles before inspection");
  if (before.viewfinder.active)
    throw new Error("viewfinder should be hidden at 1x");
  if (before.willChange !== "auto")
    throw new Error("camera keeps will-change allocated while idle");

  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(40);
  const early = await state(page);
  await page.waitForTimeout(1100);
  const settled = await state(page);
  const requestsSettled = await sequenceRequests(page);

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
  if (
    Math.abs(settled.inspection.focusX - 0.68) > 0.04 ||
    Math.abs(settled.inspection.focusY - 0.56) > 0.04
  )
    throw new Error("inspection camera did not settle near cursor focus");
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

  await page.waitForTimeout(350);
  const requestsStable = await sequenceRequests(page);
  if (requestsStable.length !== requestsSettled.length)
    throw new Error(
      "stable inspection kept issuing sequence image requests after detail settled",
    );
  if (
    settled.viewfinder.snapshotCount - before.viewfinder.snapshotCount >
    2
  )
    throw new Error("viewfinder copied the base canvas on camera frames");
  if (settled.sequence.drawCount - before.sequence.drawCount > 3)
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
  await page.waitForFunction(
    ({ focusX, focusY, cropX, cropY }) => {
      const inspection = window.__QUACKLES_INSPECTION__?.getState();
      const viewfinder = window.__QUACKLES_VIEWFINDER__?.getState();
      return (
        (inspection?.focusX ?? 1) < focusX &&
        (inspection?.focusY ?? 1) < focusY &&
        (viewfinder?.crop.x ?? 1) < cropX &&
        (viewfinder?.crop.y ?? 1) < cropY
      );
    },
    {
      focusX: settled.inspection.focusX,
      focusY: settled.inspection.focusY,
      cropX: settled.viewfinder.crop.x,
      cropY: settled.viewfinder.crop.y,
    },
    { timeout: 3000 },
  );
  const followed = await state(page);
  if (!(followed.inspection.focusX < settled.inspection.focusX))
    throw new Error("inspection camera did not follow the cursor laterally");
  if (!(followed.inspection.focusY < settled.inspection.focusY))
    throw new Error("inspection camera did not follow the cursor vertically");
  if (!(followed.viewfinder.crop.x < settled.viewfinder.crop.x))
    throw new Error("viewfinder did not track lateral camera focus");
  if (!(followed.viewfinder.crop.y < settled.viewfinder.crop.y))
    throw new Error("viewfinder did not track vertical camera focus");

  // Drive a real high-DPR deep inspection all the way to the policy's max zoom.
  // A fixed wheel-count is not a stable proxy for depth because the zoom curve
  // is deliberately nonlinear and may change without changing the acceptance.
  for (let i = 0; i < 64; i++) {
    const current = await state(page);
    if (
      current.inspection.targetZoom >=
      current.inspection.maxZoom - 0.01
    )
      break;
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(24);
  }
  const driven = await state(page);
  if (
    driven.inspection.targetZoom <
    driven.inspection.maxZoom - 0.01
  )
    throw new Error(
      `deep inspection input stopped at targetZoom=${driven.inspection.targetZoom} of maxZoom=${driven.inspection.maxZoom}`,
    );
  await page.waitForTimeout(5000);
  const deepProbe = await state(page);
  console.log(
    JSON.stringify(
      {
        deepProbe: {
          inspection: deepProbe.inspection,
          detailWidth: deepProbe.sequence.detailWidth,
          detailTiles: deepProbe.sequence.detailTiles,
          requestedTierWidth: deepProbe.sequence.requested?.tierWidth ?? null,
          errors: deepProbe.sequence.errors,
          cache: deepProbe.sequence.cache,
          dziRequests: (await dziRequests(page)).length,
          assetResponses: assetProxyResponses.slice(-8),
        },
      },
      null,
      2,
    ),
  );
  if (deepProbe.sequence.errors.length)
    throw new Error(
      `DZI load failed before native tier settled: ${JSON.stringify(deepProbe.sequence.errors.slice(-4))}`,
    );
  const nativeWidth = await page.evaluate(async () => {
    const sequence = window.__QUACKLES_SEQUENCE__?.getState();
    const theme = sequence?.rendered?.themes?.[0] ?? "blue";
    const frameId = sequence?.rendered?.frameId ?? "p0000000";
    const manifestUrl = performance.getEntriesByType("resource").find((entry) => /\/sequence\/manifest\.json/.test(entry.name))?.name;
    if (!manifestUrl) throw new Error("sequence manifest was not requested");
    const manifest = await (await fetch(manifestUrl)).json();
    const frame = manifest.frames.find((row) => row.id === frameId);
    const widths = frame?.assets?.[theme]?.map((variant) => variant.width) ?? [];
    if (!widths.length) throw new Error(`no variants for ${theme} ${frameId}`);
    return Math.max(...widths);
  });
  if (
    deepProbe.sequence.detailWidth !== nativeWidth &&
    deepProbe.sequence.cache.inflight === 0 &&
    deepProbe.sequence.cache.queued === 0
  )
    throw new Error(
      `native DZI stalled with no pending work: ${JSON.stringify({ detailWidth: deepProbe.sequence.detailWidth, nativeWidth, detailTiles: deepProbe.sequence.detailTiles, requestedTierWidth: deepProbe.sequence.requested?.tierWidth ?? null, inspection: deepProbe.inspection, cache: deepProbe.sequence.cache })}`,
    );
  await page.waitForFunction(
    (width) => {
      const current = window.__QUACKLES_SEQUENCE__?.getState();
      return (
        (current?.detailWidth ?? 0) === width &&
        (current?.detailTiles ?? 0) > 0
      );
    },
    nativeWidth,
    { timeout: 90000 },
  );
  const deep = await state(page);
  const deepDziRequests = await dziRequests(page);
  if (deep.sequence.detailWidth !== nativeWidth)
    throw new Error(`deep inspection stopped at ${deep.sequence.detailWidth}px instead of the ${nativeWidth}px native tier`);
  if (!(deep.sequence.detailTiles > 0))
    throw new Error("deep inspection did not paint DZI tiles");
  if (!deepDziRequests.some((url) => /\/quackles-assets\/blue\/p0000000\/0\//.test(url)))
    throw new Error("deep inspection never requested level-0 native 200MP tiles");
  const failedDzi = assetProxyResponses.filter(
    (entry) =>
      entry.requested.includes("/quackles-assets/") &&
      (entry.status !== 200 || !entry.contentType?.includes("image/webp")),
  );
  if (failedDzi.length)
    throw new Error(`real DZI proxy returned invalid assets: ${JSON.stringify(failedDzi.slice(0, 4))}`);
  const deepRequestCount = deepDziRequests.length;
  await page.waitForTimeout(650);
  if ((await dziRequests(page)).length !== deepRequestCount)
    throw new Error("settled deep inspection kept issuing DZI requests");

  // Unwind by the actual inspection state. Stopping before one extra positive
  // wheel event matters because once targetZoom reaches 1 that input belongs
  // to normal story scroll, which is asserted separately below.
  for (let i = 0; i < 64; i++) {
    const current = await state(page);
    if (current.inspection.targetZoom <= 1.0005) break;
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(24);
  }
  const unwound = await state(page);
  if (unwound.inspection.targetZoom > 1.0005)
    throw new Error(
      `zoom-out input stopped at targetZoom=${unwound.inspection.targetZoom}`,
    );
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
  if (!(released.scrollY > 0))
    throw new Error("normal downward story scroll was not released after zoom-out");
  if (released.viewfinder.active)
    throw new Error("viewfinder appeared during downward story scroll");

  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, -520);
    await page.waitForTimeout(55);
  }
  await page.waitForFunction(
    () =>
      window.scrollY <= 2 &&
      (window.__QUACKLES_SEQUENCE__?.getState().current.progress ?? 1) <= 0.012,
    undefined,
    { timeout: 6000 },
  );
  const rewound = await state(page);
  if (rewound.scrollY > 2 || rewound.sequence.current.progress > 0.012)
    throw new Error("upward story rewind did not return to the hero boundary");

  // Continuous upward input is allowed to cross directly from story rewind
  // into inspection. If the rewind gesture ended exactly at hero, the next
  // upward wheel must enter inspection without leaking back into story scroll.
  let reinspected = rewound;
  if (!rewound.viewfinder.active) {
    await page.mouse.move(firstCursor.x, firstCursor.y);
    await page.mouse.wheel(0, -180);
    await page.waitForTimeout(1000);
    reinspected = await state(page);
  }
  if (!(reinspected.inspection?.zoom > 1.02))
    throw new Error("scroll-up after story rewind did not re-enter inspection");
  if (!reinspected.viewfinder.active)
    throw new Error("viewfinder did not return with renewed inspection");
  if (reinspected.scrollY !== 0)
    throw new Error("renewed inspection leaked back into story scroll");

  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await installAssetProxy(mobileContext);
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
  if (mobileZoomed.sequence.profile.maxActiveJobs > 6)
    throw new Error("mobile profile allows too many concurrent jobs");
  if (mobileZoomed.sequence.cache.budgetBytes > 64 * 1024 * 1024)
    throw new Error("mobile decoded cache budget is too large");


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
      deep,
      deepDziRequests: deepDziRequests.length,
      home,
      released,
      requestsBefore: requestsBefore.length,
      requestsSettled: requestsSettled.length,
      requestsStable: requestsStable.length,
      rewound,
      reinspected,
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
