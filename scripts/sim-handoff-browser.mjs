#!/usr/bin/env node
/** ?sim=1 live simulator hand-off acceptance (desktop headless Chromium, software GL: fps only indicative).
 * Asserts: nothing 3D/sim before p=0.78; runtime prefetch only from p=0.92; sustained down-intent at the end enters
 * SWAP -> REASSEMBLE -> SIM; seed joint error < 1e-6 and no world jump; the official policy moves the joints; trunk
 * settles < 2 mm; ArrowUp walks > 2 cm; physics runs in a Worker at 50 Hz (zero main-thread steps, one render-loop
 * owner); hidden tab pauses; Esc / Back / wheel-up exit, reverse to the p1000000 plate and resume the story; re-entry
 * reseeds within 1 mm; listeners/workers back to baseline; 6 cycles grow the heap < 10 %; reload works.
 * OUT_DIR (+BASE_PATH) or TARGET_URL; PORT; ASSETS (local tile clone); SHOTS (optional screenshot dir). */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { chromium } from "playwright-core";

const dir = process.env.OUT_DIR || "out", port = process.env.PORT || "49410", ASSETS = process.env.ASSETS || "/mnt/zer0models/quackles-1gp/assets-repo";
const SHOTS = process.env.SHOTS || "";
const server = process.env.TARGET_URL ? null : spawn("node", ["scripts/static-server.mjs", "--port", port, "--directory", dir], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, server ? 1500 : 0));
const origin = process.env.TARGET_URL || `http://127.0.0.1:${port}${process.env.BASE_PATH || ""}/`;
const url = new URL("?sim=1", origin).href;
const browser = await chromium.launch({
  executablePath: "/usr/bin/google-chrome-stable", headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--js-flags=--expose-gc", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => {
  // Listener / worker / rAF bookkeeping, installed before any page script.
  const live = new Map();
  const key = (target, type, fn, opts) => `${target === window ? "w" : target === document ? "d" : "o"}|${type}|${typeof opts === "boolean" ? opts : !!opts?.capture}`;
  const ids = new WeakMap(); let nextId = 1;
  const id = (fn) => { if (!ids.has(fn)) ids.set(fn, nextId++); return ids.get(fn); };
  for (const target of [window, document]) {
    const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
    target.addEventListener = (type, fn, opts) => { if (fn) live.set(`${key(target, type, fn, opts)}|${id(fn)}`, 1); return add(type, fn, opts); };
    target.removeEventListener = (type, fn, opts) => { if (fn) live.delete(`${key(target, type, fn, opts)}|${id(fn)}`); return remove(type, fn, opts); };
  }
  const NativeWorker = window.Worker; const workers = { created: 0, terminated: 0 };
  window.Worker = class extends NativeWorker {
    constructor(...args) { super(...args); workers.created++; }
    terminate() { workers.terminated++; return super.terminate(); }
  };
  let rafCalls = 0; const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (fn) => { rafCalls++; return raf(fn); };
  window.__probe = { listeners: () => live.size, listenerKeys: () => [...live.keys()], workers, rafCalls: () => rafCalls };
});
const page = await ctx.newPage();
await page.route("**/quackles-assets/**", async (route) => {
  const file = path.join(ASSETS, new URL(route.request().url()).pathname.replace(/^\/quackles-assets\//, ""));
  if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: "" });
  await route.fulfill({ body: fs.readFileSync(file), contentType: "image/webp", headers: { "access-control-allow-origin": "*" } });
});
const reqs = []; const errors = [];
page.on("request", (r) => reqs.push({ u: new URL(r.url()).pathname, t: Date.now() }));
page.on("pageerror", (e) => errors.push(e.message.slice(0, 240)));
const cdp = await ctx.newCDPSession(page); await cdp.send("Performance.enable");
const heapMB = async () => { await page.evaluate(() => window.gc?.()); await page.waitForTimeout(200); await page.evaluate(() => window.gc?.()); return (await cdp.send("Performance.getMetrics")).metrics.find((m) => m.name === "JSHeapUsedSize").value / 1048576; };
const sim = () => page.evaluate(() => window.__QUACKLES_SIM__?.getState?.() ?? null);
const waitPhase = (phase, timeout = 60000) => page.waitForFunction((p) => window.__QUACKLES_SIM__?.getState?.().phase === p, phase, { timeout });
const setProgress = (p) => page.evaluate((v) => window.__QUACKLES_SEQUENCE__.setProgress(v), p);
const progress = () => page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState().current.progress);
const THREE_D = /\/robot\/|\.glb|\.hdr|kinematics|studio-set|robot-surface/;
const SIM = /\/sim\//;
const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.locator(".poster-frame").screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const R = { url }; const fail = [];
const check = (ok, message) => { if (!ok) fail.push(message); };
const wheelDown = async (n = 3, dy = 120) => { for (let i = 0; i < n; i++) { await page.mouse.wheel(0, dy); await page.waitForTimeout(40); } };
// Scroll to the end like a user, in spaced 250 px steps (each below the sustained-intent threshold, gaps longer
// than the intent window) so arriving at the end does not itself enter the simulator.
const toEnd = async () => {
  for (let i = 0; i < 40 && (await progress()) < 0.999; i++) { await page.mouse.wheel(0, 250); await page.waitForTimeout(520); }
  await page.waitForTimeout(600);
};
const dist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

try {
  await page.goto(url, { waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await setProgress(0.5); await page.waitForTimeout(1500);
  R.beforeLive = { threeD: reqs.filter((r) => THREE_D.test(r.u)).length, sim: reqs.filter((r) => SIM.test(r.u)).length };
  check(R.beforeLive.threeD === 0 && R.beforeLive.sim === 0, `3D/sim requests before p=0.78: ${JSON.stringify(R.beforeLive)}`);
  await setProgress(0.8);
  await page.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().stage === "live", null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  R.atLive = { threeD: reqs.filter((r) => THREE_D.test(r.u)).length, sim: reqs.filter((r) => SIM.test(r.u)).length };
  check(R.atLive.threeD > 0, "live layer did not start loading at p>=0.78");
  check(R.atLive.sim === 0, `sim runtime requested before p=0.92 (${R.atLive.sim})`);
  R.surfaceFetches = reqs.filter((r) => /robot-surface\.glb/.test(r.u)).length;
  await setProgress(0.95);
  await page.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().prefetch === "done", null, { timeout: 60000 });
  R.prefetchSim = reqs.filter((r) => SIM.test(r.u)).length;
  check(R.prefetchSim > 0, "runtime not prefetched at p>=0.92");
  await setProgress(1);
  await page.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().liveReady, null, { timeout: 120000 });
  R.surfaceFetches = reqs.filter((r) => /robot-surface\.glb/.test(r.u)).length;
  check(R.surfaceFetches === 1, `robot-surface fetched ${R.surfaceFetches}x (memoized loader must fetch once)`);
  await page.waitForTimeout(800);
  await shot("00-story-end");
  const baseListeners = await page.evaluate(() => window.__probe.listeners());
  const rafStory = await page.evaluate(() => new Promise((res) => { const a = window.__probe.rafCalls(); let n = 0; const f = () => { if (++n < 60) requestAnimationFrame(f); else res((window.__probe.rafCalls() - a - 60) / 60); }; requestAnimationFrame(f); }));

  // ENTER by sustained down-intent over the frame.
  const box = await page.locator(".poster-frame").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(40);
  check((await sim()).phase === "story", "a single wheel flick entered the simulator");
  await wheelDown(3);
  await page.waitForFunction(() => window.__QUACKLES_SIM__.getState().phase !== "story", null, { timeout: 5000 });
  R.enteredPhase = (await sim()).phase;
  await shot("01-swap-or-reassemble");
  await waitPhase("sim", 120000);
  await page.waitForFunction(() => window.__QUACKLES_SIM__.getState().steps > 0, null, { timeout: 60000 });
  const s0 = await sim();
  R.entryLog = s0.phaseLog;
  check(JSON.stringify(s0.phaseLog.filter((p) => p !== "await")) === JSON.stringify(["swap-in", "reassemble", "sim"]), `entry phases ${s0.phaseLog.join(">")}`);
  R.seed = { jointError: s0.seedJointError, worldJumpMm: s0.seedWorldJumpMm, position: s0.seed.position, loadMs: s0.loadMs };
  check(s0.seedJointError < 1e-6, `seed joint error ${s0.seedJointError}`);
  check(s0.seedWorldJumpMm < 1, `world jump at seeding ${s0.seedWorldJumpMm} mm`);
  await page.waitForTimeout(1500);
  const s1 = await sim(); await shot("03-sim-idle");
  R.idle = { steps: s1.steps, simTime: s1.simTime, jointDelta: Math.max(...s1.joints.map((v, i) => Math.abs(v - s0.seed.joints[i]))), settleMm: Math.abs(s1.root[2] - s0.seed.position[2]) * 1000, driftMm: dist(s1.root.slice(0, 2), s0.seed.position.slice(0, 2)) * 1000 };
  check(R.idle.jointDelta > 1e-3, `joints did not change under the policy (${R.idle.jointDelta})`);
  check(R.idle.settleMm < 2, `trunk settle ${R.idle.settleMm} mm`);
  check(s1.mainThreadSteps === 0, `physics stepped on the main thread ${s1.mainThreadSteps}x`);
  // Fixed 50 Hz clock in the Worker, regardless of render rate.
  const t0 = await sim(); await page.waitForTimeout(2000); const t1 = await sim();
  R.rate = { hz: +((t1.steps - t0.steps) / 2).toFixed(1), simSecondsPerWall: +((t1.simTime - t0.simTime) / 2).toFixed(2), fps: await page.evaluate(() => new Promise((res) => { let n = 0; const s = performance.now(); const f = () => { n++; if (performance.now() - s < 1000) requestAnimationFrame(f); else res(n); }; requestAnimationFrame(f); })) };
  check(R.rate.hz > 40 && R.rate.hz <= 51, `control rate ${R.rate.hz} Hz`);
  const rafSim = await page.evaluate(() => new Promise((res) => { const a = window.__probe.rafCalls(); let n = 0; const f = () => { if (++n < 60) requestAnimationFrame(f); else res((window.__probe.rafCalls() - a - 60) / 60); }; requestAnimationFrame(f); }));
  R.renderLoop = { rafPerFrameStory: +rafStory.toFixed(2), rafPerFrameSim: +rafSim.toFixed(2), webglCanvases: await page.evaluate(() => document.querySelectorAll(".sim-live-layer canvas").length), workersLive: await page.evaluate(() => window.__probe.workers.created - window.__probe.workers.terminated) };
  check(rafSim - rafStory <= 1.2, `more than one extra render loop in SIM (${rafStory} -> ${rafSim} rAF/frame)`);
  check(R.renderLoop.webglCanvases === 1, `live canvases ${R.renderLoop.webglCanvases}`);
  check(R.renderLoop.workersLive === 1, `workers alive in SIM ${R.renderLoop.workersLive}`);
  // Hidden tab pauses the clock.
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300); const h0 = (await sim()).steps; await page.waitForTimeout(1000); const h1 = (await sim()).steps;
  await page.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(600); const h2 = (await sim()).steps;
  R.hidden = { stepsWhileHidden: h1 - h0, resumed: h2 > h1 };
  check(h1 - h0 === 0 && h2 > h1, `hidden pause/resume ${JSON.stringify(R.hidden)}`);
  // Walk: ArrowUp for 3 s.
  const w0 = await sim();
  await page.keyboard.down("ArrowUp"); await page.waitForTimeout(3000);
  const w1 = await sim(); await shot("04-walk"); await page.keyboard.up("ArrowUp");
  R.walk = { twist: w1.twist, movedCm: +(dist(w1.root.slice(0, 2), w0.root.slice(0, 2)) * 100).toFixed(1), progressDuringSim: await progress() };
  check(R.walk.movedCm > 2, `ArrowUp moved ${R.walk.movedCm} cm`);
  check(R.walk.progressDuringSim >= 0.999, "arrow keys scrolled the story while in SIM");
  // Soft fence: holding forward for 8 s must keep the trunk over the plinth top (the physics floor is an infinite
  // plane at plinth height; walking off would float over the studio floor).
  await page.keyboard.down("ArrowUp"); await page.waitForTimeout(8000); await page.keyboard.up("ArrowUp");
  await page.waitForTimeout(1500);
  const fz = await sim();
  R.fence = { plinth: fz.fence, trunkWorld: fz.trunkWorld?.map((v) => +v.toFixed(3)), blocked: fz.fenceBlocks };
  const inside = fz.fence && fz.trunkWorld && fz.trunkWorld[0] > fz.fence.minX && fz.trunkWorld[0] < fz.fence.maxX && fz.trunkWorld[2] > fz.fence.minZ && fz.trunkWorld[2] < fz.fence.maxZ;
  check(!!inside, `robot left the plinth top ${JSON.stringify(R.fence)}`);
  await page.keyboard.down("ArrowLeft"); await page.waitForTimeout(2500); await page.keyboard.up("ArrowLeft");
  // Orbit + zoom.
  const c0 = (await sim()).camera;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 160, box.y + box.height / 2, { steps: 8 }); await page.mouse.up();
  await page.mouse.wheel(0, 200); await page.waitForTimeout(500);
  const c1 = (await sim()).camera; await shot("05-orbit-zoom");
  R.camera = { azimuthDelta: +(c1.azimuth - c0.azimuth).toFixed(3), distance: [+c0.distance.toFixed(3), +c1.distance.toFixed(3)] };
  check(Math.abs(c1.azimuth - c0.azimuth) > 0.2, "drag did not orbit");
  check(c1.distance < c0.distance, "wheel down did not zoom in");
  check((await sim()).phase === "sim", "zoomed wheel exited the sim");
  // On-screen D-pad drives the same command path.
  const up = page.locator('[data-testid="sim-dpad-up"]');
  const bb = await up.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(250);
  R.dpadTwist = (await sim()).twist; await page.mouse.up(); await page.waitForTimeout(100);
  check(R.dpadTwist[0] > 0, `D-pad twist ${JSON.stringify(R.dpadTwist)}`);
  check((await sim()).twist[0] === 0, "D-pad release did not stop");

  // EXIT via Esc -> reverse to the plate; story resumes.
  const logBefore = (await sim()).phaseLog.length;
  await page.keyboard.press("Escape");
  await shot("06-exiting");
  await waitPhase("story", 20000); await page.waitForTimeout(900); await shot("08-back-to-plate");
  const e1 = await sim();
  R.exitLog = e1.phaseLog.slice(logBefore);
  check(JSON.stringify(R.exitLog) === JSON.stringify(["return", "disassemble", "swap-out", "story"]), `exit phases ${R.exitLog.join(">")}`);
  R.exit = { exits: e1.exits, workersLive: await page.evaluate(() => window.__probe.workers.created - window.__probe.workers.terminated), listeners: [baseListeners, await page.evaluate(() => window.__probe.listeners())], liveOpacity: e1.liveOpacity };
  check(R.exit.workersLive === 0, `workers alive after exit ${R.exit.workersLive}`);
  check(R.exit.listeners[1] === R.exit.listeners[0], `listeners ${R.exit.listeners.join(" -> ")}`);
  check(e1.liveOpacity === 0, "live layer still visible in STORY");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(60); }
  await page.waitForTimeout(1200);
  R.storyResumed = await progress();
  check(R.storyResumed < 0.99, `story did not resume on wheel-up (p=${R.storyResumed})`);
  await toEnd();
  check((await sim()).phase === "story", "spaced scrolling to the end entered the simulator");

  // Re-entry via the explicit button: same seed within 1 mm; then Back button exit.
  await page.locator('[data-testid="sim-enter"]').click();
  await waitPhase("sim", 120000); await page.waitForFunction(() => window.__QUACKLES_SIM__.getState().steps > 0, null, { timeout: 60000 });
  const r1 = await sim();
  R.reentry = { seedDeltaMm: +(dist(r1.seed.position, s0.seed.position) * 1000).toFixed(4), jointError: r1.seedJointError, token: r1.token };
  check(R.reentry.seedDeltaMm < 1, `re-entry seed moved ${R.reentry.seedDeltaMm} mm`);
  check(r1.token !== s0.token, "re-entry reused the session token");
  await page.locator('[data-testid="sim-back"]').click();
  await waitPhase("story", 20000);
  // Wheel-up at min zoom exits.
  await page.locator('[data-testid="sim-enter"]').click();
  await waitPhase("sim", 120000);
  // Software GL renders ~1 fps in SIM, so trusted wheel events arrive seconds apart and can never form a sustained
  // gesture here. Dispatch the burst as DOM WheelEvents on the canvas: same window listener + state machine path
  // (trusted wheel input is exercised above by the entry and zoom checks).
  await page.evaluate(async () => {
    const target = document.querySelector(".sim-live-layer");
    for (let i = 0; i < 4; i++) { target.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true })); await new Promise((r) => setTimeout(r, 30)); }
  });
  await page.waitForFunction(() => ["return", "disassemble", "swap-out", "story"].includes(window.__QUACKLES_SIM__.getState().phase), null, { timeout: 3000 }).catch(() => {});
  R.wheelUpExit = (await sim()).phase;
  check(R.wheelUpExit !== "sim", "wheel-up at min zoom did not exit");
  await waitPhase("story", 20000);
  check((await progress()) >= 0.999, "wheel-up exit also scrolled the story back");

  // Six enter/exit cycles: heap growth < 10 %.
  const heap0 = await heapMB();
  const cycles = [];
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => window.__QUACKLES_SIM__.enter());
    await waitPhase("sim", 120000); await page.waitForFunction(() => window.__QUACKLES_SIM__.getState().steps > 5, null, { timeout: 60000 });
    await page.evaluate(() => window.__QUACKLES_SIM__.exit());
    await waitPhase("story", 20000);
    cycles.push(+(await heapMB()).toFixed(1));
  }
  R.cycles = { heap0: +heap0.toFixed(1), heaps: cycles, growthPct: +((cycles.at(-1) / heap0 - 1) * 100).toFixed(1), workersLive: await page.evaluate(() => window.__probe.workers.created - window.__probe.workers.terminated), listeners: await page.evaluate(() => window.__probe.listeners()) };
  check(R.cycles.growthPct < 10, `heap grew ${R.cycles.growthPct}% over 6 cycles`);
  check(R.cycles.workersLive === 0, "worker leak across cycles");
  check(R.cycles.listeners === baseListeners, `listener leak across cycles ${baseListeners} -> ${R.cycles.listeners}`);

  // Reload works.
  await page.reload({ waitUntil: "load" });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await setProgress(1);
  await page.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().liveReady, null, { timeout: 120000 });
  await page.evaluate(() => window.__QUACKLES_SIM__.enter());
  await waitPhase("sim", 120000); await page.waitForFunction(() => window.__QUACKLES_SIM__.getState().steps > 10, null, { timeout: 60000 });
  const rl = await sim();
  R.reload = { steps: rl.steps, jointError: rl.seedJointError, seedDeltaMm: +(dist(rl.seed.position, s0.seed.position) * 1000).toFixed(4) };
  check(rl.seedJointError < 1e-6 && R.reload.seedDeltaMm < 1, `reload seed ${JSON.stringify(R.reload)}`);
  await page.evaluate(() => window.__QUACKLES_SIM__.exit());
  await waitPhase("story", 20000);
  // Reduced motion: wheel never enters; the explicit button enters with no reassembly animation; exit is instant.
  const rmCtx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const rm = await rmCtx.newPage();
  rm.on("pageerror", (e) => errors.push(`rm: ${e.message.slice(0, 200)}`));
  await rm.goto(url, { waitUntil: "load" });
  await rm.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState?.().drawCount > 0, null, { timeout: 60000 });
  await rm.evaluate(() => window.__QUACKLES_SEQUENCE__.setProgress(1));
  await rm.waitForFunction(() => window.__QUACKLES_SIM__?.getState?.().liveReady, null, { timeout: 120000 });
  const rbox = await rm.locator(".poster-frame").boundingBox();
  await rm.mouse.move(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
  for (let i = 0; i < 4; i++) { await rm.mouse.wheel(0, 150); await rm.waitForTimeout(40); }
  await rm.waitForTimeout(500);
  const rs = () => rm.evaluate(() => window.__QUACKLES_SIM__.getState());
  R.reduced = { afterWheel: (await rs()).phase, reduced: (await rs()).reduced };
  check(R.reduced.reduced === true && R.reduced.afterWheel === "story", `reduced motion: wheel entered (${JSON.stringify(R.reduced)})`);
  await rm.locator('[data-testid="sim-enter"]').click();
  await rm.waitForFunction(() => window.__QUACKLES_SIM__.getState().phase === "sim", null, { timeout: 120000 });
  await rm.waitForFunction(() => window.__QUACKLES_SIM__.getState().steps > 0, null, { timeout: 60000 });
  const re = await rs();
  R.reduced.entryLog = re.phaseLog; R.reduced.jointError = re.seedJointError;
  check(re.phaseLog.every((p) => p === "await" || p === "sim"), `reduced motion animated the entry: ${re.phaseLog.join(">")}`);
  await rm.keyboard.press("Escape");
  const rx = await rs();
  R.reduced.exitPhase = rx.phase; R.reduced.opacityAfterExit = rx.liveOpacity;
  check(rx.phase === "story", `reduced motion exit not instant (${rx.phase})`);
  await rm.waitForTimeout(1500);
  R.reduced.workers = (await rs()).workers;
  check(R.reduced.workers === 0, "reduced motion exit left a worker");
  await rmCtx.close();
  R.errors = [...errors, ...((await sim()).errors ?? [])];
  check(R.errors.length === 0, `page errors: ${R.errors.slice(0, 3).join(" | ")}`);
} catch (error) {
  fail.push(`harness: ${error.message.split("\n")[0]}`);
  R.state = await sim().catch(() => null);
  R.errors = errors;
}
console.log(JSON.stringify(R, null, 1));
await browser.close(); server?.kill();
if (fail.length) { console.error("FAIL", fail); process.exit(1); }
console.log("PASS sim-handoff-browser");
