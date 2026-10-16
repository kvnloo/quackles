#!/usr/bin/env node
/**
 * Forced-redraw probe (#53 Wave 2A). For each ref: settle at a state, then fire one redraw trigger at a time and count the
 * detail paints it causes and their main-thread cost (Long Animation Frame entries that contain the paint).
 *
 *   node scripts/lab/redraw-probe.mjs --refs <sha>[,<sha>] [--trials 3] --out FILE.json
 *
 * States: 2.5x at (0.45, 0.55) (Blue 201MP: the budget fallback paints coverage == crop, zero slack) and 8x interior
 * (normal 40% buffer, the control). Triggers (fired at rest, 2.5 s apart):
 *   unchanged     __QUACKLES_SEQUENCE__.setProgress(current)  - a render request that changes nothing
 *   theme-same    __QUACKLES_SEQUENCE__.setTheme(current)      - a theme request that changes nothing
 *   theme-switch  setTheme(white) then setTheme(blue)            - a real visual change (paints are legitimate)
 *   late-plate    adjacent-frame plates held back 6 s by the route, so their decodes land after the view settled
 *   resize        viewport +1 px wide, then restored             - a real geometry change (paints are legitimate)
 * Builds come from run.mjs's LAB_DIR worktrees (out/ must exist), served with scripts/static-server.mjs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const LAB_DIR = path.resolve(process.env.LAB_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "quackles-lab"));
const REFS = (arg("refs") || "").split(",").filter(Boolean), TRIALS = Number(arg("trials", "3")), OUT = arg("out");
if (!REFS.length || !OUT) { console.error("usage: --refs SHA[,SHA] --out FILE.json [--trials N]"); process.exit(2); }
const STATES = [{ id: "2.5x-zero-slack", zoom: 2.5, x: 0.45, y: 0.55 }, { id: "8x-interior", zoom: 8, x: 0.6, y: 0.4 }];
const TRIGGERS = ["unchanged", "theme-same", "theme-switch", "late-plate", "resize"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLLECT = () => {
  const C = (window.__rp = { paints: [], loaf: [] });
  addEventListener("quackles:detail-painted", () => C.paints.push(performance.now()));
  new PerformanceObserver((l) => { for (const e of l.getEntries()) C.loaf.push([e.startTime, e.duration]); }).observe({ type: "long-animation-frame" });
};

async function settle(page) {
  return page.waitForFunction(() => {
    const st = window.__QUACKLES_SEQUENCE__.getState(), i = window.__QUACKLES_INSPECTION__.getState();
    const frame = document.querySelector(".poster-frame").getBoundingClientRect();
    const need = Math.min(Math.ceil(frame.width * devicePixelRatio * i.zoom), 11584);
    const last = window.__rp.paints.at(-1) ?? 0;
    return !i.cameraMoving && st.detailWidth >= 0.98 * need && performance.now() - last > 1500;
  }, undefined, { timeout: 25000, polling: 100 }).then(() => true).catch(() => false);
}

async function probe(browser, port, state, trigger) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  let holdPlates = false; const held = [];
  await ctx.route(/\/sequence\/.*\.(webp|png)$/, async (route) => { if (holdPlates) held.push(route); else await route.continue(); });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, undefined, { timeout: 60000 });
  await sleep(3000);
  await page.evaluate(COLLECT);
  if (trigger === "late-plate") holdPlates = true; // plates requested from here on arrive late
  await page.evaluate(({ zoom, x, y }) => window.__QUACKLES_INSPECTION__.setTarget(zoom, x, y), state);
  const settled = await settle(page);
  const t0 = await page.evaluate(() => performance.now());
  const before = await page.evaluate(() => ({ paints: window.__rp.paints.length, theme: window.__QUACKLES_SEQUENCE__.getState().current.theme }));
  if (trigger === "unchanged") await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__; s.setProgress(s.getState().current.progress); });
  else if (trigger === "theme-same") await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__; s.setTheme("blue"); });
  else if (trigger === "theme-switch") { await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("white")); await sleep(1200); await page.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("blue")); }
  else if (trigger === "late-plate") { holdPlates = false; for (const r of held.splice(0)) await r.continue().catch(() => {}); }
  else if (trigger === "resize") { await page.setViewportSize({ width: 1441, height: 1000 }); await sleep(600); await page.setViewportSize({ width: 1440, height: 1000 }); }
  await sleep(2500);
  const after = await page.evaluate((t0) => {
    const C = window.__rp, paints = C.paints.filter((t) => t >= t0);
    // Main-thread cost of each paint: the Long Animation Frame that contains it (frames < 50 ms are not reported).
    const costs = paints.map((t) => C.loaf.find(([s, d]) => t >= s && t <= s + d)?.[1] ?? null);
    const st = window.__QUACKLES_SEQUENCE__.getState(), i = window.__QUACKLES_INSPECTION__.getState();
    return { paints: paints.length, loafMs: costs.filter((c) => c != null).map((c) => Math.round(c)), zoom: i.zoom, detailWidth: st.detailWidth, crop: document.querySelector(".sequence-detail").dataset.crop, decodes: st.cache.completedDecodes };
  }, t0);
  const shotPath = path.join(path.dirname(OUT), "probe-shots", `${state.id}-${trigger}-${PORTREF[port].slice(0, 8)}-t${CUR.t}.png`);
  fs.mkdirSync(path.dirname(shotPath), { recursive: true });
  await page.locator(".poster-frame").screenshot({ path: shotPath });
  await ctx.close();
  return { state: state.id, trigger, settled, held: held.length, before, ...after, shot: path.relative(REPO, shotPath) };
}

const LIMIT = Number(arg("limit", "0"));
const results = []; let port = 46010; const servers = []; const PORTREF = {}; const CUR = { t: 0 };
const ports = Object.fromEntries(REFS.map((sha) => {
  const dir = path.join(LAB_DIR, "worktrees", sha, "out");
  if (!fs.existsSync(dir)) throw new Error(`no build for ${sha}: run scripts/lab/run.mjs on it first`);
  servers.push(spawn("node", [path.join(REPO, "scripts/static-server.mjs"), "--port", String(port), "--directory", dir], { stdio: "ignore" }));
  PORTREF[port] = sha; return [sha, port++];
}));
await sleep(1500);
const browser = await chromium.launch({ executablePath: process.env.CHROME || "/opt/pw-browsers/chromium", headless: true, args: ["--no-sandbox", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] });
try {
  for (let t = 1; t <= TRIALS; t++) for (const state of STATES) for (const trigger of TRIGGERS) {
    CUR.t = t;
    // Rotate ref order per cell so no ref always runs first.
    const order = REFS.map((_, k) => REFS[(k + t + results.length) % REFS.length]);
    for (const sha of order) {
      const r = { ref: sha, trial: t, ...(await probe(browser, ports[sha], state, trigger)) };
      results.push(r);
      console.error(`[probe] t${t} ${sha.slice(0, 8)} ${state.id} ${trigger}: paints ${r.paints} loaf ${JSON.stringify(r.loafMs)} settled ${r.settled}`);
      if (LIMIT && results.length >= LIMIT) break;
    }
  }
  // Pixel diff of each ref's end state against the first ref's (same state, trigger, trial): skipped paints must not change pixels.
  const dp = await browser.newPage();
  for (const r of results.filter((x) => x.ref !== REFS[0])) {
    const base = results.find((x) => x.ref === REFS[0] && x.state === r.state && x.trigger === r.trigger && x.trial === r.trial);
    if (!base) continue;
    r.diffVsFirst = await dp.evaluate(async ([a, b]) => {
      const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: true };
      const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const pa = px(ia), pb = px(ib); let max = 0, over8 = 0;
      for (let k = 0; k < pa.length; k += 4) { const m = Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2])); max = Math.max(max, m); if (m > 8) over8++; }
      return { maxDiff: max, pctOver8: +((100 * over8) / (pa.length / 4)).toFixed(4) };
    }, [base.shot, r.shot].map((f) => `data:image/png;base64,${fs.readFileSync(path.join(REPO, f)).toString("base64")}`));
  }
} finally { await browser.close(); for (const s of servers) s.kill("SIGTERM"); }
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ host: `${os.cpus()[0]?.model} x${os.cpus().length}`, browser: browser.version(), states: STATES, triggers: TRIGGERS, results }, null, 1) + "\n");
