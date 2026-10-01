// I10 Blue chrome (owner-confirmed, Sep 18: 0dfff12 + 3f05727): on the Blue theme the page chrome is the
// full-bleed cobalt field #0000f2 on html, body and the top nav (no darker #0000c2 deep, no paper-strip
// gradient). Other themes keep their own chrome. Phone viewport; computed styles at landing and after a
// round trip through every theme. SHOTS=<dir> also saves one phone screenshot per theme.
import fs from "node:fs"; import { spawn } from "node:child_process"; import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43341";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
await page.route("**/quackles-assets/**", async (route) => { const u = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) }); });
await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`);
await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
const chrome = () => page.evaluate(() => {
  const bg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
  const nav = document.querySelector(".site-nav");
  return { theme: window.__QUACKLES_SEQUENCE__.getState().current?.theme ?? null, tone: document.documentElement.dataset.tone, html: bg(document.documentElement), body: bg(document.body), nav: bg(nav), navImage: nav ? getComputedStyle(nav).backgroundImage : null };
});
const W = "rgb(0, 0, 242)";
const blueOk = (c) => c.html === W && c.body === W && c.nav === W && c.navImage === "none";
const results = { landing: await chrome() };
for (const id of ["day", "white", "blue", "dark", "night", "blue"]) {
  await page.evaluate((t) => window.__QUACKLES_SEQUENCE__.setTheme(t), id);
  await page.waitForTimeout(1800);
  const c = await chrome(); results[results[id] ? id + "-again" : id] = c;
  if (process.env.SHOTS && !results[id + "-again"]) { fs.mkdirSync(process.env.SHOTS, { recursive: true }); fs.writeFileSync(`${process.env.SHOTS}/${id}.png`, await page.screenshot()); }
}
await browser.close(); server.kill();
const checks = {
  landingBlue: results.landing.tone === "blue" && blueOk(results.landing),
  blueAfterRoundTrip: blueOk(results.blue) && blueOk(results["blue-again"]),
  otherThemesNotCobalt: ["day", "white", "dark", "night"].every((t) => results[t].tone === t && results[t].html !== W && results[t].body !== W),
  noPageErrors: errors.length === 0,
};
const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ results, errors, checks, pass }, null, 1));
process.exit(pass ? 0 : 1);
