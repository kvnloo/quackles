#!/usr/bin/env node
/** #43 warm-up contract: bounded, family-aware, never the top tier, nothing at 1x load. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyInspectionPolicy } from "../lib/sequence/inspection-source.ts";
import { warmPlan, WARM_MAX_WIDTH, WARM_MAX_TILES, WARM_CROP, mayWarm } from "../lib/sequence/warm-plan.ts";

const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const hero = (theme, m = applyInspectionPolicy(raw)) => m.frames[0].assets[theme].filter((v) => v.tiles);
// independent grid math (not the production tileAssets)
const tilesFor = (v, crop) => {
  const { tileSize, columns, rows, urlTemplate } = v.tiles, out = [];
  for (let y = Math.floor(crop.y * v.height / tileSize); y <= Math.min(rows - 1, Math.ceil((crop.y + crop.height) * v.height / tileSize) - 1); y++)
    for (let x = Math.floor(crop.x * v.width / tileSize); x <= Math.min(columns - 1, Math.ceil((crop.x + crop.width) * v.width / tileSize) - 1); x++)
      out.push({ asset: { url: urlTemplate.replace("{x}", x).replace("{y}", y), width: tileSize, height: tileSize } });
  return out;
};
let n = 0; const test = (name, fn) => { fn(); n++; console.log("PASS", name); };

test("Blue warm plan: selected family only, never the top tier, bounded tiles", () => {
  const plan = warmPlan(hero("blue"), tilesFor);
  assert.ok(plan.length > 0 && plan.length <= WARM_MAX_TILES);
  assert.ok(plan.every((t) => !t.asset.url.includes("/gp/")));
  assert.ok(plan.every((t) => !/\/blue\/p0000000\/0\//.test(t.asset.url)), "top tier (level 0) must not be warmed");
});
test("warm tier is lower/mid: width <= WARM_MAX_WIDTH", () => {
  assert.equal(WARM_MAX_WIDTH, 2896);
  const vs = hero("blue"); const plan = warmPlan(vs, tilesFor);
  const level = plan[0].asset.url.match(/p0000000\/(\d)\//)[1];
  const v = vs.find((x) => x.tiles.urlTemplate.includes(`/${level}/`));
  assert.ok(v.width <= WARM_MAX_WIDTH);
});
test("1GP candidate never auto-warms its top tier (gp/0 = 25820, gp/1 = 12910)", () => {
  const cand = { ...Object.fromEntries(["day","white","blue","dark","night"].map((t) => [t, { selected: "gp-1gp", status: "candidate-1gp", revision: "x" }])) };
  const plan = warmPlan(hero("blue", applyInspectionPolicy(raw, cand)), tilesFor);
  assert.ok(plan.every((t) => !/\/gp\/[01]\//.test(t.asset.url)));
});
test("warms only the central crop, not the whole image", () => {
  const plan = warmPlan(hero("blue"), tilesFor);
  assert.ok(plan.length < 30, `${plan.length}`);
  assert.deepEqual(WARM_CROP, { x: 0.22, y: 0.18, width: 0.56, height: 0.5, scale: 1 });
});
test("empty when no tiles / single-tier-too-large", () => {
  assert.deepEqual(warmPlan([], tilesFor), []);
  assert.deepEqual(warmPlan(hero("blue").filter((v) => v.width > 5000), tilesFor), []);
});
test("mayWarm gate: needs painted hero, idle, no interaction/motion, settled delay", () => {
  const ok = { painted: true, inspecting: false, moving: false, sinceFirstPaintMs: 1500 };
  assert.equal(mayWarm(ok), true);
  for (const bad of [{ painted: false }, { inspecting: true }, { moving: true }, { sinceFirstPaintMs: 100 }])
    assert.equal(mayWarm({ ...ok, ...bad }), false, JSON.stringify(bad));
});
console.log(`${n} passed`);
