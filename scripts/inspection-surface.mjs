import assert from "node:assert/strict";
import { shouldHidePlate, shouldReleaseDetailOverlay } from "../lib/sequence/inspection-surface.ts";

assert.equal(
  shouldHidePlate({ inspecting: true, detailReady: false }),
  false,
  "zoom-in keeps the plate until a usable detail canvas exists",
);
assert.equal(
  shouldHidePlate({ inspecting: true, detailReady: true }),
  true,
  "zoom-in hides the plate only after detail is visible",
);
assert.equal(
  shouldHidePlate({ inspecting: false, detailReady: true }),
  false,
  "a settled hero does not hide the plate",
);

assert.equal(
  shouldReleaseDetailOverlay({ inspecting: false, nativeScale: 1 }),
  true,
  "zoom-out clears the detail overlay after the spring settles",
);
assert.equal(
  shouldReleaseDetailOverlay({ inspecting: true, nativeScale: 1 }),
  false,
  "an active zoom keeps the detail overlay",
);
assert.equal(
  shouldReleaseDetailOverlay({ inspecting: false, nativeScale: 1.2 }),
  false,
  "a native pinch still owns the detail overlay",
);

console.log("inspection-surface ok");
