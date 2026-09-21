#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.BASE_URL || "http://127.0.0.1:43218/quackles";
const out = path.resolve(process.env.ARTIFACTS || "artifacts/blind-pages");
const channels = JSON.parse(process.env.CHANNELS_JSON || "[]");
const chrome = process.env.CHROME_BIN || undefined;

fs.mkdirSync(out, { recursive: true });

function safe(name) {
  return String(name).replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "");
}
function clip(box, fx, fy, fw, fh) {
  const x = box.x + box.width * fx;
  const y = box.y + box.height * fy;
  const width = Math.max(1, Math.min(box.width * fw, box.x + box.width - x));
  const height = Math.max(1, Math.min(box.height * fh, box.y + box.height - y));
  return { x, y, width, height };
}

const browser = await chromium.launch({
  headless: true,
  ...(chrome ? { executablePath: chrome } : {}),
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const context = await browser.newContext({
  viewport: { width: 430, height: 932 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

const summary = [];
const aliases = {};
for (const item of channels) {
  const alias = item.alias;
  aliases[alias] = {
    branch: item.branch,
    sha: item.sha,
    path: item.path,
    build: item.build,
  };
  const dir = path.join(out, `candidate-${safe(alias)}`);
  fs.mkdirSync(dir, { recursive: true });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  const url = `${base}/${item.path.replace(/^\/+|\/+$/g, "")}/`;
  let ok = true;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
    await page.evaluate(async () => {
      await document.fonts?.ready;
      await Promise.all([...document.images].map((img) => img.decode?.().catch(() => {})));
    });
    await page.waitForTimeout(900);

    const facts = await page.evaluate(() => ({
      title: document.title,
      width: innerWidth,
      height: innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      buildMeta: document.querySelector('meta[name="microduck-build"]')?.getAttribute("content") ?? null,
      bodyText: document.body.innerText.slice(0, 1600),
    }));

    const stages = [
      ["hero", 0],
      ["motion-a", 0.34],
      ["motion-b", 0.66],
      ["end", 0.94],
    ];
    for (const [name, progress] of stages) {
      await page.evaluate((p) => {
        const max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
        scrollTo({ top: max * p, behavior: "instant" });
      }, progress);
      await page.waitForTimeout(450);
      await page.screenshot({ path: path.join(dir, `${name}.png`), type: "png" });
    }

    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    const box =
      (await page.locator(".poster-frame").first().boundingBox().catch(() => null)) ||
      (await page.locator("main").first().boundingBox().catch(() => null)) ||
      { x: 0, y: 0, width: 430, height: 760 };

    const crops = [
      ["top-left", 0.00, 0.00, 0.56, 0.38],
      ["robot-center", 0.18, 0.18, 0.64, 0.62],
      ["plinth-left", 0.00, 0.48, 0.60, 0.48],
      ["orb-right", 0.48, 0.20, 0.52, 0.55],
    ];
    for (const [name, x, y, w, h] of crops) {
      await page.screenshot({
        path: path.join(dir, `crop-${name}.png`),
        type: "png",
        clip: clip(box, x, y, w, h),
      });
    }

    fs.writeFileSync(
      path.join(dir, "facts.json"),
      JSON.stringify({ alias, url: `candidate-${alias}`, facts, errors }, null, 2),
    );
    summary.push({ alias, ok, facts, errors });
  } catch (error) {
    ok = false;
    errors.push(error instanceof Error ? error.stack || error.message : String(error));
    fs.writeFileSync(path.join(dir, "ERROR.txt"), errors.join("\n"));
    summary.push({ alias, ok, errors });
  } finally {
    await page.close();
  }
}

fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(summary, null, 2));
fs.writeFileSync(path.resolve(process.env.MAPPING_OUT || "artifacts/blind-pages-map.json"), JSON.stringify(aliases, null, 2));
await browser.close();
