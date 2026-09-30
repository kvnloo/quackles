#!/usr/bin/env node
/** Static wiring guards (#43). These read source text, so they are brittle by design: they exist because the
 * behaviours below are not reliably observable from desktop hooks and were found unguarded by an independent verifier.
 * Each guard names the defect it prevents. Behaviour itself is covered by the browser probes. */
import assert from "node:assert/strict";
import fs from "node:fs";
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const player = read("components/sequence/SequencePlayer.tsx"), profile = read("lib/sequence/perf-profile.ts");
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
  assert.ok(player.includes("armLockFade(") && player.includes("startLockFade(") && /const freshLock = !detailKey/.test(player));
});
console.log(`${n} passed`);
