#!/usr/bin/env node
/**
 * Settled-state visual check (#53): identical targets, candidate pixels against base.
 * Waits for camera rest, sufficient painted detail, and 1.5 s without detail paint
 * (25 s maximum). Cache activity is reported, not required. Captures only settled
 * checkpoints, never per-frame readback or timed performance evidence. Pixel diff
 * runs in a separate owned blank page, never on the measured app.
 *
 * Desktop: --base SHA --cand SHA[,SHA] --out FILE.json
 * Attached: add --cdp URL --prepared-builds FILE.json [--provenance TEXT].
 * Prepared manifest: { assets: {...}, builds: [{sha, status: "built"|"cached",
 * port: 47940, ...}] }; an explicit http(s) `url` can replace `port`.
 * Attached mode preserves native viewport/DPR and closes only owned pages.
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const HERE = path.dirname(fileURLToPath(import.meta.url)), REPO = path.resolve(HERE, "../..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const LAB_DIR = path.resolve(process.env.LAB_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "quackles-lab"));
const base = arg("base"), cands = (arg("cand") || "").split(",").filter(Boolean), OUT = arg("out");
const CDP = arg("cdp"), PREPARED = arg("prepared-builds");
if (!base || !cands.length || !OUT || (CDP && !PREPARED)) {
  console.error("usage: --base SHA --cand SHA[,SHA] --out FILE.json [--cdp URL --prepared-builds FILE.json] [--provenance TEXT]");
  process.exit(2);
}
const STATES = [
  { id: "low-zoom-1.19", zoom: 1.19, x: 0.5, y: 0.5 },
  { id: "edge-2.5x", zoom: 2.5, x: 0, y: 0.5 },
  { id: "interior-8x", zoom: 8, x: 0.6, y: 0.4 },
  { id: "corner-6x", zoom: 6, x: 0.9, y: 0.95 },
  { id: "story-0.12", progress: 0.12 },
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const outDir = path.join(path.dirname(OUT), "visual");
fs.mkdirSync(outDir, { recursive: true });

// Android Chrome cannot create isolated contexts. Use its existing context without
// changing context-wide settings, storage, cache, routes, or any pre-existing page.
async function ownedPage(browser) {
  let context, page, cdp;
  try {
    context = CDP ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, serviceWorkers: "block" });
    if (!context) throw new Error("attached browser has no default context");
    page = await context.newPage();
    if (CDP) {
      cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
    }
    return { page, close: async () => {
      try { if (cdp) await cdp.detach(); }
      finally { if (CDP) await page.close(); else await context.close(); }
    } };
  } catch (error) {
    try { if (CDP) { if (page) await page.close(); } else if (context) await context.close(); }
    catch { /* Preserve the original setup failure. */ }
    throw error;
  }
}

async function nativeState(page) {
  const s = await page.evaluate(() => ({ visibility: document.visibilityState, hasFocus: document.hasFocus(), viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, userAgent: navigator.userAgent }));
  if (CDP && (s.visibility !== "visible" || !s.hasFocus)) throw new Error(`native Chrome focus/visibility gate failed: ${JSON.stringify(s)}`);
  return s;
}

async function shoot(browser, sha, url, state) {
  const owned = await ownedPage(browser), { page } = owned;
  try {
    if (CDP) await page.bringToFront();
    await page.goto(url, { waitUntil: "load" });
    await nativeState(page);
    if (CDP) await page.evaluate(async () => { window.__vcWakeLock = await navigator.wakeLock.request("screen"); });
    await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, undefined, { timeout: 60000 });
    await sleep(3000);
    await page.evaluate(() => {
      window.__vcPaint = performance.now();
      window.__vcNativeLost = false;
      const check = () => { if (document.visibilityState !== "visible" || !document.hasFocus()) window.__vcNativeLost = true; };
      addEventListener("visibilitychange", check); addEventListener("blur", check);
      addEventListener("quackles:detail-painted", () => { window.__vcPaint = performance.now(); });
    });
    if (state.progress != null) await page.evaluate((p) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * p), state.progress);
    else await page.evaluate(({ zoom, x, y }) => window.__QUACKLES_INSPECTION__.setTarget(zoom, x, y), state);
    const t0 = Date.now();
    let settled = null;
    while (Date.now() - t0 < 25000) {
      await sleep(250);
      const s = await page.evaluate(() => {
        const st = window.__QUACKLES_SEQUENCE__.getState(), i = window.__QUACKLES_INSPECTION__.getState();
        const frame = document.querySelector(".poster-frame").getBoundingClientRect();
        const need = Math.min(Math.ceil(frame.width * devicePixelRatio * i.zoom), 11584);
        window.__vcProgress ??= st.current?.progress;
        if (st.current?.progress !== window.__vcProgress) { window.__vcProgress = st.current?.progress; window.__vcPaint = performance.now(); }
        return { moving: i.cameraMoving, sharp: i.zoom < 1.02 || st.detailWidth >= 0.98 * need, need, busy: (st.cache?.inflight ?? 0) + (st.cache?.queued ?? 0), quietMs: performance.now() - window.__vcPaint, detailWidth: st.detailWidth, zoom: i.zoom, camera: i, sequenceProgress: st.current?.progress ?? null, scrollY, nativeLost: window.__vcNativeLost };
      });
      if (CDP && s.nativeLost) throw new Error("native focus/visibility lost during settling");
      // Cache activity is intentionally not a criterion: nightly's FrameCache
      // never idles at rest (decode/evict loop, #53 wave 2).
      if (!s.moving && s.sharp && s.quietMs > 1500) { settled = s; break; }
      settled = { ...s, timedOut: true };
    }
    const environment = await nativeState(page);
    const box = await page.locator(".poster-frame").boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) throw new Error("poster frame has no capture box");
    const file = path.join(outDir, `${state.id}-${sha.slice(0, 8)}.png`);
    await page.screenshot({ path: file, clip: box });
    await nativeState(page);
    if (CDP && await page.evaluate(() => window.__vcNativeLost)) throw new Error("native focus/visibility lost during capture");
    return { file, settled, environment, box, url: page.url(), contextPolicy: CDP ? "shared default context; fresh owned page, existing cache/storage retained" : "cold isolated context" };
  } finally { await owned.close(); }
}

const servers = [], sources = {}, results = [];
let browser;
const preparedText = PREPARED ? fs.readFileSync(PREPARED, "utf8") : null;
const prepared = preparedText ? JSON.parse(preparedText) : null;
const provenance = {
  note: arg("provenance", null),
  manifest: PREPARED ? { file: path.resolve(PREPARED), sha256: createHash("sha256").update(preparedText).digest("hex"), assets: prepared.assets ?? null } : null,
  verification: "Build/source and asset identities are caller-supplied provenance, not independently verified by this visual diagnostic. Build hashes are not assumed to be original historical candidate hashes.",
};
try {
  let port = 45990;
  for (const sha of new Set([base, ...cands])) {
    if (prepared) {
      const b = prepared.builds?.find((b) => b.sha === sha);
      if (!b || !["built", "cached"].includes(b.status)) throw new Error(`no successful prepared build for ${sha}`);
      if (!b.url && (!Number.isInteger(b.port) || b.port < 1024 || b.port > 65535)) throw new Error(`no prepared URL/port for ${sha}`);
      const url = new URL(b.url || `http://127.0.0.1:${b.port}/`);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error(`invalid prepared URL for ${sha}`);
      sources[sha] = { url: url.href, build: b, identity: "supplied prepared-build head" };
    } else {
      const dir = path.join(LAB_DIR, "worktrees", sha, "out");
      if (!fs.existsSync(dir)) throw new Error(`no build for ${sha} in ${dir}: run scripts/lab/run.mjs on it first`);
      sources[sha] = { url: `http://127.0.0.1:${port}/`, directory: dir, identity: "supplied local worktree head" };
      servers.push(spawn("node", [path.join(REPO, "scripts/static-server.mjs"), "--port", String(port++), "--directory", dir], { stdio: "ignore" }));
    }
  }
  if (servers.length) await sleep(1500);
  const CHROME = process.env.CHROME || "/opt/pw-browsers/chromium";
  browser = CDP ? await chromium.connectOverCDP(CDP, { noDefaults: true }) : await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"] });
  for (const state of STATES) {
    const shots = {};
    for (const sha of new Set([base, ...cands])) shots[sha] = await shoot(browser, sha, sources[sha].url, state);
    const owned = await ownedPage(browser);
    try {
      for (const cand of cands) {
        const d = await owned.page.evaluate(async ([a, b]) => {
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
        const settledPair = !!shots[base].settled && !shots[base].settled.timedOut && !!shots[cand].settled && !shots[cand].settled.timedOut;
        results.push({ state: state.id, target: state, base, cand, baseSettled: shots[base].settled, candSettled: shots[cand].settled, status: !settledPair ? "unproven: settling timed out" : d.sizeMismatch ? "unproven: capture dimensions differ" : "settled checkpoint comparison only; not a visual PASS", diff: d, captures: { base: shots[base], cand: shots[cand] }, files: [path.relative(REPO, shots[base].file), path.relative(REPO, shots[cand].file)] });
        console.error(`[visual] ${state.id} ${cand.slice(0, 8)} vs ${base.slice(0, 8)}: ${JSON.stringify(d)} settledPair=${settledPair}`);
      }
    } finally { await owned.close(); }
  }
  fs.writeFileSync(OUT, JSON.stringify({ viewport: CDP ? "native; recorded per capture, no viewport/DPR override" : "1440x1000@2", cdp: CDP || null, browser: browser.version(), provenance, sources, comparison: { reference: base, kind: "same-run incumbent/base screenshots, not an independent golden reference", thresholds: "per-pixel maximum RGB channel difference; count pixels >8; no aggregate pass threshold", scope: "Separate settled captures only; not timed performance trials. Transient blank frames, stale content and tier pops between captures remain unproven. Matching pixels cannot establish source identity or absolute visual correctness." }, limitations: CDP ? ["Existing native cache/storage retained; not cold-context evidence.", "Visibility/document focus gates do not independently verify Android foreground ownership or screen lock/awake state; operator must ensure native Chrome owns an unlocked, awake display.", "Attached browser has no desktop network fence; prepared URL/assets provenance is caller-supplied."] : [], states: STATES, results }, null, 1) + "\n");
} finally {
  // For connectOverCDP, Playwright's browserProcess.close only disconnects the
  // transport (no Browser.close CDP command); native Chrome remains running.
  // All owned pages were closed above; no attached context is ever closed.
  try { if (browser) await browser.close(); }
  finally { for (const s of servers) s.kill("SIGTERM"); }
}
