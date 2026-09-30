#!/usr/bin/env node
import assert from "node:assert/strict";
import { requestedDetailWidth } from "../lib/sequence/motion-quality.ts";
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const base = { plateWidth: 1024 };
test("settled: full tier", () => assert.equal(requestedDetailWidth({ ...base, moving: false, settledWidth: 5792, paintedWidth: 2896 }), 5792));
test("moving never raises the tier above the painted one", () => assert.equal(requestedDetailWidth({ ...base, moving: true, settledWidth: 5792, paintedWidth: 2896 }), 2896));
test("moving with no detail painted requests no more than the plate (no first sharpening pop)", () => assert.equal(requestedDetailWidth({ ...base, moving: true, settledWidth: 5792, paintedWidth: 0 }), 1024));
test("moving may lower the tier when zooming out", () => assert.equal(requestedDetailWidth({ ...base, moving: true, settledWidth: 1448, paintedWidth: 5792 }), 1448));
console.log(`${n} passed`);
