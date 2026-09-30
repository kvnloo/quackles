#!/usr/bin/env node
/** Camera arrival contract. TWO tolerances:
 *  - SETTLE (loose, unchanged from the original app): drives cameraMoving=false -> sharp-lock timing. No snap here (a snap this large jumps ~5 px at 8x).
 *  - CONVERGE (tight): the spring keeps converging invisibly, then snaps EXACTLY to the target with a sub-pixel jump -> route-independent final view. */
import assert from "node:assert/strict";
import { settleCamera, SETTLE_TOL, CONVERGE_TOL, convergeFocusTol, shouldKeepTicking } from "../lib/sequence/camera-settle.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const target = { zoom: 8, fx: 0.44, fy: 0.28 };
const at = (dz, dfx, dfy, vz = 0, vfx = 0, vfy = 0) => ({ zoom: target.zoom + dz, focusX: target.fx + dfx, focusY: target.fy + dfy, zoomV: vz, fxV: vfx, fyV: vfy });
test("loose tolerances are the ones the app already used (sharp-lock timing unchanged)", () => assert.deepEqual(SETTLE_TOL, { zoom: 0.0006, focus: 0.0008, velocity: 0.0025 }));
test("tight tolerance keeps the final snap sub-pixel at 8x (<= 1 px of an 900px hero)", () => { const px = CONVERGE_TOL.focus * 0.875 * 900 * 8; assert.ok(px <= 1, `${px.toFixed(2)} px`); });
test("loosely settled but not converged: settled=true, values UNTOUCHED (no visible jump), not converged", () => {
  const s = at(0.0004, 0.0002, 0.0007, 0.001, 0.001, -0.001), r = settleCamera(s, target);
  assert.equal(r.settled, true); assert.equal(r.converged, false); assert.equal(r.focusY, s.focusY); assert.equal(r.zoom, s.zoom); assert.equal(r.fyV, s.fyV);
});
test("converged: snaps EXACTLY to target with zero velocity (route-independent)", () => {
  const outs = [at(0.00004, 0.00003, 0.00008), at(-0.00005, -0.00009, 0.00007, 0.0003, -0.0003, 0.0002), at(0, 0, 0)].map((s) => settleCamera(s, target));
  for (const o of outs) { assert.equal(o.converged, true); assert.deepEqual([o.zoom, o.focusX, o.focusY, o.zoomV, o.fxV, o.fyV], [8, 0.44, 0.28, 0, 0, 0]); }
});
test("outside the loose tolerance: not settled, untouched", () => { const s = at(0, 0, 0.002), r = settleCamera(s, target); assert.equal(r.settled, false); assert.equal(r.converged, false); assert.equal(r.focusY, s.focusY); });
test("fast inside the position tolerance: neither settled nor converged (no snap mid-motion)", () => { const s = at(0, 0, 0.00005, 0, 0, 0.02), r = settleCamera(s, target); assert.equal(r.settled, false); assert.equal(r.converged, false); assert.equal(r.fyV, 0.02); });
test("converge tolerance scales with zoom so the final snap stays sub-pixel at every zoom (was ~2 px at maxZoom)", () => {
  for (const z of [1.5, 2, 4, 8, 12, 19.3, 24]) { const px = convergeFocusTol(z) * 900 * Math.max(z - 1, 0); assert.ok(px <= 0.8, `z${z}: ${px.toFixed(2)} px`); }
  assert.equal(convergeFocusTol(2), CONVERGE_TOL.focus); assert.ok(convergeFocusTol(19.3) < CONVERGE_TOL.focus);
});
test("scaled tolerance is actually used by settleCamera (12x: within scaled tol snaps, outside stays)", () => {
  const t = { zoom: 12, fx: 0.4, fy: 0.3 }, tol = convergeFocusTol(12);
  const mk = (d) => ({ zoom: 12, focusX: 0.4, focusY: 0.3 + d, zoomV: 0, fxV: 0, fyV: 0 });
  assert.equal(settleCamera(mk(tol * 0.9), t).converged, true); assert.equal(settleCamera(mk(tol * 1.5), t).converged, false);
});
test("loop termination: never tick forever when the camera is not active (stored zoom pinned at 1, unreachable tight tolerance)", () => {
  assert.equal(shouldKeepTicking({ active: false, settled: true, converged: false, activeChanged: false }), false, "inactive + settled must stop");
  assert.equal(shouldKeepTicking({ active: false, settled: false, converged: false, activeChanged: false }), true);
  assert.equal(shouldKeepTicking({ active: true, settled: true, converged: false, activeChanged: false }), true, "active keeps converging");
  assert.equal(shouldKeepTicking({ active: true, settled: true, converged: true, activeChanged: false }), false);
  assert.equal(shouldKeepTicking({ active: true, settled: true, converged: true, activeChanged: true }), true, "a state change needs one more tick");
});
console.log(`${n} passed`);
