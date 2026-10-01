#!/usr/bin/env node
/** Touch FEEL contracts on a phone viewport (412x915, DPR 2.6, isMobile, hasTouch; phone perf profile, no faked deviceMemory).
 *  Input is CDP Input.dispatchTouchEvent (Chromium emulation, NOT physical-device evidence).
 *  Measured DURING the gesture, every animation frame, from the camera transform actually on screen:
 *  F1 pinch = direct manipulation: the world point under the pinch midpoint at pinch start stays under the midpoint (<= 2 CSS px), from 1x and while zoomed.
 *  F2 the owner's repro: repeated quick pans at different start points (each starting while the last one still coasts):
 *     the world point under the finger stays under it (<= 2 px) and no frame moves the camera beyond the finger delta (<= 2 px).
 *  F3 1->2->1 finger handoff: pan, add a finger and pinch, lift the first finger and keep panning: no jump at either handoff (<= 2 px).
 *  F4 vertical pan while zoomed: 0 pointercancel (the browser must not steal it), and the camera tracks the finger.
 *  F5 4x CPU throttle: frame-time p95 during a one-finger pan (reported).
 *  Z1 zoom "none" previews (lib/preview.ts): a pinch must NOT open inspection and the page raises no errors; F1-F5 (zoomed
 *     manipulation) do not apply there and F6 still runs.
 *  F7 zoom lag: phone profile decodes at most 2 at once, no decode STARTS while the camera moves, and the sharp layer is
 *     resampled at "high" once the camera rests (motion paints use "low").
 *  The world anchor is re-taken, from the transform visible just before the app sees the event, every time the finger count changes.
 * OUT_DIR(+BASE_PATH), PORT. Tiles from the local clone. */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "44210", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" }); await new Promise((r) => setTimeout(r, 1500));
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox"] });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
const pageErrors = []; page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e).slice(0, 200)));
await page.route("**/quackles-assets/**", async (route) => { const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, "")); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" }); await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } }); });
await page.goto(`http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`); await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0); await page.waitForTimeout(2200);
const profile = await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().profile?.id ?? null);
const frameBox = await page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
const cx = Math.round(frameBox.x + frameBox.w / 2), cy = Math.round(frameBox.y + Math.min(frameBox.h, 915 - frameBox.y) / 2);

// In-page tracker: window capture listeners run before the app's handlers, so an anchor taken there uses the camera the user SEES.
await page.evaluate(() => {
  const frame = document.querySelector(".poster-frame"), camera = document.querySelector(".sequence-camera");
  const pts = new Map(); const T = window.__feel = { cancels: 0, anchor: null, phase: "idle", rows: [], stop: false, n: 0 };
  const view = () => { const t = getComputedStyle(camera).transform; const m = t && t !== "none" ? new DOMMatrixReadOnly(t) : new DOMMatrixReadOnly(); const r = frame.getBoundingClientRect(); return { z: m.a, tx: r.left + m.e, ty: r.top + m.f }; };
  const centroid = () => { let x = 0, y = 0; for (const p of pts.values()) { x += p.x; y += p.y; } return { x: x / pts.size, y: y / pts.size }; };
  const reanchor = () => { T.n = pts.size; if (!pts.size) { T.anchor = null; return; } const v = view(), c = centroid(); T.anchor = { wx: (c.x - v.tx) / v.z, wy: (c.y - v.ty) / v.z }; };
  const touch = (e) => e.pointerType === "touch";
  addEventListener("pointerdown", (e) => { if (!touch(e)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); reanchor(); }, { capture: true });
  addEventListener("pointermove", (e) => { if (!touch(e)) return; const p = pts.get(e.pointerId); if (p) { p.x = e.clientX; p.y = e.clientY; } }, { capture: true });
  const up = (e) => { if (!touch(e)) return; if (e.type === "pointercancel") T.cancels++; pts.delete(e.pointerId); reanchor(); };
  addEventListener("pointerup", up, { capture: true }); addEventListener("pointercancel", up, { capture: true });
  const loop = (t) => { if (T.stop) return; const v = view(); const row = { t, phase: T.phase, n: pts.size, z: v.z, tx: v.tx, ty: v.ty, err: null, fx: null, fy: null };
    if (pts.size && T.anchor) { const c = centroid(); row.fx = c.x; row.fy = c.y; row.err = Math.hypot(v.tx + v.z * T.anchor.wx - c.x, v.ty + v.z * T.anchor.wy - c.y); }
    T.rows.push(row); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
});
const phase = (p) => page.evaluate((x) => { window.__feel.phase = x; }, p);
const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id: id ?? 1 })) });
const wait = (ms) => page.waitForTimeout(ms);
const st = () => page.evaluate(() => { const c = window.__QUACKLES_SEQUENCE__.getState().inspection; return { zoom: c.zoom, target: c.targetZoom, moving: c.cameraMoving }; });
const settle = async (ms = 6000) => { const t0 = Date.now(); let calm = 0; while (Date.now() - t0 < ms) { const s = await st(); calm = !s.moving && Math.abs(s.zoom - s.target) < 1e-3 ? calm + 1 : 0; if (calm >= 6) return; await wait(80); } };
const rows = async (p) => (await page.evaluate(() => window.__feel.rows)).filter((r) => r.phase === p);
const maxErr = (rs, n) => rs.filter((r) => r.err !== null && (n === undefined || r.n === n)).reduce((m, r) => Math.max(m, r.err), 0);
// Frames where a finger was down at both samples: how far the camera moved beyond the finger (content should move exactly with it).
const maxJump = (rs) => { let m = 0; for (let i = 1; i < rs.length; i++) { const a = rs[i - 1], b = rs[i]; if (!a.n || !b.n || a.n !== b.n || Math.abs(a.z - b.z) > 1e-6) continue; m = Math.max(m, Math.hypot((b.tx - a.tx) - (b.fx - a.fx), (b.ty - a.ty) - (b.fy - a.fy))); } return m; };
const r2 = (v) => +v.toFixed(2);
const res = { profile, viewport: "412x915@2.6", frame: frameBox }, bad = [];
if (profile !== "balanced") bad.push(`expected the phone (balanced) perf profile, got ${profile}`);

// Owner spec (lib/preview.ts): story previews must scroll at 1x; a no-story preview (single still) must NOT scroll.
const previewSrc = fs.readFileSync(new URL("../lib/preview.ts", import.meta.url), "utf8");
const previewKey = previewSrc.match(/export const PREVIEW: Preview = PREVIEWS\[["']?([\w-]+)["']?\]/)?.[1] ?? "production";
const hasStory = !new RegExp(`["']?${previewKey}["']?\\s*:\\s*\\{[^}]*story:\\s*false`).test(previewSrc);
const previewZoom = previewSrc.match(new RegExp(`["']?${previewKey}["']?\\s*:\\s*\\{[^}]*zoom:\\s*["']([\\w-]+)["']`))?.[1] ?? "policy";
const noZoom = previewZoom === "none";
res.preview = { key: previewKey, story: hasStory, zoom: previewZoom };

if (noZoom) {
  // Z1 (zoom "none"): this preview has no deep zoom. A pinch from 1x — straight, and with a vertical midpoint drift —
  // must NOT open inspection (zoom, target, data-inspecting, sharp layer, decodes) and must raise no page errors.
  const before = await page.evaluate(() => { const c = window.__QUACKLES_SEQUENCE__.getState().cache; return c.startedDecodes ?? c.completedDecodes; });
  await phase("pinchNoZoom"); const mx = cx - 50, my = cy + 40;
  await touch("touchStart", [[mx - 30, my, 1], [mx + 30, my, 2]]);
  for (let i = 1; i <= 24; i++) { const half = 30 + (70 * i) / 24; await touch("touchMove", [[mx - half, my, 1], [mx + half, my, 2]]); await wait(16); }
  await wait(120); await touch("touchEnd", []);
  await touch("touchStart", [[mx - 40, my, 1]]); await wait(40);
  await touch("touchStart", [[mx - 40, my, 1], [mx + 40, my, 2]]);
  for (let i = 1; i <= 20; i++) { const half = 40 + 3 * i; await touch("touchMove", [[mx - half, my - i * 4, 1], [mx + half, my - i * 4, 2]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await settle(); await wait(300);
  const pz = await rows("pinchNoZoom");
  const after = await page.evaluate(() => { const s = window.__QUACKLES_SEQUENCE__.getState(), c = s.cache, f = document.querySelector(".poster-frame");
    return { zoom: s.inspection.zoom, target: s.inspection.targetZoom, inspecting: f.dataset.inspecting ?? null, detailWidth: s.detailWidth, decodes: c.startedDecodes ?? c.completedDecodes }; });
  res.pinchNoZoom = { frames: pz.filter((r) => r.n === 2).length, maxCameraZoom: r2(pz.reduce((m, r) => Math.max(m, r.z), 0)), zoom: r2(after.zoom), target: r2(after.target), inspecting: after.inspecting, detailWidth: after.detailWidth, decodesStarted: after.decodes - before };
  if (!res.pinchNoZoom.frames) bad.push("no-zoom pinch: no two-finger frames observed (gesture not delivered)");
  if (res.pinchNoZoom.maxCameraZoom > 1.001 || after.zoom > 1.001 || after.target > 1.001) bad.push(`zoom "none" preview: a pinch opened inspection (camera ${res.pinchNoZoom.maxCameraZoom}x, zoom ${res.pinchNoZoom.zoom}, target ${res.pinchNoZoom.target})`);
  if (after.inspecting === "true") bad.push('zoom "none" preview: a pinch set data-inspecting="true"');
  if (after.detailWidth) bad.push(`zoom "none" preview: a sharp layer appeared after a pinch (detailWidth ${after.detailWidth})`);
  if (res.pinchNoZoom.decodesStarted) bad.push(`zoom "none" preview: a pinch started ${res.pinchNoZoom.decodesStarted} decodes`);
  // F1-F4 and F5 measure zoomed manipulation, which a no-zoom preview does not have: Z1 replaces them (F6 still runs).
  res.zoomedChecks = "not applicable: preview zoom is none (Z1 asserts the pinch does not open inspection)";
} else {
  // F1a pinch out from 1x around an off-centre midpoint (midpoint fixed: at 1x there is no slack to pan).
  await phase("pinch1x"); const mx = cx - 50, my = cy + 40;
  await touch("touchStart", [[mx - 30, my, 1], [mx + 30, my, 2]]);
  const decodes = () => page.evaluate(() => { const c = window.__QUACKLES_SEQUENCE__.getState().cache; return c.startedDecodes ?? c.completedDecodes; });
  let dec0 = 0;
  for (let i = 1; i <= 24; i++) { const half = 30 + (70 * i) / 24; await touch("touchMove", [[mx - half, my, 1], [mx + half, my, 2]]); if (i === 3) dec0 = await decodes(); await wait(16); }
  const decodesWhilePinching = (await decodes()) - dec0;
  await wait(120); await touch("touchEnd", []); await phase("idle"); await settle();
  const p1 = await rows("pinch1x"); res.pinch1x = { maxErrPx: r2(maxErr(p1, 2)), frames: p1.filter((r) => r.n === 2).length, zoom: r2((await st()).zoom) };
  // F1b pinch while zoomed, midpoint drifting diagonally (touch-action must not steal the vertical part).
  await phase("pinchZoomed"); const nx = cx + 20, ny = cy - 20;
  await touch("touchStart", [[nx - 60, ny, 1], [nx + 60, ny, 2]]);
  for (let i = 1; i <= 24; i++) { const half = 60 + (30 * i) / 24, dx = i, dy = i * 1.5; await touch("touchMove", [[nx - half + dx, ny + dy, 1], [nx + half + dx, ny + dy, 2]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await settle();
  const p2 = await rows("pinchZoomed"); res.pinchZoomed = { maxErrPx: r2(maxErr(p2, 2)), frames: p2.filter((r) => r.n === 2).length, zoom: r2((await st()).zoom) };
  const cacheStats = await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().cache);
  res.zoomLag = { maxActiveJobs: cacheStats.maxActiveJobs, decodesStartedWhilePinching: decodesWhilePinching, smoothingAtRest: await page.evaluate(() => document.querySelector(".sequence-detail")?.dataset.smoothing ?? null), detailWidth: await page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().detailWidth) };
  if (res.zoomLag.maxActiveJobs !== 2) bad.push(`phone profile decodes ${res.zoomLag.maxActiveJobs} at once (want 2)`);
  if (res.zoomLag.decodesStartedWhilePinching) bad.push(`${res.zoomLag.decodesStartedWhilePinching} decodes started while the camera moved`);
  if (res.zoomLag.smoothingAtRest !== "high") bad.push(`sharp layer at rest resampled at ${res.zoomLag.smoothingAtRest} (want high)`);
  if (!res.zoomLag.detailWidth) bad.push("no sharp layer after the pinch settled");
  for (const k of ["pinch1x", "pinchZoomed"]) if (!(res[k].maxErrPx <= 2) || !res[k].frames) bad.push(`${k}: finger-to-camera error ${res[k].maxErrPx}px > 2px while pinching`);
  if (res.pinch1x.zoom < 2) bad.push(`pinch did not zoom in (zoom ${res.pinch1x.zoom})`);

  // F2 owner repro: quick pans, each from a different start point, each starting while the previous flick still coasts.
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(3, 0.5, 0.5)); await settle();
  await phase("pans"); const starts = [[0, 0], [60, -80], [-70, 50], [40, 110], [-50, -120], [80, 30], [-20, -40]];
  for (let k = 0; k < starts.length; k++) {
    const [ox, oy] = starts[k], dir = k % 2 ? -1 : 1, x0 = cx + ox, y0 = cy + oy;
    await touch("touchStart", [[x0, y0]]);
    for (let i = 1; i <= 6; i++) { await touch("touchMove", [[x0 + dir * i * 11, y0 + dir * i * 5]]); await wait(14); }
    await touch("touchEnd", []); await wait(45);
  }
  await phase("idle"); await settle();
  const pr = await rows("pans"); res.repeatedPans = { maxErrPx: r2(maxErr(pr, 1)), maxJumpBeyondFingerPx: r2(maxJump(pr)), frames: pr.filter((r) => r.n).length };
  if (!(res.repeatedPans.maxErrPx <= 2)) bad.push(`repeated pans: finger-to-camera error ${res.repeatedPans.maxErrPx}px > 2px (camera teleports)`);
  if (!(res.repeatedPans.maxJumpBeyondFingerPx <= 2)) bad.push(`repeated pans: a frame moved the camera ${res.repeatedPans.maxJumpBeyondFingerPx}px beyond the finger`);

  // F3 1 -> 2 -> 1 finger handoff.
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(3, 0.5, 0.5)); await settle();
  await phase("handoff"); const hx = cx - 40, hy = cy;
  await touch("touchStart", [[hx, hy, 1]]);
  for (let i = 1; i <= 6; i++) { await touch("touchMove", [[hx + i * 5, hy + i * 3, 1]]); await wait(16); }
  const f1 = [hx + 30, hy + 18], f2 = [hx + 120, hy + 18];
  await touch("touchStart", [[...f1, 1], [...f2, 2]]); await wait(32);
  for (let i = 1; i <= 8; i++) { await touch("touchMove", [[f1[0] - i * 3, f1[1] + i * 2, 1], [f2[0] + i * 3, f2[1] + i * 2, 2]]); await wait(16); }
  const g2 = [f2[0] + 24, f2[1] + 16];
  await touch("touchEnd", [[f1[0] - 24, f1[1] + 16, 1]]); await wait(32); // CDP touchEnd lists the RELEASED point
  for (let i = 1; i <= 8; i++) { await touch("touchMove", [[g2[0] - i * 6, g2[1] - i * 4, 2]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await settle();
  const hr = await rows("handoff"); res.handoff = { maxErrPx: r2(maxErr(hr)), oneFinger: r2(maxErr(hr, 1)), twoFinger: r2(maxErr(hr, 2)), frames: hr.filter((r) => r.n).length, fingers: hr.map((r) => r.n).filter((n, i, a) => i === 0 || n !== a[i - 1]).join("") };
  if (res.handoff.fingers.replace(/^0+|0+$/g, "") !== "121") bad.push(`handoff did not run 1->2->1 (finger counts ${res.handoff.fingers})`);
  if (!(res.handoff.maxErrPx <= 2)) bad.push(`1->2->1 handoff: camera jumped ${res.handoff.maxErrPx}px off the finger(s)`);

  // F4 vertical pan while zoomed: the browser must not take it (pointercancel) and the camera must track.
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(3, 0.5, 0.5)); await settle();
  const c0 = await page.evaluate(() => window.__feel.cancels); const scroll0 = await page.evaluate(() => scrollY);
  await phase("vertical"); await touch("touchStart", [[cx, cy + 120]]);
  for (let i = 1; i <= 12; i++) { await touch("touchMove", [[cx, cy + 120 - i * 16]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await settle();
  const vr = await rows("vertical");
  res.verticalPan = { pointercancel: (await page.evaluate(() => window.__feel.cancels)) - c0, maxErrPx: r2(maxErr(vr, 1)), scrollYDelta: (await page.evaluate(() => scrollY)) - scroll0, touchAction: await page.evaluate(() => getComputedStyle(document.querySelector(".poster-frame")).touchAction) };
  if (res.verticalPan.pointercancel) bad.push(`vertical pan while zoomed fired ${res.verticalPan.pointercancel} pointercancel`);
  if (!(res.verticalPan.maxErrPx <= 2)) bad.push(`vertical pan while zoomed: camera ${res.verticalPan.maxErrPx}px off the finger`);

  // F4a touch-action follows data-inspecting (set before the next gesture), including just above 1x.
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1.012, 0.5, 0.5)); await settle();
  res.touchActionNear1x = await page.evaluate(() => { const f = document.querySelector(".poster-frame"); return { inspecting: f.dataset.inspecting, touchAction: getComputedStyle(f).touchAction }; });
  if (res.touchActionNear1x.inspecting === "true" && res.touchActionNear1x.touchAction !== "none") bad.push(`inspecting hero keeps touch-action ${res.touchActionNear1x.touchAction} (want none)`);
  // F4b a pinch that starts at 1x (touch-action is still pan-y when the first finger lands) with a vertical midpoint drift:
  // once two fingers are down the page must not take the gesture.
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await settle(); await wait(300);
  const c1 = await page.evaluate(() => window.__feel.cancels);
  await phase("pinch1xDrift"); const dx0 = cx, dy0 = cy + 60;
  await touch("touchStart", [[dx0 - 40, dy0, 1]]); await wait(40); // real fingers land one after the other
  await touch("touchStart", [[dx0 - 40, dy0, 1], [dx0 + 40, dy0, 2]]);
  for (let i = 1; i <= 20; i++) { const half = 40 + 3 * i; await touch("touchMove", [[dx0 - half, dy0 - i * 4, 1], [dx0 + half, dy0 - i * 4, 2]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await settle();
  const dr = await rows("pinch1xDrift");
  res.pinch1xDrift = { pointercancel: (await page.evaluate(() => window.__feel.cancels)) - c1, zoom: r2((await st()).zoom), maxErrPx: r2(maxErr(dr.filter((r) => r.z > 1.001), 2)) };
  if (!(res.pinch1xDrift.maxErrPx <= 2)) bad.push(`pinch from 1x with drift: finger-to-camera error ${res.pinch1xDrift.maxErrPx}px`);
  if (res.pinch1xDrift.pointercancel) bad.push(`pinch from 1x with vertical drift fired ${res.pinch1xDrift.pointercancel} pointercancel`);
}
// F6 guard: at 1x a one-finger vertical swipe still belongs to the page (native scroll).
await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(1, 0.5, 0.5)); await settle(); await page.evaluate(() => scrollTo(0, 0)); await wait(400);
const s1 = await page.evaluate(() => ({ y: scrollY, p: window.__QUACKLES_SEQUENCE__.getState().current.progress ?? null, c: window.__feel.cancels }));
await phase("scroll1x"); await touch("touchStart", [[cx, cy + 200]]);
for (let i = 1; i <= 12; i++) { await touch("touchMove", [[cx, cy + 200 - i * 20]]); await wait(16); }
await touch("touchEnd", []); await phase("idle"); await wait(600);
const s2 = await page.evaluate(() => ({ y: scrollY, p: window.__QUACKLES_SEQUENCE__.getState().current.progress ?? null, c: window.__feel.cancels }));
res.scroll1x = { scrollYDelta: s2.y - s1.y, pointercancel: s2.c - s1.c, touchAction: await page.evaluate(() => getComputedStyle(document.querySelector(".poster-frame")).touchAction) };
res.scroll1x.expectStory = hasStory;
if (hasStory && !(res.scroll1x.scrollYDelta > 20)) bad.push(`1x vertical swipe no longer scrolls the page (scrollY +${res.scroll1x.scrollYDelta})`);
if (!hasStory && Math.abs(res.scroll1x.scrollYDelta) > 2) bad.push(`no-story preview scrolled on a 1x vertical swipe (scrollY +${res.scroll1x.scrollYDelta})`);
await page.evaluate(() => scrollTo(0, 0)); await wait(800);

if (!noZoom) {
  // F5 frame time during a one-finger pan at 4x CPU throttle (report p95).
  await page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(3, 0.5, 0.5)); await settle();
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await phase("throttled"); await touch("touchStart", [[cx - 60, cy]]);
  for (let i = 1; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; await touch("touchMove", [[cx - 60 + Math.sin(a) * 90, cy + Math.sin(a * 2) * 60]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await wait(400);
  await phase("throttledPinch"); await touch("touchStart", [[cx - 60, cy, 1], [cx + 60, cy, 2]]);
  for (let i = 1; i <= 40; i++) { const half = 60 + Math.sin((i / 40) * Math.PI) * 50; await touch("touchMove", [[cx - half, cy + i, 1], [cx + half, cy + i, 2]]); await wait(16); }
  await touch("touchEnd", []); await phase("idle"); await wait(400);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
  const tr = (await rows("throttled")).filter((r) => r.n); const dts = tr.slice(1).map((r, i) => r.t - tr[i].t).sort((a, b) => a - b);
  const pct = (q) => dts.length ? r2(dts[Math.min(dts.length - 1, Math.floor(q * dts.length))]) : null;
  res.throttled4x = { frames: dts.length, p50ms: pct(0.5), p95ms: pct(0.95), maxMs: dts.length ? r2(dts[dts.length - 1]) : null, maxErrPx: r2(maxErr(tr, 1)) };
  const tp = (await rows("throttledPinch")).filter((r) => r.n === 2); const pd = tp.slice(1).map((r, i) => r.t - tp[i].t).sort((a, b) => a - b);
  res.throttled4xPinch = { frames: pd.length, p50ms: pd.length ? r2(pd[Math.floor(0.5 * pd.length)]) : null, p95ms: pd.length ? r2(pd[Math.min(pd.length - 1, Math.floor(0.95 * pd.length))]) : null, maxErrPx: r2(maxErr(tp, 2)) };

}

await page.evaluate(() => { window.__feel.stop = true; });
res.pageErrors = pageErrors;
if (noZoom && pageErrors.length) bad.push(`zoom "none" preview: ${pageErrors.length} page error(s): ${pageErrors[0]}`);
console.log(JSON.stringify(res)); await ctx.close(); await browser.close(); server.kill();
if (bad.length) { console.error("FAIL", bad); process.exit(1); }
