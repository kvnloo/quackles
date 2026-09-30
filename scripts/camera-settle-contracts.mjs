#!/usr/bin/env node
/** M3 contract: when the camera declares itself settled it must sit EXACTLY on its target (route-independent), not wherever the spring
 * stopped within tolerance (was up to 0.0008 focus = ~5 px at 8x, varying by approach route). */
import assert from "node:assert/strict";
import { settleCamera, SETTLE_TOL } from "../lib/sequence/camera-settle.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const target = { zoom: 8, fx: 0.44, fy: 0.28 };
const at = (dz, dfx, dfy, vz = 0, vfx = 0, vfy = 0) => ({ zoom: target.zoom + dz, focusX: target.fx + dfx, focusY: target.fy + dfy, zoomV: vz, fxV: vfx, fyV: vfy });
test("within tolerance and slow: snaps EXACTLY to target with zero velocity", () => {
  const r = settleCamera(at(0.0004, 0.0002, 0.0007, 0.001, 0.001, -0.001), target);
  assert.equal(r.settled, true); assert.equal(r.zoom, 8); assert.equal(r.focusX, 0.44); assert.equal(r.focusY, 0.28); assert.equal(r.zoomV, 0); assert.equal(r.fxV, 0); assert.equal(r.fyV, 0);
});
test("route independence: different approach offsets all settle to the identical camera", () => {
  const outs = [at(0.0004, 0.0002, 0.0007), at(-0.0005, -0.0007, 0.00075, 0.002, -0.002, 0.001), at(0, 0, 0)].map((s) => settleCamera(s, target));
  for (const o of outs) assert.deepEqual([o.zoom, o.focusX, o.focusY], [8, 0.44, 0.28]);
});
test("outside tolerance: untouched, not settled", () => {
  const s = at(0, 0, 0.002); const r = settleCamera(s, target); assert.equal(r.settled, false); assert.equal(r.focusY, s.focusY);
});
test("still fast inside the position tolerance: not settled (no snap mid-motion)", () => {
  const s = at(0, 0, 0.0005, 0, 0, 0.02); const r = settleCamera(s, target); assert.equal(r.settled, false); assert.equal(r.fyV, 0.02); assert.equal(r.focusY, s.focusY);
});
test("tolerances are the ones the app already used (no behavioural loosening)", () => {
  assert.deepEqual(SETTLE_TOL, { zoom: 0.0006, focus: 0.0008, velocity: 0.0025 });
});
console.log(`${n} passed`);
