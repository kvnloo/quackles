#!/usr/bin/env node
/** Static wiring guards (#43). These read source text, so they are brittle by design: they exist because the
 * behaviours below are not reliably observable from desktop hooks and were found unguarded by an independent verifier.
 * Each guard names the defect it prevents. Behaviour itself is covered by the browser probes. */
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const render = read("lib/sequence/render.ts"), hero = read("components/sequence/HeroInspection.tsx"), player = read("components/sequence/SequencePlayer.tsx"), profile = read("lib/sequence/perf-profile.ts");
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
test("every device profile requests no extra tile ring (ring was redundant with the 40% buffer)", () => {
  const overscans = [...profile.matchAll(/tileOverscan:\s*(\d)/g)].map((m) => m[1]);
  assert.ok(overscans.length >= 3); assert.ok(overscans.every((v) => v === "0"), overscans.join());
});
test("player passes the profile overscan to every sharpPlan call", () => {
  const calls = []; for (let i = player.indexOf("sharpPlan("); i >= 0; i = player.indexOf("sharpPlan(", i + 1)) calls.push(player.slice(i, player.indexOf(";", i)));
  assert.ok(calls.length >= 2); for (const c of calls) assert.ok(c.includes("profile.tileOverscan"), c.slice(0, 80));
});
test("theme readiness uses themeDetailReady (tile-less themes must not hold a zoomed swipe)", () => {
  assert.ok(/themeDetailReady\(\{\s*hasDetailSource/.test(player));
});
test("two-theme detail mix requires tile variants on both sides, not list length", () => {
  assert.ok(player.includes("tiled[0] && tiled[1]")); assert.ok(!/sources\[0\]\?\.length && sources\[1\]\?\.length/.test(player));
});
test("detail released when the visible theme set changes", () => {
  assert.ok(/detailThemeKey !== visibleThemeKey\) releaseDetail\(\)/.test(player));
});
test("D6: requested tier comes from requestedDetailWidth; old motion-scale path gone", () => {
  assert.ok(player.includes("requestedDetailWidth(")); assert.ok(!player.includes("motionDesiredWidth"));
});
test("base canvas stays visible while inspecting (persistent underlay)", () => {
  const i = player.indexOf("if (inspecting) {"); const block = player.slice(i, i + 700);
  assert.ok(/baseCanvas!\.style\.visibility = "visible"/.test(block), "base must not be hidden while inspecting");
});
test("detail released when settled and the plate satisfies the requested tier", () => {
  assert.ok(/detailKey && !layers\.length && !moving && desiredWidth <= plateWidth\) releaseDetail\(\)/.test(player));
});
test("sharp lock dissolves in on FIRST paint only (armLockFade/startLockFade around a fresh paint)", () => {
  assert.ok(player.includes("armLockFade(") && player.includes("startLockFade(") && /const freshLock = !detailKey;/.test(player));
});
test("camera snaps exactly to its target on arrival (settleCamera), old tolerance-stop gone", () => {
  assert.ok(hero.includes("settleCamera(")); assert.ok(!/Math\.abs\(focusX\.value - current\.targetFocusX\) < 0\.0008/.test(hero));
  assert.ok(/shouldKeepTicking\(\{ active, settled, converged: arrived\.converged, activeChanged: active !== current\.active \}\)/.test(hero), "loop must run until CONVERGED while active (and stop when inactive+settled)");
  assert.ok(/cameraMoving: active && !settled/.test(hero), "cameraMoving must keep the loose settle criterion (sharp-lock timing)");
});
test("paintDetail places via placeDetail (no percentage left/top/width/height placement)", () => {
  assert.ok(render.includes("placeDetail(canvas, rect.width, rect.height, crop)")); assert.ok(!/canvas\.style\.left = `\$\{crop\.x \* 100\}%`/.test(render));
});
test("container resize re-places the detail canvas (placeDetail in the ResizeObserver handler)", () => {
  assert.ok(/const resized = \(\) => \{[\s\S]*placeDetail\(detailCanvas[\s\S]*new ResizeObserver\(resized\)/.test(player));
});
test("PROPOSED RULE (gp-motion-decode): while moving the player allows the visible crop's current/lower-tier tiles to decode and paints at most one tile a frame", () => {
  assert.ok(/cache\.allowWhileMoving\(\s*moving\s*\?\s*motionDecodeKeys\(/.test(player), "allowWhileMoving(moving ? motionDecodeKeys(...) : [])");
  const motionDrains = player.match(/\.drain\((0\)|moving \? 0 :)/g) || [];
  assert.ok(motionDrains.length >= 2, "underlay and detail drain one tile per frame while moving (drain(0))");
});
console.log(`${n} passed`);
