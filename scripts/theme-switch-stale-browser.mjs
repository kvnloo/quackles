import fs from "node:fs"; import crypto from "node:crypto"; import { spawn } from "node:child_process"; import { chromium } from "playwright-core";
import sharp from "sharp";
const raw = async (b) => (await sharp(b).removeAlpha().raw().toBuffer());
const diff = async (a, b) => { const x = await raw(a), y = await raw(b); let sum = 0, big = 0; for (let i = 0; i < x.length; i++) { const d = Math.abs(x[i] - y[i]); sum += d; if (d > 8) big++; } return { meanAbs: +(sum / x.length).toFixed(4), fracOver8: +(big / x.length).toFixed(6) }; };
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "43330";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
async function session(fn) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.route("**/quackles-assets/**", async (route) => { const u = new URL(route.request().url()); await route.fulfill({ response: await route.fetch({ url: "https://kvnloo.github.io/quackles-assets" + u.pathname.replace(/^\/quackles-assets/, "") }) }); });
  await page.goto(process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0);
  const r = await fn(page); await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await page.close(); return r;
}
const shot = async (p) => { const b = await p.screenshot(); return { h: crypto.createHash("sha256").update(b).digest("hex").slice(0, 12), b }; };
const info = (p) => p.evaluate(() => { const d = document.querySelector(".sequence-detail"); const s = window.__QUACKLES_SEQUENCE__.getState(); return { detailW: s.detailWidth, detailTiles: s.detailTiles, vis: d && getComputedStyle(d).visibility, op: d && getComputedStyle(d).opacity, zoom: s.inspection.zoom }; });
const fresh = await session(async (p) => { await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("dark")); await p.waitForTimeout(1500); return { ...(await shot(p)), info: await info(p) }; });
const after = await session(async (p) => {
  await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("blue")); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28)); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("dark")); await p.waitForTimeout(2000);
  return { ...(await shot(p)), info: await info(p) };
});
const freshZ = await session(async (p) => { await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("dark")); await p.waitForTimeout(1500); await p.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28)); await p.waitForTimeout(3000); return { ...(await shot(p)), info: await info(p) }; });
const afterZ = await session(async (p) => {
  await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("blue")); await p.waitForTimeout(1000);
  await p.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28)); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("dark")); await p.waitForTimeout(2500);
  await p.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.44, 0.28)); await p.waitForTimeout(3000); // same camera as the fresh session: compare scene content only
  return { ...(await shot(p)), info: await info(p) };
});
fs.writeFileSync(process.env.SHOTS ? process.env.SHOTS + "/dark-zoomed-fresh.png" : "/dev/null", freshZ.b); fs.writeFileSync(process.env.SHOTS ? process.env.SHOTS + "/dark-zoomed-after-blue.png" : "/dev/null", afterZ.b);
console.log(JSON.stringify({ zoomedRace: { fresh: { h: freshZ.h, ...freshZ.info }, afterBlue: { h: afterZ.h, ...afterZ.info }, ...(await diff(freshZ.b, afterZ.b)) } }));
fs.writeFileSync("/tmp/claude-1000/-home-kvn-zer0/f9c8cd29-c156-4287-97b6-8792e3114769/scratchpad/dark-fresh.png", fresh.b); fs.writeFileSync("/tmp/claude-1000/-home-kvn-zer0/f9c8cd29-c156-4287-97b6-8792e3114769/scratchpad/dark-after-blue.png", after.b);
console.log(JSON.stringify({ fresh: { h: fresh.h, ...fresh.info }, afterBlueZoom: { h: after.h, ...after.info }, ...(await diff(fresh.b, after.b)) }));
await browser.close(); server.kill();
const ok = (d) => d.meanAbs <= 0.5 && d.fracOver8 <= 0.0005;
const d1 = await diff(fresh.b, after.b), d2 = await diff(freshZ.b, afterZ.b);
console.log(JSON.stringify({ tolerance: "meanAbs<=0.5, fracOver8<=0.0005", reset: d1, zoomedRace: d2, pass: ok(d1) && ok(d2) }));
process.exit(ok(d1) && ok(d2) ? 0 : 1);
