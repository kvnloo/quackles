#!/usr/bin/env node
/** Gigapixel FEEL harness (gigapixel-single; Chromium emulation, NOT physical-device evidence).
 *  Phone: 412x915 CSS at DPR 3.5, isMobile, hasTouch, navigator.deviceMemory = DEVICE_MEMORY (default 8, what Chrome reports on
 *  the owner's S25 Ultra). Two passes, each in a fresh context (cold decoded + Cache API caches): "plain" and "throttled"
 *  (Emulation.setCPUThrottlingRate 4). Tiles come from the local 1GP clone (ASSETS) with LATENCY ms per tile (default
 *  "80-150", uniform, seeded; "0" = off) to mimic GitHub Pages round trips.
 *  Input: CDP Input.dispatchTouchEvent replay of the owner's real finger paths (TRACE, t2-gigapixel-single: pinch to ~5.4x,
 *  pinch to ~17.9x, pans, pinch-outs, flicks at ~7.4x), at the recorded timing, mapped by the poster-frame width (411 -> 412).
 *  Every animation frame, the visible crop (from the camera transform on screen) is sampled on a 9x13 grid. Each sample takes
 *  the effective resolution of the top-most painted layer covering it: detail, underlay (when the build has one), else the
 *  1024 plate. Layer coverage comes from window.__QUACKLES_PAINT__ (painted tile rects with their resolution) when the build
 *  publishes it, else from the detail canvas's data-crop + detailWidth (all-or-nothing builds). A read-back cross-check compares the reported rects with the
 *  detail canvas pixels at rest (reportMismatch).
 *  Metrics (per pass):
 *   hqLatency    lift -> every sample at >= the required resolution (frame device px x zoom, capped at the top tier), held >= 200 ms
 *                or until the next touch. p50/p90 over lifts that end zoomed; a lift the next touch interrupts first counts
 *                as censored at that gap.
 *   underResolvedShare  zoomed frames (zoom > 1.05) with > 5% of samples below the required resolution (split fingerDown / handsOff).
 *   plateEdgeFrames     zoomed frames where a sample on the outer ring shows the plate alone.
 *   edgeDeepSoftFrames  zoomed frames where an outer-ring sample is more than 4.5x below the required resolution (reported:
 *                       a whole-image low tier can hide the plate yet still be this soft).
 *   blankFrames / blueFrames  no visible layer / the fallback <img> (not this scene) shown after the first paint.
 *   thrash      per gesture: closedBitmaps, cache evictions (when the build counts them), redecodes (a tile URL decoded again:
 *               createImageBitmap wrapped + blob provenance), network refetches.
 *   frameMs     rAF delta p50/p95 while a finger is down.
 *  GATE=1 exits 1 when a plain-pass target misses: hq p90 <= 500 ms, under-resolved < 10%, plate-edge 0, blank 0, blue 0,
 *  redecodes <= 5% of decodes; blank/blue also gated in the throttled pass.
 *  OUT_DIR (+BASE_PATH), PORT, ASSETS, LATENCY, TRACE, PASSES=plain,throttled, DEVICE_MEMORY, OUT_JSON, SEED. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "45930";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const TRACE = process.env.TRACE || "/mnt/zer0models/project-artifacts/quackles/process/verifier/owner-traces/t2-gigapixel-single.trace.json";
const [latLo, latHi] = (process.env.LATENCY ?? "80-150").split("-").map(Number).concat([undefined]).map((v, i, a) => v ?? a[0]);
const PASSES = (process.env.PASSES || "plain,throttled").split(",");
const DEVICE_MEMORY = Number(process.env.DEVICE_MEMORY || 8);
// Tier widths of the displayed pyramid (default: the White 1GP of gigapixel-single) and the plate width.
const TIERS = (process.env.TIERS || "1614,3228,6455,12910,25820").split(",").map(Number), PLATE = Number(process.env.PLATE || 1024);
const CHROME = ["/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/google-chrome"].find(fs.existsSync);

// ---- trace -> CDP touch script -------------------------------------------------------------------------------------
const trace = JSON.parse(fs.readFileSync(TRACE, "utf8"));
const touchEvents = trace.ev.filter((e) => e.type === "touchstart" || e.type === "touchmove" || e.type === "touchend");
const t0 = touchEvents[0].t;
function buildScript(scale) {
  const out = []; let active = new Map();
  for (const e of touchEvents) {
    const now = new Map(e.touches.map(([id, x, y]) => [id, [x * scale, y * scale]]));
    const pts = (m) => [...m].map(([id, [x, y]]) => ({ id, x, y }));
    if (e.type === "touchstart") out.push({ t: e.t - t0, type: "touchStart", points: pts(now) });
    else if (e.type === "touchmove") out.push({ t: e.t - t0, type: "touchMove", points: pts(now) });
    else {
      const released = new Map([...active].filter(([id]) => !now.has(id)));
      out.push({ t: e.t - t0, type: "touchEnd", points: now.size ? pts(released) : [] });
    }
    active = now;
  }
  return out;
}

// ---- in-page instrumentation (installed before the app) -------------------------------------------------------------
const INIT = `(() => {
  const mem = ${DEVICE_MEMORY};
  try { Object.defineProperty(Navigator.prototype, "deviceMemory", { get: () => mem, configurable: true }); } catch {}
  const born = new WeakMap(), decodes = new Map();
  const blob = Response.prototype.blob;
  Response.prototype.blob = async function () { const b = await blob.call(this); if (this.url) born.set(b, this.url); return b; };
  const cib = window.createImageBitmap;
  window.createImageBitmap = function (src, ...rest) {
    const url = src instanceof Blob ? born.get(src) : null;
    if (url) decodes.set(url, (decodes.get(url) || 0) + 1);
    return cib.call(this, src, ...rest);
  };
  window.__gpxDecodes = decodes;
})();`;

function sampler({ tiers, plate }) {
  const frame = document.querySelector(".poster-frame"), camera = document.querySelector(".sequence-camera");
  const detail = document.querySelector(".sequence-detail"), base = document.querySelector(".sequence-base");
  const underlay = document.querySelector(".sequence-underlay"), floorEl = document.querySelector(".sequence-floor"), fallback = document.querySelector(".poster-plate");
  const S = window.__gpx = { rows: [], stop: false, fingers: 0, gestures: [], legacyWidth: 0, paints: [] };
  const pts = new Set();
  const touch = (e) => e.pointerType === "touch";
  addEventListener("pointerdown", (e) => { if (!touch(e)) return; if (!pts.size) S.gestures.push({ start: performance.now(), end: null, stats: window.__QUACKLES_SEQUENCE__.getState().cache, decodes: [...window.__gpxDecodes.values()].reduce((a, b) => a + b, 0) }); pts.add(e.pointerId); S.fingers = pts.size; }, { capture: true });
  const up = (e) => { if (!touch(e) || !pts.delete(e.pointerId)) return; S.fingers = pts.size; if (!pts.size) S.gestures[S.gestures.length - 1].end = performance.now(); };
  addEventListener("pointerup", up, { capture: true }); addEventListener("pointercancel", up, { capture: true });
  // All-or-nothing builds: the painted width, read after the player updates state (it dispatches first).
  addEventListener("quackles:detail-painted", () => { S.paints.push(performance.now()); queueMicrotask(() => { S.legacyWidth = window.__QUACKLES_SEQUENCE__.getState().detailWidth; }); });
  const GX = 9, GY = 13;
  const visible = (el) => !!el && getComputedStyle(el).visibility === "visible";
  let painted = false;
  // A layer = painted rects [x0, y0, x1, y1, res] in source space (0..1), last = top-most; res = source px per image width.
  // All-or-nothing builds: the detail canvas's on-screen box, mapped back through the camera transform into source space.
  const layerOf = (paint, name, el, fr, m) => {
    if (!el || !visible(el)) return null;
    if (paint) return paint[name]?.rects?.length ? paint[name].rects : null;
    if (name !== "detail") return null;
    const b = el.getBoundingClientRect(), z = m.a || 1;
    const u = (px) => (px - fr.left - m.e) / (z * fr.width), v = (py) => (py - fr.top - m.f) / (z * fr.height);
    return [[u(b.left), v(b.top), u(b.right), v(b.bottom), S.legacyWidth || window.__QUACKLES_SEQUENCE__.getState().detailWidth]];
  };
  const resAt = (rects, u, v) => { if (!rects) return 0; for (let k = rects.length - 1; k >= 0; k--) { const r = rects[k]; if (u >= r[0] && u <= r[2] && v >= r[1] && v <= r[3]) return r[4]; } return 0; };
  const loop = (t) => {
    if (S.stop) return;
    const m = new DOMMatrixReadOnly(getComputedStyle(camera).transform === "none" ? undefined : getComputedStyle(camera).transform);
    const r = frame.getBoundingClientRect();
    const z = m.a || 1, cx = -m.e / (z * r.width), cy = -m.f / (z * r.height), cw = 1 / z, ch = 1 / z;
    const paint = window.__QUACKLES_PAINT__ || null;
    const d = layerOf(paint, "detail", detail, r, m), u = underlay ? layerOf(paint, "underlay", underlay, r, m) : null, f = floorEl ? layerOf(paint, "floor", floorEl, r, m) : null;
    const baseOn = visible(base), fallbackOn = !!fallback && getComputedStyle(fallback).visibility !== "hidden";
    // Required: the device pixels across the image at this zoom, capped at the top tier (what the pyramid can give).
    const need = Math.min(Math.ceil(r.width * devicePixelRatio * z), tiers[tiers.length - 1]);
    let below = 0, plateEdge = 0, plateAny = 0, deepEdge = 0, n = 0, minTier = Infinity;
    for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
      const su = cx + cw * (i + 0.5) / GX, sv = cy + ch * (j + 0.5) / GY, edge = i === 0 || j === 0 || i === GX - 1 || j === GY - 1; n++;
      const res = resAt(d, su, sv) || resAt(u, su, sv) || resAt(f, su, sv) || 0, tier = res || plate;
      minTier = Math.min(minTier, tier);
      if (tier < need * 0.98) below++;
      if (edge && tier < need / 4.5) deepEdge++;
      if (!res) { plateAny++; if (edge) plateEdge++; }
    }
    S.rows.push([t, S.fingers, z, below / n, plateEdge, plateAny / n, need, minTier, baseOn || fallbackOn || visible(detail) ? 0 : 1, !baseOn && fallbackOn && (painted ||= window.__QUACKLES_SEQUENCE__.getState().drawCount > 0) ? 1 : 0, window.__QUACKLES_INSPECTION__.getState().cameraMoving ? 1 : 0, m.e, m.f, deepEdge]);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// Detail-canvas read-back at rest: does a sample the build reports as painted really hold opaque pixels, and vice versa?
function readback() {
  const paint = window.__QUACKLES_PAINT__, el = document.querySelector(".sequence-detail");
  if (!paint?.detail?.rects?.length || !el || el.style.visibility !== "visible" || !el.dataset.crop) return null;
  const [x, y, w, h] = el.dataset.crop.split(",").map(Number);
  const ctx = el.getContext("2d"); let mismatch = 0, n = 0;
  for (let j = 0; j < 13; j++) for (let i = 0; i < 9; i++) {
    const u = x + w * (i + 0.5) / 9, v = y + h * (j + 0.5) / 13;
    const said = (paint.detail.rects || []).some((r) => u >= r[0] && u <= r[2] && v >= r[1] && v <= r[3]);
    const a = ctx.getImageData(Math.floor((i + 0.5) / 9 * el.width), Math.floor((j + 0.5) / 13 * el.height), 1, 1).data[3];
    n++; if (said !== a > 0) mismatch++;
  }
  return { n, mismatch };
}

const pct = (xs, q) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return +s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(1); };

async function runPass(browser, name) {
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 3.5, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  const errors = []; page.on("pageerror", (e) => errors.push(String(e)));
  let seed = Number(process.env.SEED || 7); const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const fetched = new Map();
  await page.route("**/quackles-assets/**", async (route) => {
    const url = new URL(route.request().url()), file = path.join(ASSETS, url.pathname.replace(/^\/quackles-assets\//, ""));
    fetched.set(url.pathname, (fetched.get(url.pathname) || 0) + 1);
    if (latHi > 0) await new Promise((r) => setTimeout(r, latLo + rand() * (latHi - latLo)));
    if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" }).catch(() => {});
    await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }).catch(() => {});
  });
  await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  await page.waitForTimeout(8000); // idle warm-up after first paint (the owner idled ~25 s before the first touch)
  const frameBox = await page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const script = buildScript(frameBox.w / 411);
  if (name === "throttled") await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.evaluate(sampler, { tiers: TIERS, plate: PLATE });
  const checks = [];
  const start = Date.now();
  let lastEnd = -1;
  for (const [i, ev] of script.entries()) {
    const wait = ev.t - (Date.now() - start);
    if (wait > 1) await new Promise((r) => setTimeout(r, wait));
    await cdp.send("Input.dispatchTouchEvent", { type: ev.type, touchPoints: ev.points.map((p) => ({ x: p.x + frameBox.x, y: p.y + frameBox.y, id: p.id })) });
    if (ev.type === "touchEnd" && !ev.points.length) lastEnd = i;
    // Read-back cross-check 1.5 s after a lift when the next touch is later than that (camera at rest).
    const next = script[i + 1];
    if (lastEnd === i && next && next.t - ev.t > 1800) { await new Promise((r) => setTimeout(r, 1500)); checks.push(await page.evaluate(readback)); }
  }
  await page.waitForTimeout(3000);
  if (name === "throttled") await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const data = await page.evaluate(() => { window.__gpx.stop = true; const s = window.__QUACKLES_SEQUENCE__.getState(); return { rows: window.__gpx.rows, paints: window.__gpx.paints, gestures: window.__gpx.gestures, end: s.cache, errors: s.errors, decodes: [...window.__gpxDecodes.values()], profile: s.profile, painted: !!window.__QUACKLES_PAINT__ }; });
  await ctx.close();
  return analyse(name, data, fetched, checks.filter(Boolean), errors);
}

function analyse(name, data, fetched, checks, pageErrors) {
  const rows = data.rows.map(([t, n, z, below, plateEdge, plateAny, need, minTier, blank, blue, moving, tx, ty, deepEdge]) => ({ t, n, z, below, plateEdge, plateAny, need, minTier, blank, blue, moving, tx, ty, deepEdge }));
  const zoomed = rows.filter((r) => r.z > 1.05);
  const under = (r) => r.below > 0.05;
  const hq = (r) => r.below === 0;
  // HQ latency per lift that ends zoomed.
  const lifts = [];
  data.gestures.forEach((g, i) => {
    if (g.end == null) return;
    const next = data.gestures[i + 1]?.start ?? rows[rows.length - 1].t;
    const after = rows.filter((r) => r.t >= g.end && r.t < next);
    if (!after.length || after[after.length - 1].z <= 1.05) return;
    let reached = null;
    for (let k = 0; k < after.length; k++) {
      if (!hq(after[k])) continue;
      let hold = true;
      for (let q = k; q < after.length && after[q].t - after[k].t < 200; q++) if (!hq(after[q])) { hold = false; break; }
      if (hold) { reached = after[k].t - g.end; break; }
    }
    lifts.push({ g: i, zoom: +after[after.length - 1].z.toFixed(2), ms: reached ?? next - g.end, censored: reached == null });
  });
  const hqMs = lifts.map((l) => l.ms);
  const fingerFrames = rows.filter((r) => r.n > 0);
  const dts = fingerFrames.slice(1).map((r, i) => r.t - fingerFrames[i].t).filter((d) => d < 1000);
  const allDts = rows.slice(1).map((r, i) => r.t - rows[i].t);
  const perGesture = data.gestures.map((g, i) => {
    const next = data.gestures[i + 1]?.stats ?? data.end;
    return { closed: next.closedBitmaps - g.stats.closedBitmaps, evictions: next.evictions != null ? next.evictions - (g.stats.evictions ?? 0) : null };
  });
  // Long frames (> 25 ms) in the 1 s after each lift and the 300 ms after each detail paint (a synchronous repaint shows here).
  const dtAt = (from, to) => { const out = []; for (let k = 1; k < rows.length; k++) if (rows[k].t > from && rows[k].t <= to) out.push(rows[k].t - rows[k - 1].t); return out; };
  const liftDts = data.gestures.filter((g) => g.end != null).flatMap((g) => dtAt(g.end, g.end + 1000));
  const paintDts = data.paints.flatMap((t) => dtAt(t, t + 300));
  // Settle lag: after a lift, the last frame the camera moved faster than 20 CSS px/s on screen -> the first frame cameraMoving clears.
  const settleLag = [];
  data.gestures.forEach((g, i) => {
    if (g.end == null) return;
    const next = data.gestures[i + 1]?.start ?? rows[rows.length - 1].t;
    const after = rows.filter((r) => r.t >= g.end && r.t < next);
    let lastFast = null, cleared = null;
    for (let k = 1; k < after.length; k++) {
      const a = after[k - 1], b = after[k], dt = (b.t - a.t) / 1000;
      if (dt > 0 && (Math.hypot(b.tx - a.tx, b.ty - a.ty) / dt > 20 || Math.abs(b.z - a.z) > 1e-4)) lastFast = b.t;
    }
    const firstMoving = after.findIndex((r) => r.moving);
    if (firstMoving < 0 || lastFast == null) return;
    for (let k = firstMoving; k < after.length; k++) if (!after[k].moving) { cleared = after[k].t; break; }
    settleLag.push(cleared == null ? next - lastFast : cleared - lastFast);
  });
  // Per gesture window (touchdown -> next touchdown): zoomed frames finger-down/after, plate-at-edge and under-resolved counts.
  const windows = data.gestures.map((g, i) => {
    const next = data.gestures[i + 1]?.start ?? Infinity, w = rows.filter((r) => r.t >= g.start && r.t < next && r.z > 1.05);
    const down = w.filter((r) => r.n > 0), after = w.filter((r) => r.n === 0);
    return `g${i}:z${(w.at(-1)?.z ?? 1).toFixed(1)} down ${down.length}f/${down.filter((r) => r.plateEdge).length}e/${down.filter((r) => r.deepEdge).length}d/${down.filter(under).length}u after ${after.length}f/${after.filter((r) => r.plateEdge).length}e/${after.filter((r) => r.deepEdge).length}d/${after.filter(under).length}u`;
  });
  const decodes = data.decodes.reduce((a, b) => a + b, 0), uniqueDecodes = data.decodes.length;
  const tileFetches = [...fetched].filter(([u]) => /\/p0000000\/.*\/\d+_\d+\.webp$/.test(u));
  const res = {
    pass: name, profile: data.profile?.id, budgetMiB: data.profile ? data.profile.decodedBudgetBytes / 1048576 : null, publishesPaint: data.painted,
    frames: rows.length, zoomedFrames: zoomed.length,
    hq: { lifts: lifts.length, censored: lifts.filter((l) => l.censored).length, p50ms: pct(hqMs, 0.5), p90ms: pct(hqMs, 0.9), maxms: pct(hqMs, 1), perLift: lifts },
    underResolvedShare: +(zoomed.filter(under).length / Math.max(1, zoomed.length)).toFixed(3),
    underResolvedFingerDown: +(zoomed.filter((r) => r.n > 0 && under(r)).length / Math.max(1, zoomed.filter((r) => r.n > 0).length)).toFixed(3),
    underResolvedHandsOff: +(zoomed.filter((r) => r.n === 0 && under(r)).length / Math.max(1, zoomed.filter((r) => r.n === 0).length)).toFixed(3),
    plateEdgeFrames: zoomed.filter((r) => r.plateEdge > 0).length,
    plateOnlyFrames: zoomed.filter((r) => r.plateAny === 1).length,
    edgeDeepSoftFrames: zoomed.filter((r) => r.deepEdge > 0).length,
    blankFrames: rows.filter((r) => r.blank).length, blueFrames: rows.filter((r) => r.blue).length,
    thrash: {
      closedBitmaps: data.end.closedBitmaps, evictions: data.end.evictions ?? null, completedDecodes: data.end.completedDecodes, staleDiscard: data.end.staleDiscard,
      closedPerGestureP50: pct(perGesture.map((g) => g.closed), 0.5), closedPerGestureMax: pct(perGesture.map((g) => g.closed), 1),
      evictionsPerGestureMax: perGesture[0]?.evictions == null ? null : pct(perGesture.map((g) => g.evictions), 1),
      decodes, uniqueDecodes, redecodes: decodes - uniqueDecodes,
      tileFetches: tileFetches.reduce((a, [, n]) => a + n, 0), refetches: tileFetches.reduce((a, [, n]) => a + n - 1, 0),
    },
    frameMs: { fingerDownP50: pct(dts, 0.5), fingerDownP95: pct(dts, 0.95), allP95: pct(allDts, 0.95), afterLiftMax: pct(liftDts, 1), afterLiftOver25: liftDts.filter((d) => d > 25).length, afterPaintMax: pct(paintDts, 1), afterPaintOver25: paintDts.filter((d) => d > 25).length },
    settleLagMs: { n: settleLag.length, p50: pct(settleLag, 0.5), p90: pct(settleLag, 0.9) },
    failures: data.end.failures, errors: data.errors.length, pageErrors: pageErrors.length,
    reportMismatch: checks.length ? checks.reduce((a, c) => a + c.mismatch, 0) : null,
    windows,
  };
  return res;
}

const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const results = [];
try { for (const name of PASSES) results.push(await runPass(browser, name)); }
finally { await browser.close(); server.kill(); }
const brief = results.map(({ hq, windows, ...r }) => ({ ...r, windows: process.env.VERBOSE ? windows : undefined, hq: { ...hq, perLift: hq.perLift.map((l) => `g${l.g}@${l.zoom}:${Math.round(l.ms)}${l.censored ? "+" : ""}`).join(" ") } }));
console.log(JSON.stringify({ build: process.env.LABEL || dir, latency: latHi > 0 ? `${latLo}-${latHi}` : "0", deviceMemory: DEVICE_MEMORY, results: brief }, null, 1));
if (process.env.OUT_JSON) fs.writeFileSync(process.env.OUT_JSON, JSON.stringify({ latency: [latLo, latHi], deviceMemory: DEVICE_MEMORY, results }, null, 1));
const bad = [];
for (const r of results) {
  if (r.blankFrames) bad.push(`${r.pass}: ${r.blankFrames} blank frames`);
  if (r.blueFrames) bad.push(`${r.pass}: ${r.blueFrames} blue (fallback) frames`);
  if (r.pageErrors || r.errors || r.failures) bad.push(`${r.pass}: errors ${r.pageErrors}/${r.errors}, failures ${r.failures}`);
  if (r.reportMismatch) bad.push(`${r.pass}: painted-rect report disagrees with canvas pixels at ${r.reportMismatch} samples`);
  if (r.pass !== "plain") continue;
  if (!(r.hq.p90ms <= 500)) bad.push(`HQ latency p90 ${r.hq.p90ms} ms > 500`);
  if (!(r.underResolvedShare < 0.1)) bad.push(`under-resolved share ${(r.underResolvedShare * 100).toFixed(1)}% >= 10%`);
  if (r.plateEdgeFrames) bad.push(`${r.plateEdgeFrames} zoomed frames show the plate alone at the edges`);
  if (r.thrash.redecodes > 0.05 * r.thrash.decodes) bad.push(`thrash: ${r.thrash.redecodes} re-decodes of ${r.thrash.decodes}`);
}
if (bad.length) { console.error("FAIL", bad); if (process.env.GATE === "1") process.exit(1); }
