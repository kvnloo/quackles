#!/usr/bin/env node
// Haptics contract: forward-only, once-per-crossing phase events; no
// continuous buzz; coarse-pointer + opt-out gating.
import assert from "node:assert/strict";
import { initialFeel, stepFeel, hapticsAllowed, REARM } from "../lib/feel/phase-events.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };

const run = (path) => { let s = initialFeel(); const ev = []; for (const p of path) { const r = stepFeel(s, p); s = r.state; if (r.event) ev.push(r.event); } return ev; };
const ramp = (a, b, steps = 200) => Array.from({ length: steps + 1 }, (_, i) => a + (b - a) * (i / steps));

test("forward scroll fires each phase once, in order", () => assert.deepEqual(run(ramp(0, 1)), ["crouch", "flight", "land", "explode", "inspect"]));
test("reverse scroll fires nothing", () => { let s = stepFeel(initialFeel(), 1).state; const ev = []; for (const p of ramp(1, 0)) { const r = stepFeel(s, p); s = r.state; if (r.event) ev.push(r.event); } assert.deepEqual(ev, []); });
test("first sample (page restore mid-story) fires nothing", () => assert.deepEqual(run([0.7, 0.71]), []));
test("jitter around a boundary fires once", () => { const b = 0.34; assert.deepEqual(run([0.3, b + 0.001, b - 0.001, b + 0.002, b - 0.002, b + 0.003]), ["flight"]); });
test("re-arms only after retreating past hysteresis", () => { const b = 0.34; assert.equal(run([0.3, b + 0.01, b - REARM - 0.01, b + 0.01]).filter((e) => e === "flight").length, 2); });
test("a fling across several phases emits one event (the furthest)", () => assert.deepEqual(run([0.1, 0.9]), ["inspect"]));
test("no continuous events while dwelling inside a phase", () => assert.deepEqual(run(ramp(0.4, 0.5)), []));
test("gating: fine pointer, opt-out and reduced motion disable haptics", () => {
  assert.equal(hapticsAllowed({ coarse: true, optOut: false, reduced: false }), true);
  assert.equal(hapticsAllowed({ coarse: false, optOut: false, reduced: false }), false);
  assert.equal(hapticsAllowed({ coarse: true, optOut: true, reduced: false }), false);
  assert.equal(hapticsAllowed({ coarse: true, optOut: false, reduced: true }), false);
});
console.log(`${n} passed`);
