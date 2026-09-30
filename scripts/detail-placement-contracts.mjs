#!/usr/bin/env node
/** #M3 contract: the detail canvas is placed WITHOUT fractional layout offsets/sizes (Chrome pixel-snaps box geometry in local space
 * BEFORE the camera's zoom transform, so a 0.5 css px snap becomes 4 px on screen at 8x). The exact fractional rect is realised with a
 * transform (not snapped). Layout box = integer css px at origin 0,0; transform = translate(exact) scale(exact/box). */
import assert from "node:assert/strict";
import { detailPlacement } from "../lib/sequence/detail-placement.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const CASES = [[600, 900, { x: 0.335, y: 0.195, width: 0.225, height: 0.225 }], [600, 900, { x: 0.341166, y: 0.217151, width: 0.224657, height: 0.224657 }], [375, 812, { x: 0.1234567, y: 0.7654321, width: 0.3333333, height: 0.3333333 }], [1440, 900, { x: 0, y: 0, width: 1, height: 1 }]];
test("layout box is integer css px, positioned at 0,0 (nothing for layout to snap)", () => {
  for (const [w, h, c] of CASES) { const p = detailPlacement(w, h, c); assert.ok(Number.isInteger(p.boxW) && Number.isInteger(p.boxH) && p.boxW >= 1 && p.boxH >= 1); assert.equal(p.left, 0); assert.equal(p.top, 0); }
});
test("transform realises the exact fractional rect (translate = crop*css, size = box*scale = crop size)", () => {
  for (const [w, h, c] of CASES) { const p = detailPlacement(w, h, c);
    assert.ok(Math.abs(p.tx - c.x * w) < 1e-9); assert.ok(Math.abs(p.ty - c.y * h) < 1e-9);
    assert.ok(Math.abs(p.boxW * p.sx - c.width * w) < 1e-9); assert.ok(Math.abs(p.boxH * p.sy - c.height * h) < 1e-9); }
});
test("box never smaller than the exact size (scale <= 1, so no cropping of drawn content)", () => {
  for (const [w, h, c] of CASES) { const p = detailPlacement(w, h, c); assert.ok(p.sx <= 1 + 1e-12 && p.sy <= 1 + 1e-12); }
});
console.log(`${n} passed`);
