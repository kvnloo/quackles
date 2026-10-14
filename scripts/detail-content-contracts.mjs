#!/usr/bin/env node
/** #53 Wave 2A contract: the settled-only repaint guard compares what a detail paint would put on the canvas. Identical
 * content must give an identical key; any change a viewer could see (frame, tier, alpha, coverage, backing size, tiles,
 * visible themes) must change it, so legitimate upgrades and visual changes still paint. */
import assert from "node:assert/strict";
import { detailContentKey } from "../lib/sequence/render.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const base = { frameId: "p0000000", themes: "blue", layers: [{ width: 5792, alpha: 1, urls: ["a", "b"] }], coverage: { x: 0.27, y: 0.33, width: 0.4, height: 0.4, scale: 2.5 }, backing: { width: 1286, height: 1930 } };
const key = (over = {}) => detailContentKey({ ...base, ...over });
test("identical content gives an identical key (tile order does not matter)", () => {
  assert.equal(key(), key());
  assert.equal(key(), key({ layers: [{ width: 5792, alpha: 1, urls: ["b", "a"] }] }));
});
test("every visible change changes the key", () => {
  const k = key();
  for (const over of [
    { frameId: "p0000001" }, { themes: "blue+dark" },
    { layers: [{ width: 11584, alpha: 1, urls: ["a", "b"] }] },                                  // tier upgrade
    { layers: [{ width: 5792, alpha: 0.98, urls: ["a", "b"] }] },                                // crossfade alpha
    { layers: [{ width: 5792, alpha: 1, urls: ["a", "b", "c"] }] },                               // a late tile joins
    { layers: [...base.layers, { width: 5792, alpha: 0.5, urls: ["d"] }] },                       // second layer
    { coverage: { ...base.coverage, x: 0.2701 } }, { coverage: { ...base.coverage, width: 0.41 } },
    { backing: { width: 1287, height: 1930 } },                                                    // resize
  ]) assert.notEqual(key(over), k, JSON.stringify(over));
});
console.log(`${n} passed`);
