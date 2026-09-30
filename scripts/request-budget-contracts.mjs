#!/usr/bin/env node
/** #43 request-budget contract (production sharpPlan/tileAssets). Run: node --import ./scripts/register-ts-resolve.mjs scripts/request-budget-contracts.mjs
 * Settled inspection must request exactly the tiles covering the painted buffer (viewport + the 40% margin) — no extra ring —
 * and never fewer than the visible viewport needs. The overscan ring is opt-in per device profile. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { sharpPlan, tileAssets, inspectionCrop } from "../lib/sequence/render.ts";
import { applyInspectionPolicy } from "../lib/sequence/inspection-source.ts";

const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const blue = applyInspectionPolicy(raw).frames[0].assets.blue;
const CSS = { w: 600, h: 900, dpr: 1 }, BUDGET = 96 * 1024 * 1024 - 1024 * 1536 * 4;
const key = (t) => t.asset.url;
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };
const plans = (overscan) => [2, 4, 6, 8].map((z) => {
  const crop = inspectionCrop(z, 0.44, 0.28), desired = Math.ceil(CSS.w * CSS.dpr * crop.scale);
  const plan = overscan === undefined ? sharpPlan(blue, desired, crop, BUDGET, CSS.w, CSS.h, CSS.dpr) : sharpPlan(blue, desired, crop, BUDGET, CSS.w, CSS.h, CSS.dpr, overscan);
  return { z, crop, plan };
});

test("default plan requests exactly the tiles covering the buffered coverage (no extra ring)", () => {
  for (const { z, plan } of plans()) {
    assert.ok(plan, `z${z}`);
    const exact = tileAssets(plan.variant, plan.coverage, 0).map(key).sort();
    assert.deepEqual(plan.tasks.map(key).sort(), exact, `z${z}: planned tiles must equal coverage tiles`);
  }
});
test("every tile intersecting the visible viewport is planned (quality preserved)", () => {
  for (const { z, crop, plan } of plans()) {
    const visible = tileAssets(plan.variant, crop, 0).map(key);
    const planned = new Set(plan.tasks.map(key));
    for (const v of visible) assert.ok(planned.has(v), `z${z}: visible tile ${v} missing`);
  }
});
test("a profile can still opt in to a one-tile ring (superset of default)", () => {
  const base = plans(), ring = plans(1);
  for (let i = 0; i < base.length; i++) {
    const a = new Set(base[i].plan.tasks.map(key)), b = new Set(ring[i].plan.tasks.map(key));
    for (const k of a) assert.ok(b.has(k)); assert.ok(b.size >= a.size);
  }
});
test("request budget: zoom 2/4/6 ladder <= 60% of the measured baseline (88 tiles: 15+25+48, perf-trace/head-steps.json)", () => {
  const ladder = plans().filter((p) => [2, 4, 6].includes(p.z)).map((p) => p.plan.tasks.length);
  const total = ladder.reduce((s, x) => s + x, 0);
  console.log("  z2/4/6 planned tiles:", ladder.join("/"), "total", total, "(baseline 88)");
  assert.ok(total <= 0.6 * 88, `budget exceeded: ${total}`);
});
console.log(`${n} passed`);
