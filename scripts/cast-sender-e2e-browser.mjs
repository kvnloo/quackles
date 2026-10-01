#!/usr/bin/env node
/** Cast SENDER e2e, headless, against a faithful fake of the Google Cast Web Sender SDK (scripts/cast-fake-sender-sdk.js,
 * served in place of gstatic's cast_sender.js). NOT device evidence.
 *
 * For Android Chrome (412x915 @2.6, touch) and desktop Chrome (1280x900) user agents:
 *   S1 button hidden while the SDK reports NO_DEVICES_AVAILABLE, visible on NOT_CONNECTED (placeholder App ID: never
 *      hidden for lack of one); appearing shifts no layout; the SDK is only requested after first paint
 *   S2 click -> CastContext.requestSession(); basic mode = Default Media Receiver CC1AD845
 *   S3 basic: loadMedia(current theme + story frame plate) right on connect: absolute URL under the page's base path,
 *      image/webp, PhotoMediaMetadata title; sendMessage never used; an honest "stills only" note with the docs link
 *   S4 basic: a theme swipe and a story scroll each load once, after the debounce, with the right plate; rapid theme spam
 *      loads at most once; zoom loads nothing
 *   S5 custom (?castAppId=A1B2C3D4): setOptions(A1B2C3D4), state snapshot on urn:x-cast:ai.quackles.state, never
 *      loadMedia, no basic note; a receiver that never answers surfaces an error; one that says hello does not
 *   S6 errors are visible: requestSession timeout / receiver_unavailable / session_error, loadMedia failure; cancel is silent
 *   S7 no SDK request and no button for iOS (CriOS, Safari) and Firefox UAs; an SDK load failure leaves no button and no error
 *   S8 no page errors anywhere
 *   S9 adversarial-review paths: the note never covers the hero copy (portrait + landscape) and its dismiss target is
 *      >= 24 px; a second tap while connecting opens no second picker; the TV ending the session clears the note;
 *      a hello that beats CONNECTED is not reported as silence; requestSession/loadMedia RESOLVING with an ErrorCode
 *      surface; an auto-joined (resumed) session gets the still without a tap; notices are announced via a live
 *      region that exists before they appear
 * OUT_DIR (cast build), BASE_PATH (the build's NEXT_PUBLIC_BASE_PATH), PORT, ASSETS. Run with
 *   node --import ./scripts/register-ts-resolve.mjs scripts/cast-sender-e2e-browser.mjs */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";
const { parseManifest, spanAt, THEME_IDS } = await import("../lib/sequence/manifest.ts");

const dir = path.resolve(process.env.OUT_DIR || "out"), port = process.env.PORT || "44251", BASE_PATH = process.env.BASE_PATH || "";
const ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const FAKE = fs.readFileSync(new URL("./cast-fake-sender-sdk.js", import.meta.url), "utf8");
const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
  desktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  crios: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  firefox: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
};
const DEVICE = {
  android: { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
  landscape: { viewport: { width: 915, height: 412 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 },
};
if (!fs.existsSync(path.join(dir, "cast-receiver/index.html"))) { console.error(`${dir} is not a cast build`); process.exit(2); }
// Serve the export under its base path, like Pages does (/quackles/preview/chromecast/...).
const root = fs.mkdtempSync(path.join(os.tmpdir(), "cast-e2e-"));
const mount = path.join(root, BASE_PATH);
fs.mkdirSync(path.dirname(mount), { recursive: true });
if (BASE_PATH) fs.symlinkSync(dir, mount); else fs.rmSync(root, { recursive: true });
const server = spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", BASE_PATH ? root : dir], { stdio: "ignore" });
process.on("exit", () => server.kill()); // never leave a static server behind on a crash
await new Promise((r) => setTimeout(r, 1500));
const ORIGIN = `http://127.0.0.1:${port}`, SITE = `${ORIGIN}${BASE_PATH}`;
const manifest = parseManifest(JSON.parse(fs.readFileSync(path.join(dir, "preview-scene/sequence/manifest.json"), "utf8")), `${SITE}/preview-scene/sequence/manifest.json`);
const plate = (progress, theme, reduced = false) => { const s = spanAt(manifest, progress, reduced), f = s.mix < 0.5 ? s.before : s.after; return `${SITE}/preview-scene/sequence/cinematic-proof-v2/${THEME_IDS[Math.round(theme)]}/${f.id}-1024.webp`; };

const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome-stable", headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const bad = [], res = {};
const fail = (msg) => { bad.push(msg); console.log("  FAIL", msg); };
const check = (cond, msg) => { if (!cond) fail(msg); return cond; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function open(name, { ua = "android", device = ua === "desktop" ? "desktop" : "android", query = "", init = {}, sdk = "fake" } = {}) {
  const ctx = await browser.newContext({ ...DEVICE[device], userAgent: UA[ua] });
  const sdkRequests = [], errors = [];
  await ctx.route("**/quackles-assets/**", async (route) => {
    const f = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
    if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: "" });
    await route.fulfill({ body: fs.readFileSync(f), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
  });
  await ctx.route("https://www.gstatic.com/**", async (route) => {
    sdkRequests.push({ url: route.request().url(), at: Date.now() });
    if (sdk === "fail" || !route.request().url().includes("/cv/js/sender/v1/cast_sender.js")) return route.abort();
    await route.fulfill({ body: FAKE, contentType: "text/javascript" });
  });
  // Real Chrome exposes window.chrome; headless may not. Seed the fake's devices/outcomes before any page script runs.
  await ctx.addInitScript((seed) => { window.chrome = window.chrome || {}; window.__castFakeInit = seed; }, init);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(`${SITE}/${query}`);
  const consoleLines = []; page.on("console", (m) => consoleLines.push(`${m.type()}: ${m.text()}`)); page.on("crash", () => consoleLines.push("PAGE CRASHED"));
  try { await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 30000 }); }
  catch (error) { console.log(`${name}: never painted`, errors, consoleLines.slice(-8), await page.evaluate(() => window.__QUACKLES_SEQUENCE__?.getState?.().errors).catch(() => "?")); throw error; }
  const paintedAt = Date.now();
  return { name, ctx, page, sdkRequests, errors, t0, paintedAt };
}
const fakeState = (s) => s.page.evaluate(() => ({ calls: window.__castFake?.calls ?? null, loads: window.__castFake?.loads ?? [], messages: window.__castFake?.messages ?? [], options: window.__castFake?.options ?? null }));
const button = (s) => s.page.$('[data-testid="cast-button"]');
const notice = (s) => s.page.evaluate(() => { const n = document.querySelector('[data-testid="cast-notice"]'); return n ? { kind: n.dataset.kind, text: n.textContent, href: n.querySelector("a")?.href ?? null } : null; });
const rects = (s) => s.page.evaluate(() => [".poster-frame", ".site-nav", ".hero-copy", ".scene-hud", ".sequence-player", ".theme-seg"].map((q) => { const r = document.querySelector(q)?.getBoundingClientRect(); return r ? [q, r.x, r.y, r.width, r.height].join() : q; }));
const until = async (s, fn, arg, timeout = 5000) => { try { await s.page.waitForFunction(fn, arg, { timeout }); return true; } catch { return false; } };
const close = async (s) => { if (s.errors.length) fail(`${s.name}: page errors ${s.errors.join(" | ")}`); await s.ctx.close(); };
async function connect(s) {
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  await s.page.click('[data-testid="cast-button"]');
  return until(s, () => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connected", null, 5000);
}

for (const ua of ["android", "desktop"]) {
  console.log(`[${ua}] basic mode (placeholder App ID)`);
  // S1: no devices -> hidden; devices -> visible, no layout shift.
  const s = await open(`${ua}-basic`, { ua, init: { devices: false } });
  await wait(3500);
  const fs1 = await fakeState(s);
  check(s.sdkRequests.length === 1 && s.sdkRequests[0].url.includes("cast_sender.js?loadCastFramework=1"), `${ua}: Cast SDK should be requested once (got ${s.sdkRequests.length})`);
  check(!s.sdkRequests.length || s.sdkRequests[0].at >= s.paintedAt - 50, `${ua}: SDK requested before first paint`);
  check(fs1.options?.receiverApplicationId === "CC1AD845", `${ua}: placeholder build must use the Default Media Receiver, got ${JSON.stringify(fs1.options)}`);
  check(!(await button(s)), `${ua}: button visible with NO_DEVICES_AVAILABLE`);
  const before = await rects(s);
  await s.page.evaluate(() => window.__castFake?.setDevices(true));
  const shown = await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 3000);
  check(shown, `${ua}: button not shown on NOT_CONNECTED (placeholder App ID must not hide it)`);
  if (shown) {
    const after = await rects(s);
    check(before.every((r, i) => r === after[i]), `${ua}: button shifted layout ${before.filter((r, i) => r !== after[i]).join(" | ")}`);
    const box = await (await button(s)).boundingBox();
    check(box && box.width >= 32 && box.height >= 32, `${ua}: button too small to tap (${JSON.stringify(box)})`);
    check(await s.page.evaluate(() => { const b = document.querySelector('[data-testid="cast-button"]').getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !!el?.closest('[data-testid="cast-button"]'); }), `${ua}: button is covered by another element`);
    await s.page.evaluate(() => window.__castFake?.setDevices(false));
    check(await until(s, () => !document.querySelector('[data-testid="cast-button"]'), null, 2000), `${ua}: button stayed after devices vanished`);
    await s.page.evaluate(() => window.__castFake?.setDevices(true));
    // S2 + S3
    const connected = await connect(s);
    check(connected, `${ua}: did not reach connected`);
    const fs2 = await fakeState(s);
    check(fs2.calls.some((c) => c[0] === "requestSession"), `${ua}: click did not call requestSession`);
    await wait(150);
    const loads0 = (await fakeState(s)).loads;
    const expect0 = plate(0, 2);
    check(loads0.length === 1, `${ua}: expected 1 loadMedia on connect, got ${loads0.length}`);
    if (loads0[0]) {
      const l = loads0[0];
      check(l.contentId === expect0, `${ua}: loadMedia URL ${l.contentId} != ${expect0}`);
      check(/^https?:\/\//.test(l.contentId) && l.contentId.startsWith(SITE + "/"), `${ua}: URL not absolute under the base path: ${l.contentId}`);
      check(l.contentType === "image/webp", `${ua}: contentType ${l.contentType}`);
      check(l.metadata?.metadataType === 4 && /Blue/.test(l.metadata?.title ?? ""), `${ua}: metadata ${JSON.stringify(l.metadata)}`);
      res[`${ua}ConnectLoad`] = { url: l.contentId.replace(ORIGIN, ""), contentType: l.contentType, title: l.metadata?.title, artist: l.metadata?.artist };
    }
    check((await fakeState(s)).messages.length === 0, `${ua}: basic mode used sendMessage`);
    const note = await notice(s);
    check(note?.kind === "info" && /still/i.test(note.text) && /zoom/i.test(note.text) && /CAST\.md/.test(note.href ?? ""), `${ua}: basic-mode note missing/dishonest: ${JSON.stringify(note)}`);
    res[`${ua}Note`] = note;
    // Page-side timeline of the scene the TV should show (rounded theme), every display frame.
    await s.page.evaluate(() => { const rows = window.__keys = []; let last = null; const loop = () => { const k = Math.round(window.__QUACKLES_SEQUENCE__.getState().current.theme); if (k !== last) { rows.push({ t: performance.timeOrigin + performance.now(), k }); last = k; } requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
    // S4a theme change (a real drag on the scene).
    const frame = await s.page.evaluate(() => { const r = document.querySelector(".poster-frame").getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: Math.min(r.top + r.height * 0.55, innerHeight * 0.55) }; });
    const dragStart = Date.now();
    if (ua === "android") {
      const cdp = await s.ctx.newCDPSession(s.page);
      const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y]) => ({ x, y, id: 1 })) });
      await touch("touchStart", [[frame.x, frame.y]]);
      for (let i = 1; i <= 16; i++) { await touch("touchMove", [[frame.x - i * 14, frame.y]]); await wait(16); }
      await touch("touchEnd", []);
    } else {
      await s.page.mouse.move(frame.x, frame.y); await s.page.mouse.down();
      for (let i = 1; i <= 16; i++) { await s.page.mouse.move(frame.x - i * 30, frame.y); await wait(16); }
      await s.page.mouse.up();
    }
    const dragEnd = Date.now();
    await wait(900);
    const theme = await s.page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.theme);
    const loads1 = (await fakeState(s)).loads.slice(1);
    check(Math.round(theme) !== 2, `${ua}: the drag did not change the theme (theme ${theme})`);
    check(loads1.length === 1, `${ua}: theme drag -> ${loads1.length} loadMedia (want exactly 1 after the debounce)`);
    if (loads1[0]) {
      check(loads1[0].contentId === plate(0, theme), `${ua}: theme load ${loads1[0].contentId} != ${plate(0, theme)}`);
      // Debounce: the load fires only once the scene key has been stable ~300 ms (it may be mid-drag if the drag
      // crossed into the new scene early and then stayed there).
      const keys = await s.page.evaluate(() => window.__keys);
      const lastChange = keys.filter((k) => k.t <= loads1[0].at).at(-1);
      const stableFor = loads1[0].at - lastChange.t;
      check(stableFor >= 280 && stableFor <= 650, `${ua}: theme load fired ${Math.round(stableFor)} ms after the scene last changed (debounce 300 ms)`);
      res[`${ua}ThemeLoad`] = { theme: +theme.toFixed(3), msAfterSceneSettled: Math.round(stableFor), dragMs: dragEnd - dragStart, sceneChangesDuringDrag: keys.length - 1 };
    }
    // S4b rapid theme spam under reduced motion (theme switches instantly): a new scene every 50 ms for ~650 ms ->
    // exactly one load, of the final scene, and the reduced-motion frame mapping.
    const cdpMedia = await s.ctx.newCDPSession(s.page);
    await cdpMedia.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await wait(900);
    const n0 = (await fakeState(s)).loads.length;
    await s.page.evaluate(async () => { const ids = ["day", "white", "blue", "dark", "night"]; for (let i = 0; i < 13; i++) { window.__QUACKLES_SEQUENCE__.setTheme(ids[i % ids.length]); await new Promise((r) => setTimeout(r, 50)); } window.__QUACKLES_SEQUENCE__.setTheme("night"); });
    await wait(1200);
    const spam = (await fakeState(s)).loads.slice(n0);
    const reducedProgress = await s.page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.progress);
    check(spam.length === 1 && spam[0].contentId === plate(reducedProgress, 4, true), `${ua}: theme spam -> ${spam.length} loads (${spam.map((l) => l.contentId.replace(ORIGIN, "")).join()}); want exactly the final scene`);
    res[`${ua}SpamLoads`] = spam.length;
    await cdpMedia.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "no-preference" }] });
    await wait(900);
    // S4c story scroll to 30 %.
    const n1 = (await fakeState(s)).loads.length;
    await s.page.evaluate(() => new Promise((done) => { const max = document.documentElement.scrollHeight - innerHeight, start = performance.now();
      const step = (t) => { const u = Math.min(1, (t - start) / 700); scrollTo(0, max * 0.3 * u); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }));
    await wait(1200);
    const progress = await s.page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.progress);
    const scroll = (await fakeState(s)).loads.slice(n1);
    check(scroll.length >= 1 && scroll.length <= 4, `${ua}: scroll produced ${scroll.length} loads (want a few, debounced)`);
    check(scroll.at(-1)?.contentId === plate(progress, 4), `${ua}: after scroll the TV should show ${plate(progress, 4)}, got ${scroll.at(-1)?.contentId}`);
    res[`${ua}ScrollLoads`] = { progress: +progress.toFixed(3), loads: scroll.length, last: scroll.at(-1)?.contentId.replace(ORIGIN, "") };
    // S4d zoom loads nothing (not mirrored in basic mode).
    await s.page.evaluate(() => new Promise((done) => { const from = scrollY, start = performance.now(); const step = (t) => { const u = Math.min(1, (t - start) / 400); scrollTo(0, from * (1 - u)); if (u < 1) requestAnimationFrame(step); else done(); }; requestAnimationFrame(step); }));
    await wait(900);
    const n2 = (await fakeState(s)).loads.length;
    await s.page.evaluate(() => window.__QUACKLES_INSPECTION__.setTarget(4, 0.4, 0.4));
    await wait(1500);
    check((await fakeState(s)).loads.length === n2, `${ua}: zoom triggered loadMedia (zoom is not mirrored in basic mode)`);
    // Stop casting from the button.
    await s.page.click('[data-testid="cast-button"]');
    check((await fakeState(s)).calls.some((c) => c[0] === "endCurrentSession" && c[1] === true), `${ua}: second click did not end the session`);
  }
  await close(s);
}

console.log("[android] custom mode (?castAppId=A1B2C3D4)");
{
  const s = await open("custom-silent", { query: "?castAppId=a1b2c3d4" });
  check(await connect(s), "custom: did not connect");
  await wait(400);
  let f = await fakeState(s);
  check(f.options?.receiverApplicationId === "A1B2C3D4", `custom: setOptions ${JSON.stringify(f.options)}`);
  check(f.loads.length === 0, `custom: loadMedia called ${f.loads.length}x`);
  const snap = f.messages.find((m) => m.namespace === "urn:x-cast:ai.quackles.state" && JSON.parse(m.data).f === 1);
  check(!!snap, `custom: no snapshot on the namespace (${f.messages.length} messages)`);
  check((await notice(s))?.kind !== "info", "custom: shows the basic-mode note");
  // The receiver never answers: an error must surface (wrong App ID / receiver URL / device not registered).
  const silent = await until(s, () => document.querySelector('[data-testid="cast-notice"]')?.dataset.kind === "error", null, 12000);
  check(silent, "custom: a silent receiver produced no visible error");
  res.customSilent = await notice(s);
  await close(s);
  const h = await open("custom-hello", { query: "?castAppId=A1B2C3D4" });
  check(await connect(h), "custom-hello: did not connect");
  await h.page.evaluate(() => window.__castFake?.receive("urn:x-cast:ai.quackles.state", JSON.stringify({ v: 1, k: "h", b: "receiver" })));
  await wait(10000);
  check((await notice(h))?.kind !== "error", `custom-hello: error shown although the receiver answered: ${JSON.stringify(await notice(h))}`);
  f = await fakeState(h);
  check(f.messages.filter((m) => JSON.parse(m.data).f === 1).length >= 2, "custom-hello: hello did not trigger a resync snapshot");
  check(f.loads.length === 0, "custom-hello: loadMedia used");
  await close(h);
}

console.log("[android] errors");
for (const [outcome, kind, pattern] of [["timeout", "request", /respond|time/i], ["receiver_unavailable", "request", /no cast device|not found|no tv/i], ["session_error", "request", /start|tv/i], ["cancel", "request", null], ["load_media_failed", "load", /image|picture|load/i]]) {
  const s = await open(`err-${outcome}`, { init: kind === "request" ? { requestOutcome: outcome } : { loadOutcome: outcome } });
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  await s.page.click('[data-testid="cast-button"]');
  await wait(1200);
  const n = await notice(s);
  if (pattern) check(n?.kind === "error" && pattern.test(n.text), `error ${outcome}: notice ${JSON.stringify(n)}`);
  else check(!n || n.kind !== "error", `cancel should be silent: ${JSON.stringify(n)}`);
  check(!!(await button(s)), `error ${outcome}: button disappeared`);
  res[`error_${outcome}`] = n?.text ?? null;
  await close(s);
}

console.log("[android] adversarial-review paths");
const overlaps = (s) => s.page.evaluate(() => {
  const n = document.querySelector('[data-testid="cast-notice"]')?.getBoundingClientRect();
  if (!n) return { notice: null };
  const shown = (el) => { const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05; };
  const hits = [...document.querySelectorAll(".hero-copy h1, .hero-kicker, .hero-label, .hero-note, .site-nav, .theme-seg, .interaction-hint")].filter(shown).map((el) => [el.className || el.tagName, el.getBoundingClientRect()])
    .filter(([, r]) => r.width && r.height && n.left < r.right && n.right > r.left && n.top < r.bottom && n.bottom > r.top).map(([name]) => name);
  const d = document.querySelector('[data-testid="cast-notice"] button')?.getBoundingClientRect();
  return { notice: [n.left, n.top, n.width, n.height].map(Math.round), hits, dismiss: d ? [Math.round(d.width), Math.round(d.height)] : null };
});
for (const device of ["android", "landscape"]) {
  const s = await open(`note-${device}`, { device });
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  const live0 = await s.page.evaluate(() => document.querySelectorAll('[data-testid="cast-live"][role="status"]').length);
  check(await connect(s), `note-${device}: did not connect`);
  await wait(300);
  const o = await overlaps(s);
  res[`note_${device}`] = o;
  if (process.env.SHOTS) await s.page.screenshot({ path: path.join(process.env.SHOTS, `cast-note-${device}.png`) });
  check(o.notice && o.hits.length === 0, `note-${device}: the note covers ${o.hits?.join(", ")} at ${o.notice}`);
  check(o.dismiss && o.dismiss[0] >= 24 && o.dismiss[1] >= 24, `note-${device}: dismiss target ${o.dismiss}`);
  check(live0 === 1 && /still/i.test(await s.page.textContent('[data-testid="cast-live"]')), `note-${device}: no persistent live region announcing the note (before: ${live0})`);
  if (device === "android") {
    await s.page.evaluate(() => window.__castFake?.endFromReceiver());
    await wait(500);
    check(!(await notice(s)), "tv-ended: the basic note outlived the session");
    check((await s.page.getAttribute('[data-testid="cast-button"]', "data-state")) === "idle", "tv-ended: button not back to idle");
  }
  await close(s);
}
{
  const s = await open("double-tap");
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  await s.page.click('[data-testid="cast-button"]');
  await until(s, () => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connecting", null, 2000);
  // Click in the same task as the state check, so it cannot land after CONNECTED.
  const stateAtClick = await s.page.evaluate(() => { const b = document.querySelector('[data-testid="cast-button"]'); const at = b.dataset.state; b.click(); return at; });
  await wait(800);
  const f = await fakeState(s);
  const calls = f.calls.filter((c) => c[0] === "requestSession").length;
  check(stateAtClick === "connecting", `double-tap: second click landed in state ${stateAtClick}, test is vacuous`);
  check(calls === 1 && !f.calls.some((c) => c[0] === "endCurrentSession"), `double-tap: ${JSON.stringify(f.calls)}`);
  check((await notice(s))?.kind !== "error", `double-tap: error shown ${JSON.stringify(await notice(s))}`);
  await close(s);
}
{
  const s = await open("hello-race", { query: "?castAppId=A1B2C3D4", init: { helloOnStart: "urn:x-cast:ai.quackles.state" } });
  check(await connect(s), "hello-race: did not connect");
  await wait(10000);
  check((await notice(s))?.kind !== "error", `hello-race: a receiver that answered was reported silent: ${JSON.stringify(await notice(s))}`);
  await close(s);
}
{
  // Stop while a theme change is still inside the debounce: the pending load must not fire into the ending session.
  const s = await open("stop-in-debounce");
  check(await connect(s), "stop-in-debounce: did not connect");
  await wait(400);
  const n0 = (await fakeState(s)).loads.length;
  await s.page.evaluate(() => window.__QUACKLES_SEQUENCE__.setTheme("night"));
  await wait(60);
  await s.page.click('[data-testid="cast-button"]');
  await wait(1200);
  check((await fakeState(s)).loads.length === n0, "stop-in-debounce: loadMedia fired after Stop");
  check((await notice(s))?.kind !== "error", `stop-in-debounce: false error ${JSON.stringify(await notice(s))}`);
  // Second session in the same page: the basic note was already shown once this browser session.
  check(await connect(s), "reconnect: did not connect");
  await wait(400);
  check(!(await notice(s)), `reconnect: basic note shown again ${JSON.stringify(await notice(s))}`);
  await close(s);
}
{
  const s = await open("timeout-then-connects", { query: "?castAppId=A1B2C3D4", init: { requestOutcome: "timeout-then-connects" } }); // custom: no basic note to mask the error
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  await s.page.click('[data-testid="cast-button"]');
  const ok = await until(s, () => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connected", null, 3000);
  await wait(300);
  check(ok && (await notice(s))?.kind !== "error", `timeout-then-connects: a working session shows ${JSON.stringify(await notice(s))}`);
  await close(s);
}
{
  const s = await open("late-hello", { query: "?castAppId=A1B2C3D4" });
  check(await connect(s), "late-hello: did not connect");
  check(await until(s, () => document.querySelector('[data-testid="cast-notice"]')?.dataset.kind === "error", null, 12000), "late-hello: no silence error first");
  await s.page.evaluate(() => window.__castFake?.receive("urn:x-cast:ai.quackles.state", JSON.stringify({ v: 1, k: "h", b: "receiver" })));
  await wait(300);
  check(!(await notice(s)), `late-hello: silence error stayed after the receiver answered ${JSON.stringify(await notice(s))}`);
  await close(s);
}
for (const hello of [true, false]) {
  const s = await open(`custom-resume-${hello ? "hello" : "silent"}`, { query: "?castAppId=A1B2C3D4", init: { resume: true, ...(hello ? { helloOnResume: "urn:x-cast:ai.quackles.state" } : {}) } });
  const ok = await until(s, () => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connected", null, 8000);
  await wait(9500);
  const f = await fakeState(s), n = await notice(s);
  check(ok && f.messages.some((m) => JSON.parse(m.data).f === 1) && f.loads.length === 0, `custom-resume: no snapshot / used loadMedia (${f.messages.length} msgs, ${f.loads.length} loads)`);
  if (hello) check(n?.kind !== "error", `custom-resume-hello: false silence error ${JSON.stringify(n)}`);
  else check(n?.kind === "error", "custom-resume-silent: a silent resumed receiver produced no error");
  await close(s);
}
for (const [name, init, pattern] of [["request-resolves-code", { requestOutcome: "resolve:timeout" }, /respond|time/i], ["load-resolves-code", { loadOutcome: "resolve:load_media_failed" }, /picture|image|load/i]]) {
  const s = await open(name, { init });
  await until(s, () => !!document.querySelector('[data-testid="cast-button"]'), null, 8000);
  await s.page.click('[data-testid="cast-button"]');
  await wait(1200);
  const n = await notice(s);
  check(n?.kind === "error" && pattern.test(n.text), `${name}: ${JSON.stringify(n)}`);
  await close(s);
}
{
  const s = await open("resume", { init: { resume: true } });
  const ok = await until(s, () => document.querySelector('[data-testid="cast-button"]')?.dataset.state === "connected", null, 8000);
  await wait(500);
  const f = await fakeState(s);
  check(ok && !f.calls.some((c) => c[0] === "requestSession"), `resume: not auto-joined (${JSON.stringify(f.calls)})`);
  check(f.loads.length === 1 && f.loads[0].contentId === plate(0, 2), `resume: still not re-loaded on auto-join (${f.loads.length})`);
  await close(s);
}

console.log("[gates] iOS / Firefox / SDK failure");
for (const ua of ["crios", "safari", "firefox"]) {
  const s = await open(`gate-${ua}`, { ua, device: "android" });
  await wait(3500);
  check(s.sdkRequests.length === 0, `${ua}: Cast SDK requested`);
  check(!(await button(s)), `${ua}: button shown`);
  await close(s);
}
{
  const s = await open("sdk-fail", { sdk: "fail" });
  await wait(3500);
  check(s.sdkRequests.length >= 1, "sdk-fail: SDK not even requested");
  check(!(await button(s)), "sdk-fail: button shown without an SDK");
  check(!(await notice(s)), "sdk-fail: a notice appeared without a button to explain it");
  await close(s);
}

await browser.close(); server.kill();
if (BASE_PATH) fs.rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify(res, null, 1));
if (bad.length) { console.log(`FAIL (${bad.length})\n- ` + bad.join("\n- ")); process.exit(1); }
console.log("PASS cast sender e2e");
