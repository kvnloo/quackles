import assert from "node:assert/strict";
import { zoomedViewSource } from "../lib/sequence/viewfinder-sample.ts";

assert.equal(
  zoomedViewSource({ inspecting: true, detailReady: true }),
  "detail",
  "a zoom with tiles shows those tiles, not the 1024 plate",
);
assert.equal(
  zoomedViewSource({ inspecting: true, detailReady: false }),
  "none",
  "a zoom must not fall back to the mismatched plate while tiles load",
);
assert.equal(
  zoomedViewSource({ inspecting: false, detailReady: false }),
  "plate",
  "the hero still uses the plate when you are not zoomed",
);
console.log("zoomed-plate ok");
