import assert from "node:assert/strict";
import { shouldResampleViewfinder } from "../lib/sequence/viewfinder-sample.ts";

assert.equal(
  shouldResampleViewfinder({ active: false, themeDragging: true }),
  false,
  "a hidden navigator must not resample on a color drag",
);
assert.equal(
  shouldResampleViewfinder({ active: false, themeDragging: false }),
  false,
  "a hidden navigator must not resample on a settled plate paint",
);
assert.equal(
  shouldResampleViewfinder({ active: true, themeDragging: false }),
  true,
  "a visible navigator still resamples when the plate changes",
);
console.log("viewfinder-sample ok");
