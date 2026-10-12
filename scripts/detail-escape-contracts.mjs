#!/usr/bin/env node
/** #53 contract: the detail layer repaints for a pan only when the crop can leave the painted coverage. A side of the coverage
 * that already reaches the image edge has nothing beyond it, so it needs no early-repaint inset. Before this, the 12% inset
 * on every side made a zoom < ~1.32 crop (or any crop on an image edge) "escape" forever: a full repaint on every render. */
import assert from "node:assert/strict";
import { bufferedCrop, cropEscapes, inspectionCrop } from "../lib/sequence/render.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const inset = (crop) => crop.width * 0.12;
const painted = (zoom, x, y) => { const crop = inspectionCrop(zoom, x, y); return { crop, coverage: bufferedCrop(crop, 0.4) }; };

test("low zoom: coverage spans the whole image, the same crop does not escape", () => {
  for (const zoom of [1.02, 1.19, 1.3]) { const { crop, coverage } = painted(zoom, 0.5, 0.5); assert.equal(cropEscapes(crop, coverage, inset(crop)), false, `zoom ${zoom}`); }
});
test("crop on an image edge at 8x does not escape its own coverage", () => {
  for (const [x, y] of [[0, 0.5], [1, 0.5], [0.5, 0], [0.5, 1], [0, 0], [1, 1]]) { const { crop, coverage } = painted(8, x, y); assert.equal(cropEscapes(crop, coverage, inset(crop)), false, `${x},${y}`); }
});
test("interior sides keep the early-repaint inset", () => {
  const { crop, coverage } = painted(8, 0.5, 0.5);
  assert.equal(cropEscapes(crop, coverage, inset(crop)), false);
  const pad = coverage.x + coverage.width - (crop.x + crop.width); // room to the right edge of the coverage
  const nearRight = { ...crop, x: crop.x + pad - inset(crop) / 2 }; // inside coverage but within the inset
  assert.equal(cropEscapes(nearRight, coverage, inset(crop)), true);
  const edgeCov = painted(8, 0, 0.5); // coverage at the left image edge: the right side is interior
  const r = edgeCov.coverage.x + edgeCov.coverage.width - (edgeCov.crop.x + edgeCov.crop.width);
  assert.equal(cropEscapes({ ...edgeCov.crop, x: edgeCov.crop.x + r - inset(edgeCov.crop) / 2 }, edgeCov.coverage, inset(edgeCov.crop)), true);
});
test("a crop outside the coverage always escapes", () => {
  const { crop, coverage } = painted(8, 0.2, 0.2);
  assert.equal(cropEscapes({ ...crop, x: crop.x + 0.3 }, coverage, inset(crop)), true);
});
console.log(`${n} passed`);
