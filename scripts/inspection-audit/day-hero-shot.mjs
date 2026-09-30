#!/usr/bin/env node
/** Screenshot the Day hero in the real page (1x and zoom) for before/after evidence. OUT_DIR(+BASE_PATH), SHOT=<png prefix>. */
import fs from "node:fs";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR, port = process.env.PORT || "43900", pre = process.env.SHOT;
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("day")); await page.waitForTimeout(2500);
fs.writeFileSync(`${pre}-1x.png`, await page.screenshot());
const s = await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState()); console.log(JSON.stringify({ errors: s.errors.length, pageErrors: errs, theme: s.current.presented, ready: s.ready }));
await browser.close(); server.kill();
