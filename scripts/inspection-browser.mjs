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

if (!CHROME) throw new Error("Hero inspection validation requires Chrome/Chromium");
await fsp.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const state = () =>
  page.evaluate(() => ({
    inspection: window.__QUACKLES_INSPECTION__?.getState() ?? null,
    sequence: window.__QUACKLES_SEQUENCE__?.getState() ?? null,
    scrollY,
    transform: getComputedStyle(
      document.querySelector(".sequence-camera"),
    ).transform,
    origin: getComputedStyle(
      document.querySelector(".sequence-camera"),
    ).transformOrigin,
  }));

try {
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForFunction(
    () =>
      window.__QUACKLES_SEQUENCE__?.getState().ready &&
      window.__QUACKLES_INSPECTION__?.getState().maxZoom > 1.05,
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

  const before = await state();
  await page.mouse.wheel(0, -180);
  await page.waitForTimeout(40);
  const early = await state();
  await page.waitForTimeout(700);
  const settled = await state();

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

  await page.screenshot({
    path: path.join(OUT, "cursor-inspection.png"),
    fullPage: false,
  });

  const secondCursor = {
    x: rect.x + rect.width * 0.34,
    y: rect.y + rect.height * 0.42,
  };
  await page.mouse.move(secondCursor.x, secondCursor.y);
  await page.waitForTimeout(260);
  const followed = await state();
  if (!(followed.inspection.focusX < settled.inspection.focusX))
    throw new Error("inspection camera did not follow the cursor laterally");
  if (!(followed.inspection.focusY < settled.inspection.focusY))
    throw new Error("inspection camera did not follow the cursor vertically");

  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 240);
    await page.waitForTimeout(24);
  }
  await page.waitForFunction(
    () => !window.__QUACKLES_INSPECTION__?.getState().active,
    undefined,
    { timeout: 5000 },
  );
  const home = await state();
  if (Math.abs(home.inspection.zoom - 1) > 0.01)
    throw new Error("inspection camera did not return to 1x");
  if (home.scrollY !== 0)
    throw new Error("zoom-out consumed story position incorrectly");

  await page.mouse.wheel(0, 420);
  await page.waitForTimeout(250);
  const released = await state();
  if (!(released.scrollY > 0))
    throw new Error("normal downward story scroll was not released after zoom-out");
  if (errors.length) throw new Error(`page errors: ${errors.join(" | ")}`);

  const report = {
    base: BASE,
    before,
    early,
    settled,
    followed,
    home,
    released,
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
