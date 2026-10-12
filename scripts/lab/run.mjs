#!/usr/bin/env node
/**
 * Quackles Lab runner (#53, PR 1). Opt-in; never touches the refs it measures.
 *
 *   node scripts/lab/run.mjs --refs nightly --trials 5
 *   node scripts/lab/run.mjs --refs nightly,2d22784d --profiles desktop,mobile-emulated --trials 5
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
  "mobile-emulated": { viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true, cpuThrottle: 4, label: "emulated mobile viewport + 4x CPU throttle (NOT a physical phone)" },
};

function findChrome(dir) {
  for (const p of ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome"]) if (fs.existsSync(path.join(dir, p))) return path.join(dir, p);
  return null;
}
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const tryGit = (cwd, ...args) => { try { return git(cwd, ...args); } catch { return null; } };
const fileHash = (p) => (fs.existsSync(p) ? sha256(fs.readFileSync(p)) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

// ---- in-page collector (installed at tape start; reads only app-published debug state, no readPixels) --------------
function installCollector({ pollMs }) {
  const camera = document.querySelector(".sequence-camera");
  const frame = document.querySelector(".poster-frame");
  const layers = [".sequence-base", ".sequence-detail", ".poster-plate"].map((s) => document.querySelector(s));
  const C = (window.__lab = { frames: [], wheel: [], polls: [], paints: [], stop: false, selectorsFound: !!camera && !!frame && layers.some(Boolean) });
  const transform = () => (camera ? camera.style.transform || getComputedStyle(camera).transform : "");
  const pending = [];
  addEventListener("wheel", (e) => { const rec = { ts: e.timeStamp, before: transform(), latency: null }; C.wheel.push(rec); pending.push(rec); }, { capture: true, passive: true });
  addEventListener("quackles:detail-painted", () => C.paints.push(performance.now()));
  const loop = () => {
    if (C.stop) return;
    const now = performance.now();
    C.frames.push(now);
    if (pending.length) {
      const tr = transform();
      for (let i = pending.length - 1; i >= 0; i--) if (tr !== pending[i].before) { pending[i].latency = now - pending[i].ts; pending.splice(i, 1); }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const visible = (el) => !!el && getComputedStyle(el).visibility !== "hidden" && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
  const poll = () => {
    if (C.stop) return;
    const s = window.__QUACKLES_SEQUENCE__?.getState?.();
    const i = window.__QUACKLES_INSPECTION__?.getState?.();
    C.polls.push([performance.now(), s?.detailWidth ?? null, i?.zoom ?? null, i?.cameraMoving ?? null, s?.cache?.decodedBytes ?? null, s?.surfaceBytes ?? null, layers.some(visible) ? 0 : 1]);
    setTimeout(poll, pollMs);
  };
  poll();
}

async function runTrial({ browser, build, port, tape, profileId, trial, runId, ctx }) {
  const profile = PROFILES[profileId];
  const scenario = { id: tape.id, seed: tape.seed, tapeHash: `sha256:${ctx.tapeHash}`, tape: path.relative(REPO, TAPE_PATH) };
  const out = path.join(RESULTS_DIR, runId, `${slug(build.ref)}-${tape.id}-${profileId}-t${trial}.json`);
  const traceOut = path.join(RESULTS_DIR, runId, "traces", path.basename(out));
  const receipt = {
    schema: RECEIPT_SCHEMA, runId, branch: build.ref, sha: build.sha, trial, status: "NOT RUN",
    harness: ctx.harness, fixture: fixtureFor([], ctx.assetsSha, ctx.assetsDirty),
    environment: { ...ctx.environment, profile: profileId, profileLabel: profile.label, viewport: profile.viewport, dpr: profile.deviceScaleFactor, cpuThrottle: profile.cpuThrottle, network: "local-loopback-unthrottled; external hosts unresolvable", cache: "cold", instrumentation: "normal" },
    scenario, metrics: {}, metricNotes: {}, extra: {},
    validation: { passed: [], failed: [], notRun: ["collector-overhead-calibration (no uninstrumented control yet)", "gpu-completion (JS timings only)", "physical-device", "pixel-fidelity/source-pop checks"] },
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

  const context = await browser.newContext({ viewport: profile.viewport, deviceScaleFactor: profile.deviceScaleFactor, isMobile: profile.isMobile, hasTouch: profile.hasTouch, serviceWorkers: "block" });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const net = { requests: 0, bytes: 0, aborted: 0, failed: [], external: [], httpErrors: [], assetPaths: [] };
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
    else net.failed.push(`${why} ${r.url().slice(0, 120)}`);
  });

  try {
    if (profile.cpuThrottle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpuThrottle });
    await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: "load", timeout: 120000 });
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
      return { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown", userAgent: navigator.userAgent, dpr: devicePixelRatio, screen: `${screen.width}x${screen.height}`, appProfile: s?.profile?.id ?? null, maxZoom: window.__QUACKLES_INSPECTION__?.getState?.().maxZoom ?? null, hasSetTarget: typeof window.__QUACKLES_INSPECTION__?.setTarget === "function" };
    });
    Object.assign(receipt.environment, { gpu: facts.gpu, userAgent: facts.userAgent, screen: facts.screen, appProfile: facts.appProfile });
    receipt.extra.maxZoom = facts.maxZoom;
    await sleep(tape.warmupMs ?? 0);
    const idle = await page.evaluate(() => new Promise((res) => { const ts = []; const f = (t) => { ts.push(t); if (ts.length < 40) requestAnimationFrame(f); else res(ts); }; requestAnimationFrame(f); }));
    receipt.environment.idleRafMs = round(percentile(idle.slice(1).map((t, i) => t - idle[i]), 50));

    const box = await page.locator(".poster-frame").boundingBox();
    if (!box) {
      receipt.validation.notRun.unshift(".poster-frame not found: tape coordinates undefined for this build");
      return finish();
    }
    await page.evaluate(installCollector, { pollMs: POLL_MS });
    const startPerf = await page.evaluate(() => performance.now());
    const t0 = performance.now();
    const marks = [], jitter = [];
    let sharpStepAt = null, sharpStepZoom = null, sharpFromZoom = null, lastZoom = 1, unsupported = new Set();
    const targetTimes = [];
    for (const step of tape.steps) {
      const wait = step.t - (performance.now() - t0);
      if (wait > 1) await sleep(wait);
      jitter.push(performance.now() - t0 - step.t);
      const px = box.x + (step.x ?? 0.5) * box.width, py = box.y + (step.y ?? 0.5) * box.height;
      if (step.action === "setTarget") {
        if (!facts.hasSetTarget) { unsupported.add("setTarget"); continue; }
        const at = await page.evaluate(({ zoom, x, y }) => { window.__QUACKLES_INSPECTION__.setTarget(zoom, x, y); return performance.now(); }, step);
        targetTimes.push(at);
        if (step.measure === "sharp") { sharpStepAt = at; sharpStepZoom = step.zoom; sharpFromZoom = lastZoom; }
        lastZoom = step.zoom;
      } else if (step.action === "wheel") {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: px, y: py, deltaX: step.deltaX ?? 0, deltaY: step.deltaY });
      } else if (step.action === "mouseMove") {
        await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: px, y: py });
      } else if (step.action === "mark") marks.push(step.label);
    }
    await sleep(SETTLE_MS);
    const data = await page.evaluate(() => {
      window.__lab.stop = true;
      const s = window.__QUACKLES_SEQUENCE__?.getState?.();
      return { ...window.__lab, end: { errors: s?.errors ?? null, stalePaints: s?.stalePaints ?? null, staleDiscard: s?.cache?.staleDiscard ?? null, cacheFailures: s?.cache?.failures ?? null, inspectionSources: s?.inspectionSources ?? null } };
    });
    const shot = path.join(RESULTS_DIR, runId, "screens", path.basename(out, ".json") + ".png");
    fs.mkdirSync(path.dirname(shot), { recursive: true });
    await page.screenshot({ path: shot });
    receipt.artifacts.screenshots.push(path.relative(REPO, shot));

    // ---- metrics -------------------------------------------------------------------------------------------------
    const fs_ = frameStats(data.frames);
    Object.assign(receipt.metrics, { rafP50Ms: fs_.rafP50Ms, rafP95Ms: fs_.rafP95Ms, rafP99Ms: fs_.rafP99Ms, maxFrameMs: fs_.maxFrameMs, framesOver33Ms: fs_.framesOver33Ms, framesOver50Ms: fs_.framesOver50Ms });
    receipt.extra.frames = fs_.frames;
    receipt.extra.tapeJitterP95Ms = round(percentile(jitter, 95));
    if (receipt.extra.tapeJitterP95Ms > 16) receipt.limitations.push(`tape dispatch jitter p95 ${receipt.extra.tapeJitterP95Ms} ms (Node timers + CDP round trips)`);

    const wheelLat = data.wheel.map((w) => w.latency).filter(Number.isFinite);
    receipt.metrics.inputToCameraMs = round(percentile(wheelLat, 50));
    receipt.metricNotes.inputToCameraMs = `median over ${wheelLat.length}/${data.wheel.length} wheel events: event.timeStamp -> first rAF callback whose .sequence-camera transform differs. Not photon latency.`;
    receipt.extra.inputToCameraP95Ms = round(percentile(wheelLat, 95));
    if (!data.wheel.length) receipt.metricNotes.inputToCameraMs = "no wheel events reached the page";

    const families = sourceFamilies(net.assetPaths);
    receipt.fixture = fixtureFor(families, ctx.assetsSha, ctx.assetsDirty);
    receipt.extra.sourceFamilies = families;
    receipt.extra.inspectionSources = data.end.inspectionSources;

    // Time to sharp: from the "sharp" setTarget until the painted detail tier covers the need (frame device px x zoom,
    // capped at the fixture width) with the camera at rest. Poll granularity: POLL_MS.
    const fixtureWidth = receipt.fixture.width;
    if (sharpStepAt == null) receipt.metricNotes.timeToSharpMs = unsupported.has("setTarget") ? "build has no __QUACKLES_INSPECTION__.setTarget" : "tape has no measure:'sharp' step";
    else if (facts.maxZoom != null && Math.min(sharpStepZoom, facts.maxZoom) <= Math.min(sharpFromZoom, facts.maxZoom) + 0.01) {
      // The build clamps both zooms to the same value: the step only pans an already-refined view, so "sharp" may already hold.
      receipt.metricNotes.timeToSharpMs = `sharp step ${sharpFromZoom}x->${sharpStepZoom}x is clamped to maxZoom ${round(facts.maxZoom)} on both sides; no zoom change to measure`;
    } else if (!fixtureWidth) receipt.metricNotes.timeToSharpMs = `fixture width unknown (observed source families: ${families.join(", ") || "none"})`;
    else {
      // Window ends at the next viewport step: after it the camera is somewhere else.
      const windowEnd = targetTimes.find((t) => t > sharpStepAt) ?? Infinity;
      const hit = data.polls.find(([t, dw, z, moving]) => t >= sharpStepAt && t < windowEnd && dw != null && z != null && !moving && z >= Math.min(sharpStepZoom, facts.maxZoom ?? sharpStepZoom) * 0.98 && dw >= 0.98 * Math.min(Math.ceil(box.width * profile.deviceScaleFactor * z), fixtureWidth));
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
    receipt.metricNotes.gpuResidentBytesEstimate = surface.length ? "ESTIMATE: app-reported canvas backing-store bytes (w x h x 4), max over polls; excludes textures/compositor" : "build does not publish surfaceBytes";
    receipt.extra.unsupportedSteps = [...unsupported];

    // ---- correctness gates (a FAIL is a FAIL regardless of speed) ------------------------------------------------
    const gate = (name, ok, detail) => (ok ? receipt.validation.passed : receipt.validation.failed).push(ok ? name : `${name}: ${detail}`);
    gate("no-page-errors", !pageErrors.length, pageErrors.slice(0, 3).join(" | "));
    gate("no-app-errors", !(data.end.errors?.length), JSON.stringify(data.end.errors?.slice(0, 3)));
    gate("no-external-network", !net.external.length, [...new Set(net.external)].join(", "));
    gate("no-http-errors", !net.httpErrors.length, net.httpErrors.slice(0, 5).join(", "));
    gate("no-failed-requests", !net.failed.length, net.failed.slice(0, 3).join(" | "));
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
    fs.mkdirSync(path.dirname(traceOut), { recursive: true });
    fs.writeFileSync(traceOut, JSON.stringify({ frames: data.frames, wheel: data.wheel, polls: data.polls, paints: data.paints, marks, jitter, net, startPerf }));
  } catch (err) {
    receipt.status = "NOT RUN";
    receipt.validation.notRun.unshift(`harness error: ${String(err.message || err).split("\n")[0]}`);
  } finally {
    await context.close().catch(() => {});
  }
  return finish();
}

async function main() {
  if (!CHROME) throw new Error("Chromium not found; set CHROME");
  if (!fs.existsSync(path.join(ASSETS_DIR, ".git"))) throw new Error(`ASSETS_DIR ${ASSETS_DIR} is not a git checkout of kvnloo/quackles-assets`);
  for (const p of PROFILE_IDS) if (!PROFILES[p]) throw new Error(`unknown profile ${p}; known: ${Object.keys(PROFILES).join(", ")}`);
  const tape = validateTape(JSON.parse(fs.readFileSync(TAPE_PATH, "utf8")));
  const harnessSha = git(REPO, "rev-parse", "HEAD");
  const harnessDirty = !!git(REPO, "status", "--porcelain", "--", "scripts/lab");
  const assetsSha = git(ASSETS_DIR, "rev-parse", "HEAD");
  const assetsDirty = !!git(ASSETS_DIR, "status", "--porcelain", "--untracked-files=no");
  const runId = process.env.RUN_ID || `${new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-")}-${harnessSha.slice(0, 7)}`;
  const targets = REFS.map(resolveRef);
  console.error(`[lab] run ${runId}: ${targets.map((t) => `${t.ref}@${t.sha.slice(0, 12)}`).join(", ")} x ${PROFILE_IDS.join(",")} x ${TRIALS} trials`);

  const builds = targets.map((t) => { console.error(`[lab] prepare ${t.ref}@${t.sha.slice(0, 12)}`); return prepare(t); });
  for (const b of builds) console.error(`[lab]   ${b.ref}: ${b.status}${b.reason ? ` (${b.reason})` : ""}`);
  const servers = [];
  const ports = new Map();
  let port = Number(process.env.LAB_PORT || 45940);
  for (const b of builds) {
    if (b.status === "failed") continue;
    const p = port++;
    servers.push(serve(path.join(b.worktree, "out"), p));
    ports.set(b.sha, p);
    await waitHttp(`http://127.0.0.1:${p}/`);
  }

  const gpuArgs = process.env.GPU === "1" ? ["--enable-gpu", "--use-angle=vulkan", "--enable-features=Vulkan", "--ignore-gpu-blocklist"] : [];
  const browser = await chromium.launch({
    executablePath: CHROME, headless: true,
    // Only loopback resolves: a build that reaches for the live asset origin fails no-external-network instead of
    // silently measuring GitHub Pages.
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost", "--disable-background-networking", "--disable-component-update", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", ...gpuArgs],
  });
  const ctx = {
    tapeHash: tapeHash(tape), assetsSha, assetsDirty,
    harness: { sha: harnessSha, dirty: harnessDirty, runner: "scripts/lab/run.mjs" },
    environment: { browser: `Chromium ${browser.version()}`, headless: true, gpuFlags: gpuArgs.length ? "GPU=1 (vulkan)" : "default headless (likely SwiftShader)", device: `${os.cpus()[0]?.model ?? "unknown"} x${os.cpus().length}, ${Math.round(os.totalmem() / 2 ** 30)} GiB, ${os.platform()} ${os.release()}`, node: process.version, refreshRate: "unknown (headless); see idleRafMs", thermal: "unknown" },
  };
  const manifest = { runId, startedAt: new Date().toISOString(), command: `node scripts/lab/run.mjs ${process.argv.slice(2).join(" ")}`, tape: { id: tape.id, path: path.relative(REPO, TAPE_PATH), hash: `sha256:${ctx.tapeHash}` }, trials: TRIALS, profiles: PROFILE_IDS, assets: { repo: "kvnloo/quackles-assets", sha: assetsSha, dirty: assetsDirty }, harness: ctx.harness, environment: ctx.environment, builds: builds.map(({ worktree, log, ...b }) => b), order: [] };
  try {
    for (let trial = 1; trial <= TRIALS; trial++) {
      // Rotate contender order every trial so no build always runs first (warm host, thermal drift).
      const k = (trial - 1) % builds.length;
      const order = [...builds.slice(k), ...builds.slice(0, k)];
      manifest.order.push(order.map((b) => b.ref));
      for (const b of order) for (const profileId of PROFILE_IDS) {
        const r = await runTrial({ browser, build: b, port: ports.get(b.sha), tape, profileId, trial, runId, ctx });
        console.error(`[lab] t${trial} ${b.ref} ${profileId}: ${r.status} raf p95 ${r.metrics.rafP95Ms} max ${r.metrics.maxFrameMs} sharp ${r.metrics.timeToSharpMs} ${r.validation.failed.join("; ")}`);
      }
    }
  } finally {
    await browser.close();
    for (const s of servers) s.kill("SIGTERM");
  }
  manifest.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.join(RESULTS_DIR, runId), { recursive: true });
  fs.writeFileSync(path.join(RESULTS_DIR, runId, "run.json"), JSON.stringify(manifest, null, 2) + "\n");
  console.log(path.join(RESULTS_DIR, runId));
}

main().catch((err) => { console.error(err); process.exit(2); });
