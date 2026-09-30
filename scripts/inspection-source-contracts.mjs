#!/usr/bin/env node
/** Issue #43 contracts: one inspection session, one source family. Imports production code. */
import assert from "node:assert/strict";
import fs from "node:fs";
import { applyInspectionPolicy, familyOf, INSPECTION_POLICY, describeInspectionSources } from "../lib/sequence/inspection-source.ts";
const THEME_IDS = ["day", "white", "blue", "dark", "night"];
const isImage = (v) => "url" in v;

const raw = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const manifest = raw; // production manifest JSON as shipped (shape identical to parsed manifest for these fields)
const hero = (m, theme) => m.frames.find((f) => f.id === "p0000000").assets[theme];
const tiles = (variants) => variants.filter((v) => !isImage(v));
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("PASS", name); };

test("fixture: production manifest really mixes families for Blue (the #43 bug)", () => {
  const fams = new Set(tiles(hero(manifest, "blue")).map(familyOf));
  assert.deepEqual([...fams].sort(), ["gp-1gp", "legacy-201mp"]);
});
test("Blue production selects legacy-201mp and never mixes families", () => {
  const out = applyInspectionPolicy(manifest);
  const t = tiles(hero(out, "blue"));
  assert.ok(t.length >= 4);
  assert.ok(t.every((v) => familyOf(v) === "legacy-201mp"));
  assert.ok(t.every((v) => !v.tiles.urlTemplate.includes("/gp/")));
  assert.equal(Math.max(...t.map((v) => v.width)), 11584);
});
test("every theme has at most one family after policy", () => {
  const out = applyInspectionPolicy(manifest);
  for (const theme of THEME_IDS) for (const f of out.frames) assert.ok(new Set(tiles(f.assets[theme]).map(familyOf)).size <= 1, theme);
});
test("selection is explicit per theme and revisioned", () => {
  for (const theme of THEME_IDS) {
    const p = INSPECTION_POLICY[theme];
    assert.ok(p && "selected" in p && typeof p.revision === "string" && p.status, theme);
  }
  assert.equal(INSPECTION_POLICY.blue.selected, "legacy-201mp");
  assert.equal(INSPECTION_POLICY.blue.status, "production-201-250mp");
});
test("candidate + disabled serve no tiles by default; candidates opt in explicitly", () => {
  const off = { ...INSPECTION_POLICY, blue: { ...INSPECTION_POLICY.blue, selected: null, status: "disabled" } };
  assert.equal(tiles(hero(applyInspectionPolicy(manifest, off), "blue")).length, 0);
  const cand = { ...INSPECTION_POLICY, blue: { ...INSPECTION_POLICY.blue, selected: "gp-1gp", status: "candidate-1gp" } };
  assert.equal(tiles(hero(applyInspectionPolicy(manifest, cand), "blue")).length, 0, "candidate must be off in production");
  const t = tiles(hero(applyInspectionPolicy(manifest, cand, { allowCandidates: true }), "blue"));
  assert.ok(t.length && t.every((v) => familyOf(v) === "gp-1gp"));
  assert.ok(tiles(hero(manifest, "blue")).some((v) => familyOf(v) === "gp-1gp"), "input not mutated");
});
test("all-five audit verdicts are encoded: only Blue serves tiles in production", () => {
  const out = applyInspectionPolicy(manifest);
  for (const theme of THEME_IDS) assert.equal(tiles(hero(out, theme)).length > 0, theme === "blue", theme);
  assert.equal(INSPECTION_POLICY.day.status, "candidate-1gp");
  for (const t of ["white", "dark", "night"]) assert.equal(INSPECTION_POLICY[t].status, "disabled");
});
test("switching sources leaves base animation frames byte-identical", () => {
  const cand = { ...INSPECTION_POLICY, blue: { ...INSPECTION_POLICY.blue, selected: "gp-1gp", status: "candidate-1gp" } };
  const opts = { allowCandidates: true };
  const images = (m) => JSON.stringify(m.frames.map((f) => THEME_IDS.map((t) => f.assets[t].filter(isImage))));
  assert.equal(images(applyInspectionPolicy(manifest)), images(manifest));
  assert.equal(images(applyInspectionPolicy(manifest, cand, opts)), images(manifest));
});
test("debug receipt exposes selected source id + revision per theme", () => {
  const d = describeInspectionSources();
  assert.equal(d.blue.selected, "legacy-201mp");
  assert.ok(d.blue.revision && d.blue.status);
});
console.log(`${n} passed`);
