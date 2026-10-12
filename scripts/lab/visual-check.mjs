#!/usr/bin/env node
/**
 * Settled-state visual check (#53): same states on each ref, pixel diff of each candidate against the base.
 * Each state: cold context, setTarget, then wait until the camera is at rest, the painted detail tier covers the need,
 * and no detail paint for 1.5 s (max 25 s; `settled.timedOut` otherwise). Cache activity is recorded in `settled.busy`,
 * not required: nightly's FrameCache never idles at rest. Screenshot = the .poster-frame box. Diff runs in a separate blank page (the
 * measured app is never read back). Uses the builds/servers prepared by run.mjs (LAB_DIR worktrees with out/).
 *
 *   node scripts/lab/visual-check.mjs --base <sha> --cand <sha>[,<sha>] --out experiments/results/<run>/visual.json
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
const base = arg("base"), cands = (arg("cand") || "").split(",").filter(Boolean), OUT = arg("out");
if (!base || !cands.length || !OUT) { console.error("usage: --base SHA --cand SHA[,SHA] --out FILE.json"); process.exit(2); }
const STATES = [
  { id: "low-zoom-1.19", zoom: 1.19, x: 0.5, y: 0.5 },
  { id: "edge-2.5x", zoom: 2.5, x: 0, y: 0.5 },
  { id: "interior-8x", zoom: 8, x: 0.6, y: 0.4 },
  { id: "corner-6x", zoom: 6, x: 0.9, y: 0.95 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = path.join(path.dirname(OUT), "visual");
fs.mkdirSync(outDir, { recursive: true });

async function shoot(browser, sha, port, state) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, undefined, { timeout: 60000 });
  await sleep(3000);
  await page.evaluate(() => { window.__vcPaint = performance.now(); addEventListener("quackles:detail-painted", () => { window.__vcPaint = performance.now(); }); });
  await page.evaluate(({ zoom, x, y }) => window.__QUACKLES_INSPECTION__.setTarget(zoom, x, y), state);
  const t0 = Date.now();
  let settled = null;
  while (Date.now() - t0 < 25000) {
    await sleep(250);
    const s = await page.evaluate(() => {
      const st = window.__QUACKLES_SEQUENCE__.getState(), i = window.__QUACKLES_INSPECTION__.getState();
      const frame = document.querySelector(".poster-frame").getBoundingClientRect();
      // Sharp: the painted tier covers the need (frame device px x zoom, capped at the 201MP fixture width), as in run.mjs.
      const need = Math.min(Math.ceil(frame.width * devicePixelRatio * i.zoom), 11584);
      return { moving: i.cameraMoving, sharp: i.zoom < 1.02 || st.detailWidth >= 0.98 * need, need, busy: (st.cache?.inflight ?? 0) + (st.cache?.queued ?? 0), quietMs: performance.now() - window.__vcPaint, detailWidth: st.detailWidth, zoom: i.zoom };
    });
    // Settled = camera at rest and no detail paint for 1.5 s. Cache activity is reported, not required: nightly's FrameCache
    // never idles at rest (decode/evict loop, #53 wave 2), so an idle-cache criterion never holds.
    if (!s.moving && s.sharp && s.quietMs > 1500) { settled = s; break; }
    settled = { ...s, timedOut: true };
  }
  const box = await page.locator(".poster-frame").boundingBox();
  const file = path.join(outDir, `${state.id}-${sha.slice(0, 8)}.png`);
  await page.screenshot({ path: file, clip: box });
  await ctx.close();
  return { file, settled };
}

const servers = [], ports = {};
let port = 45990;
for (const sha of [base, ...cands]) {
  const dir = path.join(LAB_DIR, "worktrees", sha, "out");
  if (!fs.existsSync(dir)) throw new Error(`no build for ${sha} in ${dir}: run scripts/lab/run.mjs on it first`);
  ports[sha] = port;
  servers.push(spawn("node", [path.join(REPO, "scripts/static-server.mjs"), "--port", String(port++), "--directory", dir], { stdio: "ignore" }));
}
await sleep(1500);
const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium";
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] });
const results = [];
try {
  for (const state of STATES) {
    const shots = {};
    for (const sha of [base, ...cands]) shots[sha] = await shoot(browser, sha, ports[sha], state);
    const diffPage = await browser.newPage();
    for (const cand of cands) {
      const d = await diffPage.evaluate(async ([a, b]) => {
        const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { sizeMismatch: [ia.width, ia.height, ib.width, ib.height] };
        const px = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
        const pa = px(ia), pb = px(ib);
        let max = 0, sum = 0, over8 = 0;
        for (let k = 0; k < pa.length; k += 4) {
          const m = Math.max(Math.abs(pa[k] - pb[k]), Math.abs(pa[k + 1] - pb[k + 1]), Math.abs(pa[k + 2] - pb[k + 2]));
          max = Math.max(max, m); sum += m; if (m > 8) over8++;
        }
        const n = pa.length / 4;
        return { pixels: n, maxDiff: max, meanDiff: +(sum / n).toFixed(4), pctOver8: +((100 * over8) / n).toFixed(4) };
      }, [`data:image/png;base64,${fs.readFileSync(shots[base].file).toString("base64")}`, `data:image/png;base64,${fs.readFileSync(shots[cand].file).toString("base64")}`]);
      results.push({ state: state.id, base, cand, baseSettled: shots[base].settled, candSettled: shots[cand].settled, diff: d, files: [path.relative(REPO, shots[base].file), path.relative(REPO, shots[cand].file)] });
      console.error(`[visual] ${state.id} ${cand.slice(0, 8)} vs ${base.slice(0, 8)}: ${JSON.stringify(d)} settled ${!!shots[base].settled}/${!!shots[cand].settled}`);
    }
    await diffPage.close();
  }
} finally {
  await browser.close();
  for (const s of servers) s.kill("SIGTERM");
}
fs.writeFileSync(OUT, JSON.stringify({ viewport: "1440x1000@2", states: STATES, results }, null, 1) + "\n");
