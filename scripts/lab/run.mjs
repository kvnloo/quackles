#!/usr/bin/env node
/**
 * Quackles Lab runner (#53, PR 1). Opt-in; never touches the refs it measures.
 *
 *   node scripts/lab/run.mjs --refs nightly --trials 5
 *   node scripts/lab/run.mjs --refs nightly,2d22784d --profiles desktop,mobile-emulated --trials 5
 *   node scripts/lab/run.mjs --refs nightly --modes A,B,C,D --trials 7      # cache/preparation decomposition
 *
 * For each ref: resolve the exact SHA, check it out into an isolated `git worktree` under LAB_DIR, build it with
 * same-origin assets (NEXT_PUBLIC_ASSET_ORIGIN=""), and serve out/ with the existing scripts/static-server.mjs. The
 * asset tree is a pinned local checkout of kvnloo/quackles-assets (ASSETS_DIR), linked as out/quackles-assets, and
 * every non-loopback host is unresolvable in the browser, so a run cannot silently hit the network.
 * Each trial is a fresh browser context (cold cache) replaying one tape; contender order rotates between trials.
 * Receipts: RESULTS_DIR/<run-id>/<branch>-<scenario>-<profile>-t<k>.json (+ traces/), then scripts/lab/aggregate.mjs.
 *
 * Env: ASSETS_DIR (../quackles-assets), LAB_DIR (~/.cache/quackles-lab), RESULTS_DIR (results), REMOTE (origin), RUN_ID, CHROME, GPU=1.
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { checkReceipt, frameStats, percentile, RECEIPT_SCHEMA, round, sha256, slug, sourceFamilies, tapeHash, validateTape } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const REFS = arg("refs", "nightly").split(",").filter(Boolean);
const TAPE_PATH = path.resolve(arg("tape", path.join(HERE, "tapes/smoke-inspect.json")));
const TRIALS = Number(arg("trials", "5"));
const PROFILE_IDS = arg("profiles", "desktop").split(",");
const MODE_IDS = arg("modes", "A").split(",");
// --balanced: cycle through every permutation of the contenders (use trials = a multiple of n!), so each build runs in
// each position equally often. Default: seeded random order per trial.
const BALANCED = process.argv.includes("--balanced");
// --cdp ENDPOINT: attach to a running Chrome instead of launching headless Chromium (real desktop GPU, or Android Chrome
// via `adb forward tcp:9222 localabstract:chrome_devtools_remote` + `adb reverse tcp:PORT tcp:PORT` for each lab server).
// --device-note TEXT is recorded in every receipt (model, OS, GPU, refresh rate, power/thermal state).
const CDP_ENDPOINT = arg("cdp", process.env.LAB_CDP || "");
const DEVICE_NOTE = arg("device-note", "");
const ANDROID = process.argv.includes("--android");
// Separate builds from phone replay without replacing the collector or tapes.
const PREPARE_ONLY = process.argv.includes("--prepare-only");
const PREPARED_BUILDS = arg("prepared-builds", "");
const SERVE_ONLY = process.argv.includes("--serve-only");
const REMOTE = process.env.REMOTE || "origin";
const ASSETS_DIR = path.resolve(process.env.ASSETS_DIR || path.join(REPO, "../quackles-assets"));
// Outside the checkout: worktrees inside it would be swept up by `npm test` (eslint + tsc over **/*.ts).
const LAB_DIR = path.resolve(process.env.LAB_DIR || path.join(process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "quackles-lab"));
const RESULTS_DIR = path.resolve(process.env.RESULTS_DIR || path.join(REPO, "results"));
const CHROME = process.env.CHROME || ["/opt/pw-browsers/chromium", "/usr/bin/google-chrome-stable", "/usr/bin/chromium"]
  .map((p) => (fs.existsSync(p) && fs.statSync(p).isDirectory() ? findChrome(p) : p)).find((p) => p && fs.existsSync(p));
const SETTLE_MS = 2500; // after the last tape step: let refinement finish before the final state read
const POLL_MS = 50;

// Profiles: "emulated" is a desktop Chromium pretending to be a phone. It is never physical-device evidence.
const PROFILES = {
  desktop: { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2, isMobile: false, hasTouch: false, cpuThrottle: 1, label: "desktop viewport" },
  // Hardware replay (#53 W2B): an attached real browser (--cdp) keeps its own viewport, DPR and GPU; nothing is emulated.
  physical: { viewport: null, cpuThrottle: 1, label: "attached real browser (desktop GPU Chrome or Android Chrome): its own viewport, DPR and GPU, no emulation" },
  "mobile-emulated": { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, cpuThrottle: 4, label: "emulated mobile viewport + 4x CPU throttle (NOT a physical phone)" },
};

// Cache/preparation modes (#53 first experiment). Same commit, fixture, viewport and tape; only what is already warm
// differs. Preparation (a full tape pass) is timed and counted separately from the measured pass.
const MODES = {
  A: { cache: "cold", label: "normal pipeline, cold context" },
  B: { cache: "warm-compressed", label: "prep pass, then reload with asset URLs blocked: tiles only from the app's Cache API (compressed cache)" },
  C: { cache: "warm-replay-under-pressure", label: "prep pass, then replay in the same document; decoded cache stays budget-limited, not decode-free" },
  D: { cache: "painted-camera-only", label: "DIAGNOSTIC: prep pass's camera transforms replayed on the already-painted surface; refinement idle. Never a shippable winner" },
  E: { cache: "offline-prewarmed", label: "prep pass, then same-document replay with this page's CDP network explicitly offline" },
};

function findChrome(dir) {
  for (const p of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome"]) if (fs.existsSync(path.join(dir, p))) return path.join(dir, p);
  return null;
}
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
const fileHash = (p) => (fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));
/** Seeded Fisher-Yates (LCG), so a run's mode order is reproducible from its seed. */
function shuffle(items, seed) {
  const a = [...items];
  let x = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) { x = (Math.imul(x, 1103515245) + 12345) >>> 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function resolveRef(ref) {
  const sha = tryGit(REPO, "rev-parse", "--verify", `${REMOTE}/${ref}^{commit}`) ?? tryGit(REPO, "rev-parse", "--verify", `${ref}^{commit}`);
  if (!sha) throw new Error(`cannot resolve ${ref} (tried ${REMOTE}/${ref} and ${ref}); fetch first`);
  return { ref, sha };
}

/** Isolated checkout + build. Never fails the run: a build failure becomes NOT RUN receipts. */
function prepare({ ref, sha }) {
  const wt = path.join(LAB_DIR, "worktrees", sha);
  const log = path.join(LAB_DIR, "logs", `${sha}-build.log`);
  fs.mkdirSync(path.dirname(log), { recursive: true });
  const build = { ref, sha, worktree: wt, log, status: "not-built", durationMs: null, nodeModules: null, lockfileSha256: null, reason: null };
  try {
    if (!fs.existsSync(wt)) git(REPO, "worktree", "add", "--detach", wt, sha);
    if (git(wt, "rev-parse", "HEAD") !== sha) throw new Error(`worktree ${wt} is not at ${sha}`);
    build.lockfileSha256 = fileHash(path.join(wt, "package-lock.json"));
    const stamp = path.join(wt, "out", ".lab-build.json");
    const env = { ...process.env, NEXT_PUBLIC_ASSET_ORIGIN: "", NEXT_PUBLIC_BASE_PATH: "", NEXT_PUBLIC_BUILD_SHA: sha, NEXT_PUBLIC_BUILD_TIME: git(wt, "log", "-1", "--format=%cI"), NEXT_TELEMETRY_DISABLED: "1" };
    if (fs.existsSync(stamp) && JSON.parse(fs.readFileSync(stamp, "utf8")).sha === sha) {
      Object.assign(build, JSON.parse(fs.readFileSync(stamp, "utf8")), { status: "cached" });
    } else {
      // Same lockfile as this harness checkout: share its node_modules (read-only use). Otherwise a clean npm ci.
      const nm = path.join(wt, "node_modules");
      if (!fs.existsSync(nm)) {
        if (build.lockfileSha256 && build.lockfileSha256 === fileHash(path.join(REPO, "package-lock.json")) && fs.existsSync(path.join(REPO, "node_modules"))) {
          fs.symlinkSync(path.join(REPO, "node_modules"), nm, "dir");
          build.nodeModules = "shared (identical package-lock.json)";
        } else {
          execFileSync("npm", ["ci", "--no-audit", "--no-fund"], { cwd: wt, env, stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")] });
          build.nodeModules = "npm ci";
        }
      }
      const t0 = Date.now();
      execFileSync("npm", ["run", "build"], { cwd: wt, env, stdio: ["ignore", fs.openSync(log, "a"), fs.openSync(log, "a")] });
      build.durationMs = Date.now() - t0;
      if (!fs.existsSync(path.join(wt, "out", "index.html"))) throw new Error("build produced no out/index.html (not a static export?)");
      build.status = "built";
      fs.writeFileSync(stamp, JSON.stringify({ sha, durationMs: build.durationMs, nodeModules: build.nodeModules, lockfileSha256: build.lockfileSha256 }));
    }
    const link = path.join(wt, "out", "quackles-assets");
    if (!fs.existsSync(link)) fs.symlinkSync(ASSETS_DIR, link, "dir");
  } catch (err) {
    build.status = "failed";
    build.reason = String(err.message || err).split("\n")[0];
  }
  return build;
}

function serve(dir, port) {
  // Reuse the repo's own deterministic static server (python http.server; follows the assets symlink).
  const child = spawn("node", [path.join(REPO, "scripts/static-server.mjs"), "--port", String(port), "--directory", dir], { stdio: ["ignore", "ignore", "pipe"] });
  child.stderr.on("data", () => {});
  return child;
}

async function waitHttp(url, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await fetch(url)).ok) return; } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error(`no HTTP at ${url}`);
}

/** Fixture identity from the pinned asset checkout: DZI + metadata.json of the observed source family. */
function fixtureFor(families, assetsSha, assetsDirty) {
  const base = { id: null, sourceFamily: families.length === 1 ? families[0] : families.length ? families.join("+") : null, masterHash: null, width: null, height: null, tileSize: null, codec: null, origin: `local checkout of kvnloo/quackles-assets@${assetsSha}${assetsDirty ? " (DIRTY)" : ""} served same-origin over loopback` };
  if (families.length !== 1) return base;
  const dir = path.join(ASSETS_DIR, families[0]);
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return null; } };
  const dzi = read("source.dzi") ?? read("dzi.json"), meta = read("metadata.json");
  const [width, height] = dzi?.size ?? meta?.source?.dimensions ?? [null, null];
  const mp = width && height ? Math.round((width * height) / 1e6) : null;
  return { ...base, id: mp ? `${families[0].replace(/\//g, "-")}-${mp}mp` : families[0], masterHash: meta?.source?.sha256 ? `sha256:${meta.source.sha256}` : null, width, height, tileSize: dzi?.tileSize ?? null, codec: dzi ? `${dzi.level0 ?? dzi.format} (L0), ${dzi.mips ?? dzi.format} (mips)` : null };
}

// Per-asset decode counter, installed before the app (identical in every arm). Blobs are tagged with their URL whether they
// come from fetch() or from the app's compressed Cache API copy (stored as URL-less Responses), then counted at
// createImageBitmap. Keys are URL pathnames.
const DECODE_COUNTER = `(() => {
  const born = new WeakMap(); window.__labDecodes = new Map();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); const u = this.url || this.__labUrl; if (u) born.set(b, u); return b; };
  if (window.Cache) { const match = Cache.prototype.match;
    Cache.prototype.match = async function (req, opts) { const r = await match.call(this, req, opts); if (r) r.__labUrl = typeof req === "string" ? new URL(req, location.href).href : req.url; return r; }; }
  const cib = window.createImageBitmap;
  window.createImageBitmap = function (src, ...rest) {
    const u = src instanceof Blob ? born.get(src) : null;
    if (u) { const k = new URL(u, location.href).pathname; window.__labDecodes.set(k, (window.__labDecodes.get(k) || 0) + 1); }
    return cib.call(this, src, ...rest);
  };
})();`;

// ---- in-page collector (installed at tape start; reads only app-published debug state, no readPixels) --------------
function installCollector({ pollMs }) {
  const camera = document.querySelector(".sequence-camera");
  const frame = document.querySelector(".poster-frame");
  const layers = [".sequence-base", ".sequence-detail", ".poster-plate"].map((s) => document.querySelector(s));
  const C = (window.__lab = { frames: [], cam: [], wheel: [], touch: [], touchActive: [], polls: [], paints: [], loaf: [], stop: false, selectorsFound: !!camera && !!frame && layers.some(Boolean) });
  C.visibility = [[performance.now(), document.visibilityState]];
  addEventListener("visibilitychange", () => { if (!C.stop) C.visibility.push([performance.now(), document.visibilityState]); });
  C.focus = [[performance.now(), document.hasFocus()]];
  for (const event of ["focus", "blur"]) addEventListener(event, () => { if (!C.stop) C.focus.push([performance.now(), document.hasFocus()]); });
  const transform = () => (camera ? camera.style.transform || getComputedStyle(camera).transform : "");
  const pending = [];
  addEventListener("wheel", (e) => { const rec = { ts: e.timeStamp, before: transform(), latency: null }; C.wheel.push(rec); pending.push(rec); }, { capture: true, passive: true });
  let pendingTouch = null;
  for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) addEventListener(type, (e) => {
    if (C.stop) return;
    // Do not attribute a later gesture's transform to an earlier unobserved move.
    if (pendingTouch) { pendingTouch.reason = "no changed transform observed before the next touch event"; pendingTouch = null; }
    const points = Array.from(e.touches, (p) => ({ id: p.identifier, x: p.clientX, y: p.clientY }));
    const moved = type === "touchmove" && points.some((p) => C.touchActive.some((old) => old.id === p.id && (old.x !== p.x || old.y !== p.y)));
    const rec = { type, ts: e.timeStamp, receivedAt: performance.now(), points, before: transform(), latency: null,
      reason: moved ? "no changed transform observed before collection ended" : "contact lifecycle or stationary event; no movement latency expected" };
    C.touchActive = points;
    C.touch.push(rec);
    if (moved) pendingTouch = rec;
  }, { capture: true, passive: true });
  // Each detail paint: time, backing size, tiles, and whether the camera was moving (in motion vs post-stop sharpening).
  const detailCanvas = document.querySelector(".sequence-detail");
  addEventListener("quackles:detail-painted", () => {
    const s = window.__QUACKLES_SEQUENCE__?.getState?.(), i = window.__QUACKLES_INSPECTION__?.getState?.();
    C.paints.push([performance.now(), detailCanvas?.width ?? null, detailCanvas?.height ?? null, s?.detailTiles ?? null, s?.detailWidth ?? null, i?.cameraMoving ? 1 : 0, i?.zoom ?? null]);
  });
  // Long Animation Frames (Chrome 123+): where a slow frame's time went (script attribution, style/layout, render).
  try {
    C.loafObserver = new PerformanceObserver((list) => {
      if (C.stop) return;
      for (const e of list.getEntries()) {
        C.loaf.push([e.startTime, e.duration, e.blockingDuration, e.renderStart, e.styleAndLayoutStart,
          e.scripts.map((x) => [x.invoker || x.name, x.sourceFunctionName || "", Math.round(x.duration), Math.round(x.forcedStyleAndLayoutDuration)])]);
      }
    });
    C.loafObserver.observe({ type: "long-animation-frame" });
  } catch { C.loaf = null; }
  let lastTr = null;
  const loop = () => {
    if (C.stop) return;
    const now = performance.now();
    C.frames.push(now);
    const tr = transform();
    if (tr !== lastTr) { C.cam.push([now, tr]); lastTr = tr; }
    if (pending.length) {
      const tr = transform();
      for (let i = pending.length - 1; i >= 0; i--) if (tr !== pending[i].before) { pending[i].latency = now - pending[i].ts; pending.splice(i, 1); }
    }
    if (pendingTouch && tr !== pendingTouch.before) {
      pendingTouch.latency = now - pendingTouch.ts;
      pendingTouch.observedAt = now; pendingTouch.after = tr; pendingTouch.reason = null;
      pendingTouch = null;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const visible = (el) => !!el && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  const poll = () => {
    if (C.stop) return;
    const s = window.__QUACKLES_SEQUENCE__?.getState?.();
    const i = window.__QUACKLES_INSPECTION__?.getState?.();
    C.polls.push([performance.now(), s?.detailWidth ?? null, i?.zoom ?? null, i?.cameraMoving ?? null, s?.cache?.decodedBytes ?? null, s?.surfaceBytes ?? null, layers.some(visible) ? 0 : 1, (s?.cache?.queued ?? 0) + (s?.cache?.inflight ?? 0), s?.current?.progress ?? null]);
    setTimeout(poll, pollMs);
  };
  poll();
}

/** Plays the tape once; returns step timing (in-page performance.now) for the measured or preparation pass. */
/** In-page snapshot at a tape mark: app cache counters, detail paints so far, per-URL decode counts. */
const pageSnapshot = (page) => page.evaluate(() => {
  const st = window.__QUACKLES_SEQUENCE__?.getState?.(), c = st?.cache;
  return { t: performance.now(), progress: st?.current?.progress ?? null, zoom: window.__QUACKLES_INSPECTION__?.getState?.().zoom ?? null,
    cache: c ? { decodes: c.completedDecodes, closedBitmaps: c.closedBitmaps, staleDiscard: c.staleDiscard, networkRequests: c.networkRequests, queued: c.queued, inflight: c.inflight, deferred: c.deferred ?? null, decodedBytes: c.decodedBytes } : null,
    surfaceBytes: st?.surfaceBytes ?? null, detailPaints: window.__lab?.paints?.length ?? null, decodeCounts: window.__labDecodes ? Object.fromEntries(window.__labDecodes) : null };
});

/** Renderer main-thread time (CDP Performance) and browser-wide process CPU time (CDP SystemInfo; all Chromium processes). */
async function cpuSnapshot(cdp, browserCdp) {
  const out = {};
  try { for (const m of (await cdp.send("Performance.getMetrics")).metrics) if (["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration", "JSHeapUsedSize"].includes(m.name)) out[m.name] = m.value; } catch { /* unavailable */ }
  try { out.processCpuSeconds = (await browserCdp.send("SystemInfo.getProcessInfo")).processInfo.reduce((a, p) => a + p.cpuTime, 0); } catch { out.processCpuSeconds = null; }
  return out;
}

/** Plays the tape once; returns step timing (in-page performance.now) and mark snapshots. "settle" waits for refinement to
 * finish (camera at rest, painted tier >= need, no detail paint for 1.5 s, story progress steady; capped by timeoutMs) and
 * shifts every later step by the time it waited. */
async function playTape(page, cdp, box, tape, facts, browserCdp = null, viewport = null) {
  const t0 = performance.now();
  const r = { marks: [], jitter: [], targetTimes: [], sharpStepAt: null, sharpStepZoom: null, sharpFromZoom: null, unsupported: new Set(), settles: [], touchTransport: [] };
  let lastZoom = 1, offset = 0;
  const touchIds = new Set();
  if (tape.steps.some((s) => s.action === "touch")) await page.evaluate(() => {
    // Preparation modes may play before installCollector; transport validation must still work.
    if (window.__labTouchContacts) return;
    window.__labTouchContacts = [];
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) addEventListener(type, (e) => {
      window.__labTouchContacts = Array.from(e.touches, (p) => p.identifier).sort((a, b) => a - b);
    }, { capture: true, passive: true });
  });
  for (const step of tape.steps) {
    const wait = step.t + offset - (performance.now() - t0);
    if (wait > 1) await sleep(wait);
    r.jitter.push(performance.now() - t0 - step.t - offset);
    const px = box.x + (step.x ?? 0.5) * box.width, py = box.y + (step.y ?? 0.5) * box.height;
    if (step.action === "setTarget") {
      if (!facts.hasSetTarget) { r.unsupported.add("setTarget"); continue; }
      const at = await page.evaluate(({ zoom, x, y }) => { window.__QUACKLES_INSPECTION__.setTarget(zoom, x, y); return performance.now(); }, step);
      r.targetTimes.push(at);
      if (step.measure === "sharp") { r.sharpStepAt = at; r.sharpStepZoom = step.zoom; r.sharpFromZoom = lastZoom; }
      lastZoom = step.zoom;
    } else if (step.action === "wheel") {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: px, y: py, deltaX: step.deltaX ?? 0, deltaY: step.deltaY });
    } else if (step.action === "touch") {
      if (step.type === "touchStart") for (const p of step.points) touchIds.add(p.id);
      if (step.type === "touchCancel" || (step.type === "touchEnd" && !step.points.length)) touchIds.clear();
      else if (step.type === "touchEnd") for (const p of step.points) touchIds.delete(p.id);
      const expectedIds = [...touchIds].sort((a, b) => a - b);
      let dispatchError = null;
      try {
        await cdp.send("Input.dispatchTouchEvent", { type: step.type,
          touchPoints: step.points.map(({ id, x, y }) => ({ id, x: box.x + x * box.width, y: box.y + y * box.height })) });
        await page.waitForFunction((ids) => {
          const observed = window.__labTouchContacts;
          return observed && observed.length === ids.length && observed.every((id) => ids.includes(id));
        }, expectedIds, { timeout: 500, polling: 20 });
      } catch (err) { dispatchError = String(err.message || err).split("\n")[0]; }
      const observedIds = await page.evaluate(() => window.__labTouchContacts ?? null);
      const valid = !dispatchError && observedIds?.length === expectedIds.length && observedIds.every((id, i) => id === expectedIds[i]);
      r.touchTransport.push({ t: step.t, type: step.type, expectedIds, observedIds, valid, reason: dispatchError });
      if (!valid) {
        const touchTrace = await page.evaluate(() => ({ touch: window.__lab?.touch ?? [], cam: window.__lab?.cam ?? [] }));
        throw Object.assign(new Error(`INVALID touch transport: ${step.type} expected contact IDs [${expectedIds}], observed [${observedIds ?? "unavailable"}]${dispatchError ? `; ${dispatchError}` : ""}`),
          { touchTransport: r.touchTransport, touchTrace: { ...touchTrace, marks: r.marks } });
      }
    } else if (step.action === "pageWheel") {
      // Story scroll: a trusted wheel over the page outside the poster frame (viewport fractions).
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: (step.vx ?? 0.1) * (viewport?.width ?? 1440), y: (step.vy ?? 0.5) * (viewport?.height ?? 1000), deltaX: 0, deltaY: step.deltaY });
    } else if (step.action === "mouseMove") {
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
    } else if (step.action === "settle") {
      const started = performance.now();
      const reached = await page.waitForFunction(() => {
        const st = window.__QUACKLES_SEQUENCE__?.getState?.(), i = window.__QUACKLES_INSPECTION__?.getState?.();
        if (!st || !i) return false;
        const S = (window.__labSettle ||= { paints: 0, at: performance.now(), progress: st.current?.progress });
        const paints = window.__lab?.paints?.length ?? 0;
        if (paints !== S.paints || st.current?.progress !== S.progress) { S.paints = paints; S.progress = st.current?.progress; S.at = performance.now(); }
        const frame = document.querySelector(".poster-frame")?.getBoundingClientRect();
        const need = frame ? Math.min(Math.ceil(frame.width * devicePixelRatio * i.zoom), 11584) : Infinity;
        const sharp = i.zoom < 1.02 || st.detailWidth >= 0.98 * need;
        return !i.cameraMoving && sharp && performance.now() - S.at > 1500;
      }, undefined, { timeout: step.timeoutMs ?? 15000, polling: 100 }).then(() => true).catch(() => false);
      await page.evaluate(() => { delete window.__labSettle; });
      const waited = performance.now() - started;
      r.settles.push({ label: step.label ?? "settle", reached, waitedMs: Math.round(waited) });
      offset += Math.max(0, waited - 1);
    }
    if (step.action === "mark" || step.action === "settle") {
      const snap = await pageSnapshot(page).catch(() => null);
      if (snap && tape.steps.some((s) => s.action === "touch")) snap.touchCamera = await page.evaluate(() => {
        const camera = document.querySelector(".sequence-camera"), i = window.__QUACKLES_INSPECTION__?.getState?.();
        return { transform: camera?.style.transform ?? null, inspection: i ?? null, activeContacts: window.__lab?.touchActive ?? null,
          touchEvents: window.__lab?.touch?.length ?? null };
      });
      if (snap) r.marks.push({ label: step.action === "settle" ? `${step.label ?? "settle"}:end` : step.label, ...snap, cpu: browserCdp ? await cpuSnapshot(cdp, browserCdp) : null });
    }
  }
  await sleep(SETTLE_MS);
  return r;
}

/** Back to 1x at rest (between a preparation pass and the measured pass). */
async function resetToRest(page) {
  await page.evaluate(() => window.__QUACKLES_INSPECTION__?.reset?.());
  await page.waitForFunction(() => { const i = window.__QUACKLES_INSPECTION__?.getState?.(); return !i || (i.zoom < 1.001 && !i.cameraMoving); }, undefined, { timeout: 15000, polling: 100 }).catch(() => {});
  await sleep(1500);
}

const appCounters = (page) => page.evaluate(() => {
  const c = window.__QUACKLES_SEQUENCE__?.getState?.().cache;
  return c ? { decodes: c.completedDecodes ?? null, networkRequests: c.networkRequests ?? null, closedBitmaps: c.closedBitmaps ?? null, staleDiscard: c.staleDiscard ?? null, compressedBytes: c.compressedBytes ?? null, compressedBudgetBytes: c.compressedBudgetBytes ?? null, decodedBytes: c.decodedBytes ?? null, budgetBytes: c.budgetBytes ?? null } : null;
});
const delta = (a, b) => (a && b ? Object.fromEntries(Object.keys(b).filter((k) => !/Budget|Bytes$/.test(k)).map((k) => [k, b[k] != null && a[k] != null ? b[k] - a[k] : null])) : null);

function androidSnapshot() {
  if (!ANDROID) return null;
  try {
    const text = execFileSync("adb", ["shell", "printf 'LEVEL='; cmd battery get level; printf 'TEMP='; cmd battery get temp; printf 'STATUS='; cmd battery get status; dumpsys thermalservice; dumpsys window displays; dumpsys window policy; dumpsys power"], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
    const number = (pattern) => { const match = text.match(pattern); return match ? Number(match[1]) : null; };
    const current = text.split("Current temperatures from HAL:")[1]?.split("Current cooling devices")[0] ?? "";
    const temperaturesC = {};
    for (const match of current.matchAll(/mValue=([\d.-]+).*?mName=([^,}]+)/g)) temperaturesC[match[2]] = Number(match[1]);
    const deciC = number(/TEMP=(-?[\d.]+)/);
    const focus = text.split("\n").find((line) => line.includes("mCurrentFocus="));
    const keyguard = text.split("KeyguardServiceDelegate")[1]?.split("KeyguardStateMonitor")[0]?.match(/\bshowing=(true|false)/);
    const wakefulness = text.match(/\bmWakefulness=(\w+)/);
    return { capturedAt: new Date().toISOString(), batteryPercent: number(/LEVEL=(\d+)/), batteryTemperatureC: deciC == null ? null : deciC / 10, batteryStatus: number(/STATUS=(\d+)/), thermalStatus: number(/Thermal Status: (\d+)/), temperaturesC,
      chromeForeground: focus ? /com\.android\.chrome\//.test(focus) : null, keyguardShowing: keyguard ? keyguard[1] === "true" : null, screenAwake: wakefulness ? wakefulness[1] === "Awake" : null };
  } catch { return { thermalStatus: null, reason: "Android environmental snapshot unavailable" }; }
}

async function runTrial({ browser, build, port, tape, profileId, mode = "A", trial, runId, ctx }) {
  const profile = PROFILES[profileId];
  const scenario = { id: tape.id, mode, modeLabel: MODES[mode].label, seed: tape.seed, tapeHash: `sha256:${ctx.tapeHash}`, tape: path.relative(REPO, TAPE_PATH) };
  const out = path.join(RESULTS_DIR, runId, `${slug(build.ref)}-${tape.id}-${mode}-${profileId}-t${trial}.json`);
  const traceOut = path.join(RESULTS_DIR, runId, "traces", path.basename(out));
  const receipt = {
    schema: RECEIPT_SCHEMA, runId, branch: build.ref, sha: build.sha, trial, status: "NOT RUN",
    harness: ctx.harness, fixture: fixtureFor([], ctx.assetsSha, ctx.assetsDirty),
    environment: { ...ctx.environment, profile: profileId, profileLabel: profile.label, viewport: profile.viewport, dpr: profile.deviceScaleFactor, cpuThrottle: profile.cpuThrottle, network: "local-loopback-unthrottled; external hosts unresolvable", cache: MODES[mode].cache, instrumentation: "normal" },
    scenario, metrics: {}, metricNotes: {}, extra: {},
    validation: { passed: [], failed: [], notRun: ["collector-overhead-calibration (no uninstrumented control yet)", "gpu-completion (JS timings only)", "human blind feel review", "pixel-fidelity/source-pop checks"] },
    limitations: [], artifacts: { trace: path.relative(REPO, traceOut), screenshots: [], buildLog: path.relative(REPO, build.log) },
  };
  const finish = () => {
    for (const k of ["rafP50Ms", "rafP95Ms", "rafP99Ms", "maxFrameMs", "framesOver33Ms", "framesOver50Ms", "firstCorrectVisualMs", "timeToSharpMs", "inputToCameraMs", "requests", "transferredBytes", "abortCount", "staleWorkCount", "blankFrames", "staleVisibleFrames", "sourcePops", "decodedPeakBytes", "gpuResidentBytesEstimate"]) {
      if (!(k in receipt.metrics)) receipt.metrics[k] = null;
      if (receipt.metrics[k] === null && !receipt.metricNotes[k]) receipt.metricNotes[k] = receipt.status === "NOT RUN" ? "trial did not run" : "not measured";
    }
    const problems = checkReceipt(receipt);
    if (problems.length) throw new Error(`receipt schema problems: ${problems.join("; ")}`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + "\n");
    return receipt;
  };
  if (build.status === "failed") {
    receipt.validation.notRun.unshift(`build failed: ${build.reason}`);
    return finish();
  }

  // A fresh context per trial (cold cache). An attached browser that cannot create contexts (Android Chrome) uses its
  // default context; its cache and origin storage are cleared before the trial instead.
  let ownContext = true, context;
  try {
    context = await browser.newContext(profile.viewport === null ? { viewport: null, serviceWorkers: "block" } : { viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, serviceWorkers: "block" });
  } catch {
    if (!CDP_ENDPOINT) throw new Error("cannot create a browser context");
    context = browser.contexts()[0]; ownContext = false;
  }
  await context.addInitScript(DECODE_COUNTER);
  const page = await context.newPage();
  if (profileId === "physical") await page.bringToFront();
  const cdp = await context.newCDPSession(page);
  // Playwright enables focus emulation by default. Physical evidence must use native focus, not that override.
  if (profileId === "physical") await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  if (!ownContext) {
    await cdp.send("Network.clearBrowserCache").catch(() => {});
    await cdp.send("Storage.clearDataForOrigin", { origin: `http://127.0.0.1:${port}`, storageTypes: "all" }).catch(() => {});
    receipt.limitations.push("attached browser default context: cache/storage cleared per trial instead of a fresh context");
  }
  if (CDP_ENDPOINT) receipt.limitations.push("attached browser: the host-resolver network fence is not applied; external requests are detected (no-external-network gate), not blocked");
  const browserCdp = await browser.newBrowserCDPSession().catch(() => null);
  await cdp.send("Performance.enable").catch(() => {});
  const freshNet = () => ({ requests: 0, bytes: 0, aborted: 0, blocked: 0, failed: [], external: [], httpErrors: [], assetPaths: [] });
  let net = freshNet();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message || e)));
  page.on("request", (r) => {
    net.requests++;
    const u = new URL(r.url());
    if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && /^https?:$/.test(u.protocol)) net.external.push(u.origin);
    if (u.pathname.includes("/quackles-assets/")) net.assetPaths.push(u.pathname);
  });
  page.on("requestfinished", async (r) => {
    try { const s = await r.sizes(); net.bytes += s.responseBodySize + s.responseHeadersSize; } catch { /* page closed */ }
    const resp = await r.response().catch(() => null);
    if (resp && resp.status() >= 400) net.httpErrors.push(`${resp.status()} ${new URL(r.url()).pathname}`);
  });
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "unknown";
    if (/ERR_ABORTED/.test(why)) net.aborted++;
    else if (/ERR_BLOCKED_BY_CLIENT|^inspector$/.test(why)) net.blocked++; // Network.setBlockedURLs reports "inspector"
    else net.failed.push(`${why} ${r.url().slice(0, 120)}`);
  });

  try {
    if (profile.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottle });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 120000 });
    if (profileId === "physical") receipt.extra.screenWakeLock = await page.evaluate(async () => {
      try { window.__labWakeLock = await navigator.wakeLock.request("screen"); return !window.__labWakeLock.released; }
      catch { return false; }
    });
    const firstPaint = await page.waitForFunction(() => (window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0 ? performance.now() : 0), undefined, { timeout: 60000, polling: "raf" }).then((h) => h.jsonValue()).catch(() => null);
    if (firstPaint == null) {
      receipt.validation.notRun.unshift("app never reported a first paint (__QUACKLES_SEQUENCE__.drawCount) within 60 s");
      return finish();
    }
    receipt.extra.firstPaintReportedMs = round(firstPaint);
    receipt.metricNotes.firstCorrectVisualMs = "not pixel-verified in PR 1; see extra.firstPaintReportedMs (navigation start -> first app-reported paint, drawCount > 0, rAF-polled)";
    const facts = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl");
      const dbg = gl?.getExtension("WEBGL_debug_renderer_info");
      const s = window.__QUACKLES_SEQUENCE__?.getState?.();
      return { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown", userAgent: navigator.userAgent, dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`, viewport: { width: innerWidth, height: innerHeight }, appProfile: s?.profile?.id ?? null, maxZoom: window.__QUACKLES_INSPECTION__?.getState?.().maxZoom ?? null, hasSetTarget: typeof window.__QUACKLES_INSPECTION__?.setTarget === "function" };
    });
    Object.assign(receipt.environment, { gpu: facts.gpu, userAgent: facts.userAgent, screen: facts.screen, viewport: facts.viewport, appProfile: facts.appProfile, dpr: facts.dpr });
    receipt.extra.maxZoom = facts.maxZoom;
    await sleep(tape.warmupMs ?? 0);
    const idle = await page.evaluate(() => new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (ts.length < 40) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
    receipt.environment.idleRafMs = round(percentile(idle.slice(1).map((t, i) => t - idle[i]), 50));

    const box = await page.locator(".poster-frame").boundingBox();
    if (!box) {
      receipt.validation.notRun.unshift(".poster-frame not found: tape coordinates undefined for this build");
      return finish();
    }
    // ---- preparation (B/C/D): one full tape pass, timed and counted separately ------------------------------------
    let replay = null;
    if (mode !== "A") {
      const prepT0 = Date.now(), before = await appCounters(page);
      if (mode === "D") await page.evaluate(installCollector, { pollMs: POLL_MS });
      await playTape(page, cdp, box, tape, facts, null, facts.viewport);
      if (mode === "D") replay = await page.evaluate(() => { window.__lab.stop = true; window.__lab.loafObserver?.disconnect(); const c = window.__lab.cam; return c.map(([t, tr]) => [t - c[0][0], tr]); });
      await resetToRest(page);
      receipt.extra.prepAssetPaths = net.assetPaths;
      receipt.extra.prep = { wallMs: Date.now() - prepT0, requests: net.requests, transferredBytes: net.bytes, app: delta(before, await appCounters(page)) };
      if (mode === "B") {
        await sleep(1000); // let Cache API writes land
        const disk = await appCounters(page);
        receipt.extra.prep.compressedBytes = disk?.compressedBytes ?? null;
        receipt.extra.prep.compressedBudgetBytes = disk?.compressedBudgetBytes ?? null;
        await cdp.send("Network.enable");
        await cdp.send("Network.setBlockedURLs", { urls: ["*/quackles-assets/*"] });
        net = freshNet();
        await page.reload({ waitUntil: "load", timeout: 120000 });
        const fp = await page.waitForFunction(() => (window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0 ? performance.now() : 0), undefined, { timeout: 60000, polling: "raf" }).then((h) => h.jsonValue()).catch(() => null);
        if (fp == null) { receipt.validation.notRun.unshift("B: app never painted after the warm reload"); return finish(); }
        receipt.extra.firstPaintReportedMs = round(fp);
        await sleep(tape.warmupMs ?? 0);
      }
    }
    if (mode === "E") {
      await sleep(1000);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      receipt.environment.network = "page network explicitly offline after the identical preparation pass";
    }
    receipt.environment.androidBefore = androidSnapshot();

    net = freshNet();
    const measuredBefore = await appCounters(page);
    await page.evaluate(installCollector, { pollMs: POLL_MS });
    const startPerf = await page.evaluate(() => performance.now());
    const startSnap = { label: "measured-start", ...(await pageSnapshot(page)), cpu: await cpuSnapshot(cdp, browserCdp) };
    let played;
    if (mode === "D") {
      // Camera-only: replay the prep pass's per-frame transforms onto the painted surface. No app input, no refinement.
      await page.evaluate((cam) => new Promise((resolve) => {
        const el = document.querySelector(".sequence-camera"), t0 = performance.now();
        let k = 0;
        const step = (now) => {
          while (k + 1 < cam.length && cam[k + 1][0] <= now - t0) k++;
          el.style.transform = cam[k][1];
          if (k + 1 < cam.length) requestAnimationFrame(step); else resolve();
        };
        requestAnimationFrame(step);
      }), replay);
      await sleep(SETTLE_MS);
      await page.evaluate(() => { const el = document.querySelector(".sequence-camera"); el.style.transform = "none"; });
      played = { marks: [], jitter: [0], targetTimes: [], sharpStepAt: null, unsupported: new Set() };
      receipt.extra.replayedTransforms = replay.length;
    } else played = await playTape(page, cdp, box, tape, facts, browserCdp, facts.viewport);
    const { marks, jitter, targetTimes, sharpStepAt, sharpStepZoom, sharpFromZoom, unsupported } = played;
    receipt.extra.measuredApp = delta(measuredBefore, await appCounters(page));
    receipt.extra.settles = played.settles ?? [];
    const data = await page.evaluate(() => {
      window.__lab.stop = true;
      window.__lab.loafObserver?.disconnect();
      const s = window.__QUACKLES_SEQUENCE__?.getState?.();
      const { loafObserver, ...lab } = window.__lab; // eslint-disable-line no-unused-vars
      return { ...lab, end: { errors: s?.errors ?? null, stalePaints: s?.stalePaints ?? null, staleDiscard: s?.cache?.staleDiscard ?? null, cacheFailures: s?.cache?.failures ?? null, inspectionSources: s?.inspectionSources ?? null } };
    });
    const endSnap = { label: "measured-end", ...(await pageSnapshot(page)), cpu: await cpuSnapshot(cdp, browserCdp) };
    receipt.environment.androidAfter = androidSnapshot();
    const shot = path.join(RESULTS_DIR, runId, "screens", path.basename(out, ".json") + ".png");
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot });
    receipt.artifacts.screenshots.push(path.relative(REPO, shot));

    // ---- metrics -------------------------------------------------------------------------------------------------
    const fs_ = frameStats(data.frames);
    Object.assign(receipt.metrics, { rafP50Ms: fs_.rafP50Ms, rafP95Ms: fs_.rafP95Ms, rafP99Ms: fs_.rafP99Ms, maxFrameMs: fs_.maxFrameMs, framesOver33Ms: fs_.framesOver33Ms, framesOver50Ms: fs_.framesOver50Ms });
    receipt.extra.frames = fs_.frames;
    const intervals = data.frames.slice(1).map((t, i) => t - data.frames[i]).filter((dt) => dt > 0);
    receipt.extra.frameThresholds = Object.fromEntries([8.3, 16.7, 25, 33, 50].map((ms) => [`over${ms}Ms`, intervals.length ? intervals.filter((dt) => dt > ms).length : null]));
    receipt.extra.visibility = data.visibility;
    receipt.extra.focus = data.focus;
    // Phases between tape marks (and settle ends): frame tails, decode/evict work, re-decodes per asset, queued work,
    // detail paints and CPU. "stationary" = from the "refined" settle to the "stationary-end" mark (30 s hold at rest).
    {
      const snaps = [startSnap, ...played.marks, endSnap].filter((m) => Number.isFinite(m?.t)).sort((a, b) => a.t - b.t);
      const assetDelta = (a, b) => {
        const A = a?.decodeCounts ?? {}, B = b?.decodeCounts ?? {};
        let decodes = 0, redecodes = 0, maxPerAsset = 0, repeatedAssets = 0;
        for (const [k, n] of Object.entries(B)) {
          const d = n - (A[k] ?? 0); if (d <= 0) continue;
          decodes += d; maxPerAsset = Math.max(maxPerAsset, d);
          const again = (A[k] ?? 0) > 0 ? d : d - 1; // decodes of an asset that had already been decoded in this document
          if (again > 0) { redecodes += again; repeatedAssets++; }
        }
        return B && a?.decodeCounts ? { decodes, redecodes, repeatedAssets, maxPerAsset } : null;
      };
      const cpuDelta = (a, b) => (a?.cpu && b?.cpu ? {
        mainThreadTaskMs: round((b.cpu.TaskDuration - a.cpu.TaskDuration) * 1000), scriptMs: round((b.cpu.ScriptDuration - a.cpu.ScriptDuration) * 1000),
        layoutStyleMs: round((b.cpu.LayoutDuration - a.cpu.LayoutDuration + b.cpu.RecalcStyleDuration - a.cpu.RecalcStyleDuration) * 1000),
        processCpuMs: a.cpu.processCpuSeconds != null && b.cpu.processCpuSeconds != null ? round((b.cpu.processCpuSeconds - a.cpu.processCpuSeconds) * 1000) : null,
      } : null);
      const phase = (a, b) => {
        const fr = data.frames.filter((t) => t >= a.t && t < b.t);
        const pol = data.polls.filter((p) => p[0] >= a.t && p[0] < b.t);
        return {
          from: a.label, to: b.label, ms: round(b.t - a.t), ...frameStats(fr),
          appDecodes: a.cache && b.cache ? b.cache.decodes - a.cache.decodes : null, evictions: a.cache && b.cache ? b.cache.closedBitmaps - a.cache.closedBitmaps : null,
          perAsset: assetDelta(a, b), maxQueued: pol.length ? Math.max(...pol.map((p) => p[7] ?? 0)) : null,
          detailPaints: data.paints.filter((p) => p[0] >= a.t && p[0] < b.t).length, cpu: cpuDelta(a, b),
        };
      };
      receipt.extra.phases = snaps.slice(1).map((b, k) => phase(snaps[k], b));
      receipt.extra.run = { perAsset: assetDelta(startSnap, endSnap), cpu: cpuDelta(startSnap, endSnap), jsHeapUsedBytesEnd: endSnap.cpu?.JSHeapUsedSize ?? null };
      const ref = snaps.find((m) => m.label === "refined:end"), end = snaps.find((m) => m.label === "stationary-end");
      receipt.extra.stationary = ref && end ? { ...phase(ref, end), refinedReached: played.settles?.find((x) => x.label === "refined")?.reached ?? null } : null;
    }
    // Attribution: long frames (> 50 ms) that contain a detail paint, and where those paints happened.
    {
      const fr = data.frames, P = data.paints;
      let longs = 0, withPaint = 0;
      for (let i = 1; i < fr.length; i++) if (fr[i] - fr[i - 1] > 50) { longs++; if (P.some((p) => p[0] > fr[i - 1] - 1 && p[0] <= fr[i] + 1)) withPaint++; }
      const mp = P.map((p) => (p[1] * p[2]) / 1e6).filter(Number.isFinite);
      receipt.extra.detailPaints = { n: P.length, whileMoving: P.filter((p) => p[5]).length, atRest: P.filter((p) => !p[5]).length, backingMPMedian: round(percentile(mp, 50)), backingMPMax: round(mp.length ? Math.max(...mp) : null), tilesMedian: percentile(P.map((p) => p[3]), 50), longFrames: longs, longFramesWithPaint: withPaint };
      // Repaint duration: the rAF interval of the frame that contains each detail paint.
      const paintFrames = P.map((p) => { const i = fr.findIndex((t) => t >= p[0]); return i > 0 ? fr[i] - fr[i - 1] : null; }).filter(Number.isFinite);
      Object.assign(receipt.extra.detailPaints, { paintFrameMsMedian: round(percentile(paintFrames, 50)), paintFrameMsMax: round(paintFrames.length ? Math.max(...paintFrames) : null) });
      const L = data.loaf || [];
      receipt.extra.loaf = data.loaf ? { n: L.length, durationMs: round(L.reduce((a, e) => a + e[1], 0)), blockingMs: round(L.reduce((a, e) => a + e[2], 0)), scriptMs: L.reduce((a, e) => a + e[5].reduce((b, x) => b + x[2], 0), 0), forcedStyleLayoutMs: L.reduce((a, e) => a + e[5].reduce((b, x) => b + x[3], 0), 0) } : null;
    }
    receipt.extra.tapeJitterP95Ms = round(percentile(jitter, 95));
    if (receipt.extra.tapeJitterP95Ms > 16) receipt.limitations.push(`tape dispatch jitter p95 ${receipt.extra.tapeJitterP95Ms} ms (Node timers + CDP round trips)`);

    const wheelLat = data.wheel.map((w) => w.latency).filter(Number.isFinite);
    const touchLat = data.touch.map((e) => e.latency).filter(Number.isFinite);
    const touchTape = tape.steps.some((s) => s.action === "touch");
    const inputLat = touchTape ? touchLat : wheelLat;
    receipt.metrics.inputToCameraMs = round(percentile(inputLat, 50));
    receipt.extra.inputToCameraP95Ms = round(percentile(inputLat, 95));
    receipt.extra.wheelInputToCamera = { events: data.wheel.length, observed: wheelLat.length, medianMs: round(percentile(wheelLat, 50)), p95Ms: round(percentile(wheelLat, 95)) };
    receipt.extra.touchInputToCamera = { events: data.touch.length, movementEvents: data.touch.filter((e) => e.type === "touchmove").length,
      observed: touchLat.length, medianMs: round(percentile(touchLat, 50)), p95Ms: round(percentile(touchLat, 95)),
      reason: touchLat.length ? null : "no touch movement with a changed camera transform observed before the next touch event or collection end" };
    receipt.extra.touchTransport = played.touchTransport ?? [];
    receipt.metricNotes.inputToCameraMs = touchTape
      ? `CDP-injected browser touch: median over ${touchLat.length}/${data.touch.length} observed touch events, event.timeStamp -> first rAF callback whose .sequence-camera transform differs before the next touch event. Lifecycle/stationary events are not movement samples; unobserved events remain null with reasons in trace. Observational, not causal or input-to-photon; excludes physical-finger, touchscreen hardware and native OS delivery.`
      : `median over ${wheelLat.length}/${data.wheel.length} wheel events: event.timeStamp -> first rAF callback whose .sequence-camera transform differs. Not photon latency.`;
    if (!touchTape && !data.wheel.length) receipt.metricNotes.inputToCameraMs = mode === "D" ? "D replays camera transforms; no input" : "no wheel events reached the page";
    if (touchTape) receipt.limitations.push("Touch is CDP Input.dispatchTouchEvent injection into the real browser, not physical-finger/hardware/native-OS input or input-to-photon evidence. Partial release uses nonempty touchEnd containing the RELEASED IDs, supported by Chromium's legacy CDP touch path but rejected by its synthetic-pointer path. Actual contact IDs are checked after each dispatch within 500 ms; mismatch/rejection is invalid touch transport (NOT RUN), not application performance loss. Mode D replays camera transforms rather than touch.");

    const families = sourceFamilies(net.assetPaths.length ? net.assetPaths : (receipt.extra.prepAssetPaths ?? []));
    receipt.fixture = fixtureFor(families, ctx.assetsSha, ctx.assetsDirty);
    receipt.extra.sourceFamilies = families;
    receipt.extra.inspectionSources = data.end.inspectionSources;

    // Time to sharp: from the "sharp" setTarget until the painted detail tier covers the need (frame device px x zoom,
    // capped at the fixture width) with the camera at rest. Poll granularity: POLL_MS.
    const fixtureWidth = receipt.fixture.width;
    if (mode === "D") receipt.metricNotes.timeToSharpMs = "D is camera-only: refinement idle by construction";
    else if (sharpStepAt == null) receipt.metricNotes.timeToSharpMs = unsupported.has("setTarget") ? "build has no __QUACKLES_INSPECTION__.setTarget" : "tape has no measure:'sharp' step";
    else if (facts.maxZoom != null && Math.min(sharpStepZoom, facts.maxZoom) <= Math.min(sharpFromZoom, facts.maxZoom) + 0.01) {
      // The build clamps both zooms to the same value: the step only pans an already-refined view, so "sharp" may already hold.
      receipt.metricNotes.timeToSharpMs = `sharp step ${sharpFromZoom}x->${sharpStepZoom}x is clamped to maxZoom ${round(facts.maxZoom)} on both sides; no zoom change to measure`;
    } else if (!fixtureWidth) receipt.metricNotes.timeToSharpMs = `fixture width unknown (observed source families: ${families.join(", ") || "none"})`;
    else {
      // Window ends at the next viewport step: after it the camera is somewhere else.
      const windowEnd = targetTimes.find((t) => t > sharpStepAt) ?? Infinity;
      const hit = data.polls.find(([t, dw, z, moving]) => t >= sharpStepAt && t < windowEnd && dw != null && z != null && !moving && z >= Math.min(sharpStepZoom, facts.maxZoom ?? sharpStepZoom) * 0.98 && dw >= 0.98 * Math.min(Math.ceil(box.width * facts.dpr * z), fixtureWidth));
      receipt.metrics.timeToSharpMs = hit ? round(hit[0] - sharpStepAt) : null;
      receipt.metricNotes.timeToSharpMs = hit ? `setTarget(${sharpStepZoom}) -> detailWidth >= min(frame device px x zoom, ${fixtureWidth}) at rest; ${POLL_MS} ms poll` : `sharp state not reached within ${Number.isFinite(windowEnd) ? round(windowEnd - sharpStepAt, 0) : "the rest of the tape"} ms (until the next viewport step)`;
      receipt.extra.timeToSharpTarget = { zoom: Math.min(sharpStepZoom, facts.maxZoom ?? sharpStepZoom), fixtureWidth };
    }

    Object.assign(receipt.metrics, { requests: net.requests, transferredBytes: net.bytes, abortCount: net.aborted });
    receipt.metricNotes.transferredBytes = "Playwright request.sizes() body+headers over loopback (uncompressed local server, not CDN wire bytes)";
    receipt.metrics.staleWorkCount = data.end.staleDiscard != null || data.end.stalePaints != null ? (data.end.staleDiscard ?? 0) + (data.end.stalePaints ?? 0) : null;
    receipt.metricNotes.staleWorkCount = data.end.staleDiscard != null ? "app-reported cache.staleDiscard + stalePaints" : "build does not publish cache.staleDiscard/stalePaints";
    const polls = data.polls.filter(([t]) => t >= startPerf);
    receipt.metrics.blankFrames = data.selectorsFound ? polls.filter((p) => p[6]).length : null;
    receipt.metricNotes.blankFrames = data.selectorsFound ? `${POLL_MS} ms polls with no visible plate/base/detail layer (sampled, not every frame)` : "layer selectors not found in this build";
    receipt.metricNotes.staleVisibleFrames = "needs pixel/generation instrumentation (PR 2+)";
    receipt.metricNotes.sourcePops = "needs pixel/generation instrumentation (PR 2+); see extra.sourceFamilies for request-level family mixing";
    const decoded = polls.map((p) => p[4]).filter(Number.isFinite), surface = polls.map((p) => p[5]).filter(Number.isFinite);
    receipt.metrics.decodedPeakBytes = decoded.length ? Math.max(...decoded) : null;
    receipt.metricNotes.decodedPeakBytes = decoded.length ? `app-reported cache.decodedBytes, max over ${POLL_MS} ms polls` : "build does not publish cache.decodedBytes";
    receipt.metrics.gpuResidentBytesEstimate = surface.length ? Math.max(...surface) : null;
    receipt.metricNotes.gpuResidentBytesEstimate = surface.length ? "ESTIMATE: app-reported canvas backing-store bytes (w x h x 4), max over polls; excludes textures/compositor. GPU memory is not directly measured; see environment.gpu" : "build does not publish surfaceBytes";
    receipt.extra.unsupportedSteps = [...unsupported];

    // ---- correctness gates (a FAIL is a FAIL regardless of speed) ------------------------------------------------
    const gate = (name, ok, detail) => (ok ? receipt.validation.passed : receipt.validation.failed).push(ok ? name : `${name}: ${detail}`);
    gate("no-page-errors", !pageErrors.length, pageErrors.slice(0, 3).join(" | "));
    gate("no-app-errors", !(data.end.errors?.length), JSON.stringify(data.end.errors?.slice(0, 3)));
    gate("no-external-network", !net.external.length, [...new Set(net.external)].join(", "));
    gate("no-http-errors", !net.httpErrors.length, net.httpErrors.slice(0, 5).join(", "));
    gate("no-failed-requests", !net.failed.length, net.failed.slice(0, 3).join(" | "));
    const budget = (await appCounters(page).catch(() => null))?.budgetBytes;
    if (budget && receipt.metrics.decodedPeakBytes != null) gate("decoded-within-budget", receipt.metrics.decodedPeakBytes <= budget, `${receipt.metrics.decodedPeakBytes} > ${budget}`);
    // B: tiles the prep pass did not leave in the Cache API hit the blocked network. That is a limit of B's warmth, not an
    // app failure; the app's own "Failed to fetch" errors for exactly those tiles are expected.
    if (mode === "B" && net.blocked) {
      receipt.limitations.push(`B partially warm: ${net.blocked} asset requests were not in the compressed cache and hit the blocked network`);
      receipt.validation.failed = receipt.validation.failed.filter((f) => !/^no-app-errors: \[("Failed to fetch",?)+\]$/.test(f));
    }
    gate("single-source-family", families.length <= 1, families.join(", "));
    if (receipt.metrics.blankFrames != null) gate("no-blank-polls", receipt.metrics.blankFrames === 0, `${receipt.metrics.blankFrames} polls`);
    if (unsupported.size) receipt.validation.notRun.push(`tape steps unsupported by build: ${[...unsupported].join(", ")}`);
    const tapeZoom = Math.max(...tape.steps.filter((s) => s.action === "setTarget").map((s) => s.zoom));
    if (facts.maxZoom != null && facts.maxZoom < tapeZoom) receipt.limitations.push(`build clamps tape zoom ${tapeZoom} to maxZoom ${round(facts.maxZoom)}: its viewports differ from builds that reach ${tapeZoom}x (not a same-viewport comparison)`);
    receipt.limitations.push("timeToSharpMs trusts the build's own detailWidth report; its meaning can differ between builds");
    // #53: a missing asset is INCONCLUSIVE, not a loss. Tiles the build asks for but the pinned asset revision lacks.
    const missing = net.httpErrors.filter((e) => /^404 .*\/quackles-assets\//.test(e));
    if (missing.length) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift(`assets missing at quackles-assets@${ctx.assetsSha.slice(0, 12)}: ${missing.length} x 404 (e.g. ${missing[0].slice(4)})`);
    } else receipt.status = receipt.validation.failed.length ? "FAIL" : "PASS";
    if (data.visibility.some(([, state]) => state !== "visible")) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift("INVALID: page was not foreground/visible throughout the measured pass");
    }
    if (profileId === "physical" && data.focus.some(([, focused]) => !focused)) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift("INVALID: native page focus was lost during the measured pass (focus emulation disabled)");
    }
    if (ANDROID && [receipt.environment.androidBefore, receipt.environment.androidAfter].some((state) => state?.chromeForeground !== true || state?.keyguardShowing !== false || state?.screenAwake !== true)) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift("INVALID native surface: Chrome foreground, unlocked display, and awake screen were not confirmed before and after measurement");
    }
    if (mode === "E" && (net.requests > 0 || (receipt.extra.measuredApp?.networkRequests ?? 0) > 0)) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift("INVALID offline coverage: measured replay attempted network requests");
    }
    const thermalBefore = receipt.environment.androidBefore?.thermalStatus, thermalAfter = receipt.environment.androidAfter?.thermalStatus;
    if (ANDROID && (thermalBefore == null || thermalAfter == null || thermalBefore !== thermalAfter)) {
      receipt.status = "NOT RUN";
      receipt.validation.notRun.unshift("INVALID environmental control: thermal status unavailable or changed during the measured pass");
    }
    fs.mkdirSync(path.dirname(traceOut), { recursive: true });
    fs.writeFileSync(traceOut, JSON.stringify({ mode, loaf: data.loaf, cam: data.cam, frames: data.frames, wheel: data.wheel, touch: data.touch, polls: data.polls, paints: data.paints, marks, jitter, net, startPerf }));
  } catch (err) {
    receipt.status = "NOT RUN";
    receipt.validation.notRun.unshift(`harness error: ${String(err.message || err).split("\n")[0]}`);
    if (err.touchTransport) {
      receipt.extra.touchTransport = err.touchTransport;
      receipt.limitations.push("INVALID touch transport: intended contact IDs were not observed or CDP rejected the release. No physical touch acceptance or application performance conclusion can be drawn.");
      fs.mkdirSync(path.dirname(traceOut), { recursive: true });
      fs.writeFileSync(traceOut, JSON.stringify({ mode, touchTransport: err.touchTransport, ...err.touchTrace }));
    }
  } finally {
    await browserCdp?.detach().catch(() => {});
    if (ownContext) await context.close().catch(() => {}); else await page.close().catch(() => {});
  }
  return finish();
}

async function main() {
  if (!PREPARE_ONLY && !SERVE_ONLY && !CDP_ENDPOINT && !CHROME) throw new Error("Chromium not found; set CHROME");
  if (!fs.existsSync(path.join(ASSETS_DIR, ".git"))) throw new Error(`ASSETS_DIR ${ASSETS_DIR} is not a git checkout of kvnloo/quackles-assets`);
  for (const m of MODE_IDS) if (!MODES[m]) throw new Error(`unknown mode ${m}; known: ${Object.keys(MODES).join(", ")}`);
  for (const p of PROFILE_IDS) if (!PROFILES[p]) throw new Error(`unknown profile ${p}; known: ${Object.keys(PROFILES).join(", ")}`);
  const tape = validateTape(JSON.parse(fs.readFileSync(TAPE_PATH, "utf8")));
  const harnessSha = git(REPO, "rev-parse", "HEAD");
  const harnessDirty = !!git(REPO, "status", "--porcelain", "--", "scripts/lab");
  const assetsSha = git(ASSETS_DIR, "rev-parse", "HEAD");
  const assetsDirty = !!git(ASSETS_DIR, "status", "--porcelain", "--untracked-files=no");
  const runId = process.env.RUN_ID || `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-")}-${harnessSha.slice(0, 7)}`;
  const targets = REFS.map(resolveRef);
  console.error(`[lab] run ${runId}: ${targets.map((t) => `${t.ref}@${t.sha.slice(0, 12)}`).join(", ")} x ${PROFILE_IDS.join(",")} x ${TRIALS} trials`);

  const prepared = PREPARED_BUILDS ? JSON.parse(fs.readFileSync(PREPARED_BUILDS, "utf8")) : null;
  if (prepared && (prepared.assets?.sha !== assetsSha || prepared.assets?.dirty || assetsDirty)) throw new Error("prepared builds must use the same clean asset revision");
  const builds = targets.map((t) => {
    if (!prepared) { console.error(`[lab] prepare ${t.ref}@${t.sha.slice(0, 12)}`); return prepare(t); }
    const b = prepared.builds?.find((b) => b.sha === t.sha);
    if (!b || !["built", "cached"].includes(b.status) || !Number.isInteger(b.port) || b.port < 1024 || b.port > 65535) throw new Error(`no successful exact-head loopback server for ${t.sha}`);
    return { ...b, ...t, externallyServed: true };
  });
  for (const b of builds) console.error(`[lab]   ${b.ref}: ${b.status}${b.reason ? ` (${b.reason})` : ""}`);
  if (PREPARE_ONLY) {
    const out = path.join(RESULTS_DIR, runId, "builds.json");
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify({ assets: { sha: assetsSha, dirty: assetsDirty }, harness: { sha: harnessSha, dirty: harnessDirty }, builds }, null, 2) + "\n");
    console.log(out);
    if (builds.some((b) => b.status === "failed")) process.exitCode = 1;
    return;
  }
  const servers = [];
  const ports = new Map();
  let port = Number(process.env.LAB_PORT || 45940);
  for (const b of builds) {
    if (b.status === "failed") continue;
    if (b.externallyServed) {
      ports.set(b.sha, b.port);
      await waitHttp(`http://127.0.0.1:${b.port}/`);
      continue;
    }
    const p = port++;
    servers.push(serve(path.join(b.worktree, "out"), p));
    ports.set(b.sha, p);
    await waitHttp(`http://127.0.0.1:${p}/`);
  }
  if (SERVE_ONLY) {
    console.log("LAB_SERVERS_READY");
    await new Promise((resolve) => { process.once("SIGTERM", resolve); process.once("SIGINT", resolve); });
    for (const server of servers) server.kill("SIGTERM");
    return;
  }

  const gpuArgs = process.env.GPU === "1" ? ["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] : [];
  const browser = CDP_ENDPOINT ? await chromium.connectOverCDP(CDP_ENDPOINT, { noDefaults: true }) : await chromium.launch({
    executablePath: CHROME, headless: true,
    // Only loopback resolves: a build that reaches for the live asset origin fails no-external-network instead of
    // silently measuring GitHub Pages.
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--disable-background-networking", "--disable-component-update", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", ...gpuArgs],
  });
  const ctx = {
    tapeHash: tapeHash(tape), assetsSha, assetsDirty,
    harness: { sha: harnessSha, dirty: harnessDirty, runner: "scripts/lab/run.mjs", runnerSha256: fileHash(fileURLToPath(import.meta.url)), librarySha256: fileHash(path.join(HERE, "lib.mjs")) },
    environment: { browser: `Chromium ${browser.version()}`, headless: CDP_ENDPOINT ? "attached (see device)" : true, gpuFlags: CDP_ENDPOINT ? "attached browser's own GPU (see gpu)" : gpuArgs.length ? "GPU=1 (vulkan)" : "default headless (likely SwiftShader)", attached: CDP_ENDPOINT || null, deviceNote: DEVICE_NOTE || null, device: CDP_ENDPOINT ? `attached via CDP; host running the harness: ${os.cpus()[0]?.model ?? "unknown"} x${os.cpus().length}` : `${os.cpus()[0]?.model ?? "unknown"} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GiB, ${os.platform()} ${os.release()}`, node: process.version, refreshRate: "unknown (headless); see idleRafMs", thermal: "unknown" },
  };
  const manifest = { runId, startedAt: new Date().toISOString(), command: `node scripts/lab/run.mjs ${process.argv.slice(2).join(" ")}`, tape: { id: tape.id, path: path.relative(REPO, TAPE_PATH), hash: `sha256:${ctx.tapeHash}` }, trials: TRIALS, profiles: PROFILE_IDS, assets: { repo: "kvnloo/quackles-assets", sha: assetsSha, dirty: assetsDirty }, harness: ctx.harness, environment: ctx.environment, builds: builds.map(({ worktree, log, ...b }) => b), modes: MODE_IDS, orderPolicy: BALANCED ? "balanced permutations" : "seeded random", order: [], modeOrder: [] };
  try {
    for (let trial = 1; trial <= TRIALS; trial++) {
      // Seeded random contender order per trial, so no build systematically runs first (warm host, thermal drift).
      const order = BALANCED ? permutations(builds)[(trial - 1) % permutations(builds).length] : shuffle(builds, tape.seed * 7919 + trial);
      manifest.order.push(order.map((b) => b.ref));
      // Paired + randomized: every mode runs in every trial, in a seeded shuffled order.
      const modes = shuffle(MODE_IDS, tape.seed * 1000 + trial);
      manifest.modeOrder.push(modes);
      for (const b of order) for (const profileId of PROFILE_IDS) for (const mode of modes) {
        const r = await runTrial({ browser, build: b, port: ports.get(b.sha), tape, profileId, mode, trial, runId, ctx });
        console.error(`[lab] t${trial} ${b.ref} ${profileId} ${mode}: ${r.status} raf p95 ${r.metrics.rafP95Ms} max ${r.metrics.maxFrameMs} sharp ${r.metrics.timeToSharpMs} ${r.validation.failed.join("; ")}`);
      }
    }
  } finally {
    if (!CDP_ENDPOINT) await browser.close(); // never close the user's attached browser
    for (const s of servers) s.kill("SIGTERM");
  }
  manifest.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.join(RESULTS_DIR, runId), { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, runId, "run.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(path.join(RESULTS_DIR, runId));
  if (CDP_ENDPOINT) process.exit(0); // the attached browser stays open; its live CDP connection would keep node running
}

main().catch((err) => { console.error(err); process.exit(2); });
