#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE_URL || "http://127.0.0.1:43217";
const OUT = path.resolve(process.env.ARTIFACTS || "artifacts/branch-visual");
const LABEL = process.env.LABEL || "branch";
const CHROME =
  process.env.CHROME ||
  ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium"]
    .find((candidate) => fs.existsSync(candidate));

if (!CHROME) throw new Error("Chrome/Chromium is required");
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
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 1 });

const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

async function pause(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function state() {
  return page.evaluate(() => ({
    debug: window.__QUACKLES_DEBUG__?.getState?.() ?? null,
    sequence: window.__QUACKLES_SEQUENCE__?.getState?.() ?? null,
    desktop: window.__QUACKLES_DESKTOP__?.getState?.() ?? null,
    scrollY,
    scrollHeight: document.documentElement.scrollHeight,
    canvas: [...document.querySelectorAll("canvas")].map((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      rect: canvas.getBoundingClientRect().toJSON(),
      visibility: getComputedStyle(canvas).visibility,
      opacity: getComputedStyle(canvas).opacity,
    })),
  }));
}

async function setProgress(progress) {
  await page.evaluate((p) => {
    if (window.__QUACKLES_DEBUG__?.setProgress) {
      window.__QUACKLES_DEBUG__.setProgress(p);
      return;
    }
    if (window.__QUACKLES_SEQUENCE__?.setProgress) {
      window.__QUACKLES_SEQUENCE__.setProgress(p);
      return;
    }
    window.scrollTo(
      0,
      p * Math.max(1, document.documentElement.scrollHeight - innerHeight),
    );
  }, progress);
  await pause(1300);
}

async function shot(name) {
  const target = path.join(OUT, `${LABEL}-${name}.png`);
  await page.screenshot({ path: target, fullPage: false });
  return target;
}

try {
  await page.goto(BASE, { waitUntil: "networkidle0", timeout: 120000 });
  await pause(2500);
  const checkpoints = [
    ["hero", 0],
    ["inspect", 0.18],
    ["impact", 0.56],
    ["exploded", 0.84],
  ];
  const report = { label: LABEL, base: BASE, errors, checkpoints: {} };
  for (const [name, progress] of checkpoints) {
    await setProgress(progress);
    report.checkpoints[name] = {
      progress,
      state: await state(),
      screenshot: await shot(name),
    };
  }
  await fsp.writeFile(
    path.join(OUT, `${LABEL}-state.json`),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
