#!/usr/bin/env node
/** Chromecast mirror, headless (docs/CAST.md). NOT device evidence: both "screens" are Chromium pages on this machine.
 *
 * A sender page (phone: 412x915 @2.6, touch) and a receiver page (TV: /cast-receiver/, 1280x720 @1.5) are bridged by
 * the BroadcastChannel shim (?castTransport=bc) that implements the same transport interface as the Cast SDK, with a
 * simulated network on the receiver (?castNetDelay/&castNetJitter). The sender is driven by scroll, theme swipe,
 * programmatic theme select, a two-finger pinch, a one-finger pan and a programmatic zoom; the test asserts:
 *   M1 the Cast button appears without shifting any layout;
 *   M2 the receiver mirrors state: progress / theme / zoom lag (phone display -> TV display) within LAG_BOUND_MS at p95,
 *      and reaches the same story frame and theme;
 *   M3 TV motion is smooth: no backwards zoom step during a monotonic pinch;
 *   M4 the receiver promotes deep-zoom tiles for the mirrored crop (receiver perf profile, own network fetches);
 *   M5 only small state crosses the channel (<= 220 B per message, <= SEND_HZ+1 msgs/s), and the sender makes zero tile
 *      requests for the receiver's view (every tile the TV painted was fetched by the TV; tiles only the TV needed were
 *      never requested by the phone);
 *   M6 a reloaded receiver resyncs from a snapshot; no page errors on either page.
 * OUT_DIR (a NEXT_PUBLIC_CAST=1 export), PORT, ASSETS (local clone of quackles-assets). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44231", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const BASE = `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}`;
const NET = { delay: 15, jitter: 25 }; // simulated one-way Wi-Fi to the TV
const LAG_BOUND_MS = 200; // p95 bound: 80 ms playout + <=33 ms pacing + network 15-40 ms + 2 display frames
if (!fs.existsSync(path.join(dir, "cast-receiver/index.html"))) { console.error(`${dir} is not a cast build (NEXT_PUBLIC_CAST=1 npm run build)`); process.exit(2); }
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
process.on("exit", () => server.kill()); // never leave a static server behind on a crash
await new Promise((r) => setTimeout(r, 1500));
// Two browser processes = two devices: no shared cache, no shared compositor (one headless browser starves the rAF of
// the page that is not being driven). The harness relays the shim channel between them, like a network would.
const launch = () => chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const browsers = [await launch(), await launch(), await launch()];
const serveAssets = async (route) => {
  const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
  if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
};
const [tvCtx, phoneCtx, soloCtx] = await Promise.all(browsers.map((b) => b.newContext()));
for (const c of [tvCtx, phoneCtx, soloCtx]) { await c.route("**/quackles-assets/**", serveAssets); await c.route("https://www.gstatic.com/**", (r) => r.abort()); }
const peers = {};
/** The in-page shim is a BroadcastChannel; a relay channel object in each page forwards packets to the other device. */
async function relay(role, page, to) {
  await page.exposeBinding("__castRelay", (_source, packet) => peers[to]?.evaluate((p) => window.__castRelayOut?.postMessage(p), packet).catch(() => {}));
  await page.addInitScript(() => { const bc = new BroadcastChannel("quackles-cast-shim"); window.__castRelayOut = bc; bc.onmessage = (e) => window.__castRelay(e.data); });
  peers[role] = page;
}
const res = {}, bad = [];
const requests = { sender: [], receiver: [], solo: [] }, errors = { sender: [], receiver: [], solo: [] };
const isTile = (url) => /\/quackles-assets\/.+\/\d+_\d+\.webp/.test(url);
async function open(role, url, metrics, touch, context, peer) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  if (peer) await relay(role, page, peer);
  await cdp.send("Emulation.setDeviceMetricsOverride", metrics);
  if (touch) await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  // Two devices never share an HTTP cache: every tile a page paints must come from that page's own fetch.
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  page.on("request", (r) => requests[role].push(r.url()));
  page.on("pageerror", (e) => errors[role].push(String(e)));
  await page.goto(url);
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 });
  return { page, cdp };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (xs, p) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
const r1 = (v) => Math.round(v * 10) / 10;

const tv = await open("receiver", `${BASE}/cast-receiver/?castTransport=bc&castNetDelay=${NET.delay}&castNetJitter=${NET.jitter}`, { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false }, false, tvCtx, "sender");
const phone = await open("sender", `${BASE}/?castTransport=bc`, { width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true }, true, phoneCtx, "receiver");
const tvState = () => tv.page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { rendered: s.rendered, current: s.current, detailWidth: s.detailWidth, detailTiles: s.detailTiles, inspection: s.inspection, profile: s.profile.id, crop: document.querySelector(".sequence-detail")?.dataset.crop ?? null, cast: window.__QUACKLES_CAST__?.getState() }; });
const phoneState = () => phone.page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return { rendered: s.rendered, requested: s.requested, errors: s.errors, current: s.current, inspection: s.inspection, profile: s.profile.id, cast: window.__QUACKLES_CAST_SENDER__?.getState() }; });

// M1: the button arrives after first paint + idle; nothing moves when it does.
const rects = () => phone.page.evaluate(() => [".poster-frame", ".site-nav", ".hero-copy", ".scene-hud", ".sequence-player"].map((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r ? [s, r.x, r.y, r.width, r.height].join() : s; }));
const before = await rects();
await phone.page.waitForSelector('[data-testid="cast-button"]', { timeout: 10000 });
const after = await rects();
res.layout = { shifted: before.filter((r, i) => r !== after[i]) };
if (res.layout.shifted.length) bad.push(`Cast button shifted layout: ${res.layout.shifted.join(" | ")}`);
// Ground truth: what each screen SHOWS, on the shared wall clock. Phone: every display frame. TV: every frame at which
// the receiver applied a new state (its own log), plus a plain rAF counter for its frame rate.
await phone.page.evaluate(() => {
  const rows = window.__rows = [];
  const loop = () => { const c = window.__QUACKLES_INSPECTION__.getState(), s = window.__QUACKLES_SEQUENCE__.getState().current;
    rows.push({ t: performance.timeOrigin + performance.now(), zoom: c.zoom, fx: c.focusX, progress: s.progress, theme: s.theme }); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const countFrames = (page) => page.evaluate(() => { window.__frames = []; const loop = (t) => { window.__frames.push(performance.timeOrigin + t); requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
await countFrames(tv.page);
await phone.page.click('[data-testid="cast-button"]');
await phone.page.waitForFunction(() => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connected");
await tv.page.waitForFunction(() => window.__QUACKLES_CAST__?.getState().received > 0, null, { timeout: 5000 });
await wait(400);
const connectedAt = await phone.page.evaluate(() => performance.timeOrigin + performance.now());
res.profiles = { phone: (await phoneState()).profile, tv: (await tvState()).profile };
if (res.profiles.tv !== "receiver") bad.push(`receiver runs the ${res.profiles.tv} profile (want receiver)`);
if (res.profiles.phone !== "balanced") bad.push(`phone profile changed to ${res.profiles.phone}`);
res.status = await tv.page.textContent('[data-testid="cast-status"]');
const phoneRows = async (a, b) => (await phone.page.evaluate(() => window.__rows)).filter((r) => r.t >= a && r.t <= b);
const tvRows = async (a, b) => (await tv.page.evaluate(() => window.__QUACKLES_CAST__.getState().log))
  .map(({ at, view }) => ({ t: at, zoom: view.zoom, fx: view.focusX, progress: view.progress, theme: view.theme })).filter((r) => r.t >= a && r.t <= b);
const tvFps = async (a, b) => { const f = (await tv.page.evaluate(() => window.__frames)).filter((t) => t >= a && t <= b); return f.length > 1 ? r1((f.length - 1) / ((f.at(-1) - f[0]) / 1000)) : 0; };
/** Poll until check(phoneState, tvState) holds; returns ms taken or null on timeout. */
async function converge(check, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) { if (check(await phoneState(), await tvState())) return Date.now() - start; await wait(100); }
  return null;
}
/** For each TV frame inside a monotonic phone motion, when did the phone SHOW that value? lag = tvTime - phoneTime. */
function lags(phoneRows, tvRows, key) {
  const up = phoneRows.at(-1)[key] >= phoneRows[0][key], sign = up ? 1 : -1;
  const lo = Math.min(phoneRows[0][key], phoneRows.at(-1)[key]), hi = Math.max(phoneRows[0][key], phoneRows.at(-1)[key]);
  const span = hi - lo, out = [];
  for (const row of tvRows) {
    const v = row[key];
    if (!(v > lo + span * 0.05 && v < hi - span * 0.05)) continue;
    const i = phoneRows.findIndex((p) => sign * (p[key] - v) >= 0);
    if (i <= 0) continue;
    const a = phoneRows[i - 1], b = phoneRows[i];
    const u = b[key] === a[key] ? 0 : (v - a[key]) / (b[key] - a[key]);
    out.push(row.t - (a.t + u * (b.t - a.t)));
  }
  return out;
}
const now = () => phone.page.evaluate(() => performance.timeOrigin + performance.now());
const lagStats = (xs) => ({ n: xs.length, p50: r1(pct(xs, 0.5)), p95: r1(pct(xs, 0.95)), max: r1(Math.max(...xs)) });

// M4 deep zoom first, from the fresh hero: the phone asks for 6x; the TV must follow and promote its OWN tiles.
const deepZoomStartedAt = await now();
await phone.page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.42, 0.35));
let deep = null;
for (let k = 0; k < 60 && !deep; k++) {
  await wait(250);
  const [ps, ts] = [await phoneState(), await tvState()];
  if (!ps.inspection.cameraMoving && !ts.inspection.cameraMoving && ts.detailTiles > 0 && ts.detailWidth > 1024 && Math.abs(ps.inspection.zoom - ts.inspection.zoom) < 1e-3) deep = { ps, ts };
}
await wait(1500); // let both settle their sharp layers
const strip = (u) => u.replace(/^https?:\/\/[^/]+/, "");
const tvPainted = ((await tvState()).rendered?.urls ?? []).filter(isTile).map(strip);
const phoneTilesWhileCasting = new Set(requests.sender.filter(isTile).map(strip));
if (!deep) bad.push("receiver never painted deep-zoom tiles for the mirrored 6x crop");
else {
  const { ts, ps } = deep;
  const z = ts.inspection.zoom, w = 1 / z, crop = { x: ts.inspection.focusX * (1 - w), y: ts.inspection.focusY * (1 - w), w };
  const [cx, cy, cw, ch] = (ts.crop ?? "0,0,0,0").split(",").map(Number);
  const covered = crop.x >= cx - 1e-6 && crop.y >= cy - 1e-6 && crop.x + w <= cx + cw + 1e-6 && crop.y + w <= cy + ch + 1e-6;
  res.deepZoom = { zoom: +z.toFixed(4), phoneZoom: +ps.inspection.zoom.toFixed(4), tvDetailWidth: ts.detailWidth, tvDetailTiles: ts.detailTiles, phoneDetailWidth: (await phone.page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().detailWidth)), tvCoverage: ts.crop, mirroredCropCovered: covered };
  if (!covered) bad.push(`TV detail layer ${ts.crop} does not cover the mirrored crop ${JSON.stringify(crop)}`);
  const tvFetched = new Set(requests.receiver.map(strip));
  res.network = { tvPaintedTiles: tvPainted.length, tvPaintedFetchedByTv: tvPainted.filter((u) => tvFetched.has(u)).length, phoneTileRequests: phoneTilesWhileCasting.size };
  if (!tvPainted.length) bad.push("TV painted no tiles");
  if (res.network.tvPaintedFetchedByTv !== tvPainted.length) bad.push(`TV painted ${tvPainted.length - res.network.tvPaintedFetchedByTv} tiles it did not fetch itself`);
}
await phone.page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5));
await converge((ps, ts) => !ps.inspection.active && ts.inspection.zoom <= 1.0005);
res.deepZoomMs = Math.round((await now()) - deepZoomStartedAt);

// M2a story scroll (native scroll on the phone, 900 ms sweep to 30 % of the story).
let t0 = await now();
await phone.page.evaluate(() => new Promise((done) => { const max = document.documentElement.scrollHeight - innerHeight, start = performance.now();
  const step = (t) => { const u = Math.min(1, (t - start) / 900); scrollTo(0, max * 0.3 * u); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }));
let t1 = await now(); await wait(700);
{
  const p = await phoneRows(t0, t1 + 50), tvr = await tvRows(t0, t1 + 600);
  res.scrollLag = lagStats(lags(p, tvr, "progress"));
  // Same frame on both screens: the TV loads its own plates, so "rendered" converges once its fetch+decode lands.
  const ms = await converge((ps, ts) => !!ps.rendered && ps.rendered.frameId === ts.rendered?.frameId && Math.abs(ps.current.progress - ts.current.progress) < 1e-4);
  const [ps, ts] = [await phoneState(), await tvState()];
  res.scroll = { phoneProgress: +ps.current.progress.toFixed(4), tvProgress: +ts.current.progress.toFixed(4), phoneFrame: ps.rendered?.frameId, tvFrame: ts.rendered?.frameId, sameFrameAfterMs: ms };
  if (ms === null) bad.push(`story not mirrored: phone ${res.scroll.phoneProgress}/${res.scroll.phoneFrame} tv ${res.scroll.tvProgress}/${res.scroll.tvFrame}`);
}

// M2b theme: a horizontal swipe (fractional drag) then a programmatic select.
const box = await phone.page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + r.height / 2, innerHeight / 2) }; });
const touch = (type, pts) => phone.cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })) });
t0 = await now();
await touch("touchStart", [[box.x + 120, box.y]]);
for (let i = 1; i <= 20; i++) { await touch("touchMove", [[box.x + 120 - i * 12, box.y]]); await wait(16); }
await touch("touchEnd", []); t1 = await now(); await wait(600);
{
  const p = await phoneRows(t0, t1), tvr = await tvRows(t0, t1 + 500);
  res.themeSwipeLag = lagStats(lags(p, tvr, "theme"));
  const [ps, ts] = [await phoneState(), await tvState()];
  res.themeSwipe = { phone: +ps.current.theme.toFixed(4), tv: +ts.current.theme.toFixed(4) };
  if (Math.abs(ps.current.theme - 2) < 0.05) bad.push(`theme swipe did not move the phone's theme (${res.themeSwipe.phone})`);
  if (Math.abs(ps.current.theme - ts.current.theme) > 1e-3) bad.push(`swiped theme not mirrored: ${res.themeSwipe.phone} vs ${res.themeSwipe.tv}`);
}
for (const id of ["night", "blue"]) {
  await phone.page.evaluate((x) => window.__QUACKLES_SEQUENCE__.setTheme(x), id);
  // Painted theme = first theme index + blend (the engine's paint key is 3-decimal, so a 0.9996 blend can remain "dark+night").
  const THEMES = ["day", "white", "blue", "dark", "night"], want = THEMES.indexOf(id);
  const painted = (r) => (r?.themes?.length ? THEMES.indexOf(r.themes[0]) + (r.themes.length > 1 ? r.mix : 0) : NaN);
  const ms = await converge((ps, ts) => Math.abs(painted(ps.rendered) - want) < 1e-3 && Math.abs(painted(ts.rendered) - want) < 1e-3 && ps.rendered.frameId === ts.rendered.frameId);
  const [ps, ts] = [await phoneState(), await tvState()];
  res[`theme_${id}`] = { phone: +painted(ps.rendered).toFixed(4), tv: +painted(ts.rendered).toFixed(4), sameThemeAfterMs: ms };
  if (ms === null) bad.push(`theme ${id}: phone ${res[`theme_${id}`].phone} tv ${res[`theme_${id}`].tv}`);
}

// M2d reduced motion on the phone maps progress to other frames: the TV must follow the phone's setting.
await phone.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
{
  const ms = await converge((ps, ts) => ps.current.reducedMotion && ts.current.reducedMotion && !!ps.rendered && ps.rendered.frameId === ts.rendered?.frameId);
  const [ps, ts] = [await phoneState(), await tvState()];
  res.reducedMotion = { phoneFrame: ps.rendered?.frameId, tvFrame: ts.rendered?.frameId, tvReduced: ts.current.reducedMotion, sameFrameAfterMs: ms };
  if (ms === null) bad.push(`reduced motion not mirrored: ${JSON.stringify(res.reducedMotion)}`);
}
await phone.cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
await converge((ps, ts) => !ps.current.reducedMotion && !ts.current.reducedMotion);

// Back to the hero (inspection lives there).
await phone.page.evaluate(() => new Promise((done) => { const from = scrollY, start = performance.now();
  const step = (t) => { const u = Math.min(1, (t - start) / 500); scrollTo(0, from * (1 - u)); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }));
await wait(800);

// M2c + M3 two-finger pinch 1x -> ~3x, then a one-finger pan.
const hero = await phone.page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + Math.min(r.height, innerHeight - r.top) / 2 }; });
t0 = await now();
await touch("touchStart", [[hero.x - 30, hero.y, 1], [hero.x + 30, hero.y, 2]]);
for (let i = 1; i <= 36; i++) { const half = 30 + (70 * i) / 36; await touch("touchMove", [[hero.x - half, hero.y, 1], [hero.x + half, hero.y, 2]]); await wait(16); }
await touch("touchEnd", []); t1 = await now(); await wait(700);
{
  const p = await phoneRows(t0, t1), tvr = await tvRows(t0, t1 + 600);
  res.pinchLag = lagStats(lags(p, tvr, "zoom"));
  let back = 0; for (let i = 1; i < tvr.length; i++) if (tvr[i].zoom < tvr[i - 1].zoom - 1e-6) back++;
  const fps = await tvFps(t0, t1);
  const [ps, ts] = [await phoneState(), await tvState()];
  res.pinch = { phoneZoom: +ps.inspection.zoom.toFixed(4), tvZoom: +ts.inspection.zoom.toFixed(4), tvBackwardSteps: back, tvFps: fps };
  if (ps.inspection.zoom < 2) bad.push(`pinch did not zoom the phone (${res.pinch.phoneZoom})`);
  if (Math.abs(ps.inspection.zoom - ts.inspection.zoom) > 1e-3) bad.push(`zoom not mirrored: ${res.pinch.phoneZoom} vs ${res.pinch.tvZoom}`);
  if (back) bad.push(`TV zoom stepped backwards ${back}x during a monotonic pinch (jitter leak)`);
}
t0 = await now();
await touch("touchStart", [[hero.x, hero.y]]);
for (let i = 1; i <= 24; i++) { await touch("touchMove", [[hero.x - i * 6, hero.y - i * 3]]); await wait(16); }
await touch("touchEnd", []); t1 = await now(); await wait(600);
{
  const p = await phoneRows(t0, t1), tvr = await tvRows(t0, t1 + 600);
  res.panLag = lagStats(lags(p, tvr, "fx"));
  const ms = await converge((a, b) => !a.inspection.cameraMoving && Math.hypot(a.inspection.focusX - b.inspection.focusX, a.inspection.focusY - b.inspection.focusY) < 1e-4);
  const [ps, ts] = [await phoneState(), await tvState()];
  res.pan = { phone: [ps.inspection.focusX, ps.inspection.focusY].map((v) => +v.toFixed(4)), tv: [ts.inspection.focusX, ts.inspection.focusY].map((v) => +v.toFixed(4)), sameFocusAfterCoastMs: ms };
  if (ms === null) bad.push(`focus not mirrored after the coast: ${res.pan.phone} vs ${res.pan.tv}`);
}
for (const k of ["scrollLag", "themeSwipeLag", "pinchLag", "panLag"]) {
  if (!(res[k].n >= 5)) bad.push(`${k}: too few samples (${res[k].n})`);
  else if (!(res[k].p95 <= LAG_BOUND_MS)) bad.push(`${k}: p95 ${res[k].p95} ms > ${LAG_BOUND_MS} ms`);
}

// M5 control: the same phone, same deep zoom, NOT casting (own context, nothing else open). Any tile the TV painted
// that the casting phone requested but the solo phone did not would be a request made for the receiver's view.
{
  const solo = await open("solo", `${BASE}/`, { width: 412, height: 915, deviceScaleFactor: 2.6, mobile: true }, true, soloCtx);
  await wait(2500);
  await solo.page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(6, 0.42, 0.35));
  await wait(res.deepZoomMs ? Math.min(res.deepZoomMs, 12000) : 6000);
  const soloTiles = new Set(requests.solo.filter(isTile).map(strip));
  const forTv = tvPainted.filter((u) => phoneTilesWhileCasting.has(u) && !soloTiles.has(u));
  Object.assign(res.network ?? (res.network = {}), { soloPhoneTileRequests: soloTiles.size, phoneRequestsForTvView: forTv.length });
  if (forTv.length) bad.push(`phone requested ${forTv.length} tiles for the TV's view (not requested when not casting): ${forTv.slice(0, 3).join(", ")}`);
}
const channel = (await phoneState()).cast;
{
  const log = channel.log.filter((e) => e.t >= connectedAt);
  let maxPerSecond = 0; for (let i = 0, j = 0; i < log.length; i++) { while (log[i].t - log[j].t >= 1000) j++; maxPerSecond = Math.max(maxPerSecond, i - j + 1); }
  res.channel = { messages: channel.sent, bytes: channel.bytes, maxMessageBytes: channel.maxBytes, maxPerSecond };
  if (channel.maxBytes > 220) bad.push(`a channel message was ${channel.maxBytes} B`);
  if (maxPerSecond > 31) bad.push(`${maxPerSecond} msgs in one second (cap 30)`);
}

// M6 resync: reload the TV; with the phone idle, a hello -> snapshot restores the exact state.
const beforeReload = await phoneState();
await tv.page.reload();
await tv.page.waitForFunction(() => window.__QUACKLES_CAST__?.getState().received > 0, null, { timeout: 8000 }).catch(() => {});
await wait(1500);
{
  const ts = await tvState();
  res.resync = { received: ts.cast?.received ?? 0, zoom: ts.inspection.zoom, phoneZoom: beforeReload.inspection.zoom, theme: ts.current.theme, phoneTheme: beforeReload.current.theme };
  if (!res.resync.received || Math.abs(ts.inspection.zoom - beforeReload.inspection.zoom) > 1e-3 || Math.abs(ts.current.theme - beforeReload.current.theme) > 1e-3) bad.push(`receiver reload did not resync: ${JSON.stringify(res.resync)}`);
}
res.pageErrors = errors;
if (errors.sender.length || errors.receiver.length) bad.push(`page errors: ${JSON.stringify(errors)}`);
console.log(JSON.stringify({ net: NET, lagBoundMs: LAG_BOUND_MS, ...res }, null, 1));
for (const b of browsers) await b.close();
server.kill();
if (bad.length) { console.log("FAIL\n- " + bad.join("\n- ")); process.exit(1); }
console.log("PASS cast mirror");
