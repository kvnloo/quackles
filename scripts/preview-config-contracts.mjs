#!/usr/bin/env node
/** Preview config contracts: one shared engine, each preview branch sets `lib/preview.ts`.
 * Imports production code. Run: node --import ./scripts/register-ts-resolve.mjs scripts/preview-config-contracts.mjs
 * PREVIEW_EXPECT=<preview id> additionally asserts the checked-in PREVIEW equals that preview's config
 * (default: "production"). */
import assert from "node:assert/strict";
import fs from "node:fs";
import { PREVIEW, PREVIEWS } from "../lib/preview.ts";
import { previewPolicy, previewManifest, previewThemeIndices, previewNote, mushroomScene, previewStartTheme, MANIFEST_DEFAULT_THEME } from "../lib/sequence/preview-policy.ts";
import { applyInspectionPolicy, applyHiddenPolicy, familyOf, INSPECTION_POLICY, HIDDEN_POLICY } from "../lib/sequence/inspection-source.ts";
import { configure, dragTheme, selectTheme, setThemeRange, snapshot } from "../lib/sequence/store.ts";

const THEME_IDS = ["day", "white", "blue", "dark", "night"];
const isImage = (v) => "url" in v;
const manifest = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const hidden = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/hidden-pyramids.json", import.meta.url))).mushroom.variants;
const tiles = (variants) => variants.filter((v) => !isImage(v));
const allTiles = (m) => m.frames.flatMap((f) => THEME_IDS.flatMap((t) => tiles(f.assets[t])));
const heroFamilies = (m, theme) => [...new Set(tiles(m.frames.find((f) => f.id === "p0000000").assets[theme]).map(familyOf))].sort();
const images = (m) => JSON.stringify(m.frames.map((f) => THEME_IDS.map((t) => f.assets[t].filter(isImage))));
globalThis.cancelAnimationFrame ??= () => {}; globalThis.requestAnimationFrame ??= () => 0;
let n = 0;
const test = (name, fn) => { fn(); n++; console.log("PASS", name); };

test("registry holds production + the four preview branches with the owner's configs", () => {
  assert.deepEqual(Object.keys(PREVIEWS).sort(), ["gigapixel-single", "production", "scenes-250mp", "scenes-gigapixel", "scenes-lowres"]);
  assert.deepEqual(PREVIEWS["scenes-lowres"], { id: "scenes-lowres", scenes: THEME_IDS, story: true, zoom: "none" });
  assert.deepEqual(PREVIEWS["scenes-250mp"], { id: "scenes-250mp", scenes: THEME_IDS, story: true, zoom: "201mp" });
  assert.deepEqual(PREVIEWS["scenes-gigapixel"], { id: "scenes-gigapixel", scenes: THEME_IDS, story: true, zoom: "1gp" });
  assert.deepEqual(PREVIEWS["gigapixel-single"], { id: "gigapixel-single", scenes: ["white"], story: false, zoom: "1gp" }); // owner 2026-09-30: brighter image
  assert.deepEqual(PREVIEWS.production, { id: "production", scenes: THEME_IDS, story: true, zoom: "policy" });
});
test(`checked-in PREVIEW is ${process.env.PREVIEW_EXPECT || "production"}`, () => {
  assert.deepEqual(PREVIEW, PREVIEWS[process.env.PREVIEW_EXPECT || "production"]);
});
test("production: policy resolution is byte-identical to INSPECTION_POLICY/HIDDEN_POLICY", () => {
  const p = previewPolicy(PREVIEWS.production);
  assert.deepEqual(p.themes, INSPECTION_POLICY);
  assert.deepEqual(p.hidden, HIDDEN_POLICY.mushroom);
  for (const cand of [false, true]) {
    assert.equal(JSON.stringify(previewManifest(manifest, PREVIEWS.production, { allowCandidates: cand })), JSON.stringify(applyInspectionPolicy(manifest, INSPECTION_POLICY, { allowCandidates: cand })));
    assert.deepEqual(applyHiddenPolicy(hidden, p.hidden, { allowCandidates: cand }), applyHiddenPolicy(hidden, HIDDEN_POLICY.mushroom, { allowCandidates: cand }));
  }
  assert.deepEqual(previewThemeIndices(PREVIEWS.production), [0, 1, 2, 3, 4]);
  assert.equal(previewNote(PREVIEWS.production, previewManifest(manifest, PREVIEWS.production)), null);
});
test("scenes-lowres: zero tile variants anywhere, hidden pyramid off, plates untouched", () => {
  const out = previewManifest(manifest, PREVIEWS["scenes-lowres"]);
  assert.equal(allTiles(out).length, 0);
  assert.equal(allTiles(previewManifest(manifest, PREVIEWS["scenes-lowres"], { allowCandidates: true })).length, 0, "query flag cannot re-enable tiles");
  assert.equal(applyHiddenPolicy(hidden, previewPolicy(PREVIEWS["scenes-lowres"]).hidden, { allowCandidates: true }).length, 0);
  assert.equal(images(out), images(manifest));
  assert.equal(previewNote(PREVIEWS["scenes-lowres"], out), null);
});
test("scenes-250mp: Blue serves legacy-201mp only; other four themes plate-only; honest note", () => {
  const out = previewManifest(manifest, PREVIEWS["scenes-250mp"]);
  assert.deepEqual(heroFamilies(out, "blue"), ["legacy-201mp"]);
  for (const t of ["day", "white", "dark", "night"]) assert.deepEqual(heroFamilies(out, t), [], t);
  assert.equal(Math.max(...tiles(out.frames[0].assets.blue).map((v) => v.width)), 11584);
  assert.equal(applyHiddenPolicy(hidden, previewPolicy(PREVIEWS["scenes-250mp"]).hidden).length, 0, "no 1GP mushroom in the 201MP preview");
  assert.equal(images(out), images(manifest));
  assert.equal(previewNote(PREVIEWS["scenes-250mp"], out), "250MP: Blue only; 4 renders pending");
});
test("scenes-gigapixel: every theme serves the 1GP family (policy overridden), mushroom too; not-scene-matched note", () => {
  const out = previewManifest(manifest, PREVIEWS["scenes-gigapixel"]);
  for (const t of THEME_IDS) {
    assert.deepEqual(heroFamilies(out, t), ["gp-1gp"], t);
    assert.equal(Math.max(...tiles(out.frames[0].assets[t]).map((v) => v.width)), 25820, t);
  }
  assert.equal(applyHiddenPolicy(hidden, previewPolicy(PREVIEWS["scenes-gigapixel"]).hidden).length, hidden.length);
  assert.equal(images(out), images(manifest));
  assert.equal(previewNote(PREVIEWS["scenes-gigapixel"], out), "1GP source: not scene-matched");
  assert.equal(INSPECTION_POLICY.white.status, "disabled", "production policy object not mutated");
});
test("mushroom mode (engine path kept): one moss scene = moss plate + its 1GP pyramid, single theme index, no story", () => {
  const cfg = { id: "mushroom-single", scenes: "mushroom", story: false, zoom: "1gp" };
  const pyramid = applyHiddenPolicy(hidden, previewPolicy(cfg).hidden);
  assert.equal(pyramid.length, 5);
  const plate = { url: "/preview-scene/sequence/hidden/night-moss.png", width: 768, height: 1152 };
  const scene = mushroomScene(previewManifest(manifest, cfg), plate, pyramid);
  assert.equal(scene.frames.length, 1);
  assert.equal(scene.frames[0].id, "p0000000");
  assert.deepEqual(scene.reducedMotion, [{ from: 0, frameId: "p0000000" }]);
  const [index] = previewThemeIndices(cfg);
  assert.deepEqual(previewThemeIndices(cfg), [index]);
  assert.equal(scene.defaultTheme, THEME_IDS[index]);
  for (const t of THEME_IDS) {
    const v = scene.frames[0].assets[t];
    assert.deepEqual(v.filter(isImage), [plate], t);
    assert.deepEqual(heroFamilies(scene, t), ["gp-1gp"]);
    assert.ok(tiles(v).every((x) => x.tiles.urlTemplate.includes("/mushroom/")));
    assert.deepEqual(v.map((x) => x.width), [...v.map((x) => x.width)].sort((a, b) => a - b), "ascending widths");
  }
  assert.equal(cfg.story, false);
  assert.equal(previewNote(cfg, scene), null, "mushroom 1GP is scene-matched (audit dE 0.9-1.6)");
});
test("gigapixel-single (owner 2026-09-30): White alone, 1GP family only, no story, honest note", () => {
  const cfg = PREVIEWS["gigapixel-single"];
  assert.deepEqual(previewThemeIndices(cfg), [THEME_IDS.indexOf("white")]);
  const out = previewManifest(manifest, cfg);
  assert.deepEqual(heroFamilies(out, "white"), ["gp-1gp"]);
  assert.equal(cfg.story, false);
  assert.equal(previewNote(cfg, out), "1GP source: not scene-matched");
});
test("themes outside a preview's scenes serve NO tile variants (no probes/requests for scenes the page can't show)", () => {
  const cfg = PREVIEWS["gigapixel-single"];
  const out = previewManifest(manifest, cfg);
  for (const t of THEME_IDS.filter((id) => !cfg.scenes.includes(id))) {
    for (const f of out.frames) assert.deepEqual(tiles(f.assets[t]), [], `${t} ${f.id} still lists tiles`);
    assert.equal(images(out).length > 0, true);
  }
  const all = previewManifest(manifest, PREVIEWS["scenes-gigapixel"]);
  assert.ok(THEME_IDS.every((t) => heroFamilies(all, t).includes("gp-1gp")), "full-scene previews keep every theme's tiles");
});
test("start theme: the manifest default when shown, else the preview's first scene; the store starts there", () => {
  assert.equal(MANIFEST_DEFAULT_THEME, manifest.defaultTheme, "MANIFEST_DEFAULT_THEME drifted from manifest.json");
  assert.equal(previewStartTheme(PREVIEWS.production), THEME_IDS.indexOf(manifest.defaultTheme));
  assert.equal(previewStartTheme(PREVIEWS["gigapixel-single"]), THEME_IDS.indexOf("white"));
  const start = previewStartTheme(PREVIEW), s = snapshot(); // before any configure(): what the first frame shows
  assert.deepEqual([s.theme, s.target, s.presented], [start, start, start]);
});
test("store: theme range limits drag/select and default; full range restores production", () => {
  const parsedLike = { ...manifest, defaultTheme: "blue" };
  setThemeRange([4]);
  configure(parsedLike);
  assert.equal(snapshot().theme, 4, "default theme not in range falls back to the first allowed");
  dragTheme(0.3); assert.equal(snapshot().theme, 4);
  selectTheme("day"); assert.equal(snapshot().target, 4, "disallowed theme ignored");
  setThemeRange([1, 2, 3]);
  configure(parsedLike);
  assert.equal(snapshot().theme, 2);
  dragTheme(-5); assert.equal(snapshot().theme, 1);
  dragTheme(9); assert.equal(snapshot().theme, 3);
  setThemeRange([0, 1, 2, 3, 4]);
  configure(parsedLike);
  dragTheme(-5); assert.equal(snapshot().theme, 0);
  dragTheme(9); assert.equal(snapshot().theme, 4);
});
test("store: a theme animation whose first rAF timestamp predates the call never leaves the theme range", () => {
  setThemeRange([0, 1, 2, 3, 4]);
  configure({ ...manifest, defaultTheme: "day" });
  const frames = [];
  const raf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => { frames.push(cb); return frames.length; };
  try {
    const t0 = performance.now();
    selectTheme("white");
    frames.shift()(t0 - 12); // rAF timestamps are frame-start times and can be earlier than the call
    assert.ok(snapshot().theme >= 0 && snapshot().theme <= 1, `theme ${snapshot().theme} left [0,1]`);
    configure({ ...manifest, defaultTheme: "night" });
    selectTheme("dark");
    frames.at(-1)(performance.now() - 12);
    assert.ok(snapshot().theme >= 3 && snapshot().theme <= 4, `theme ${snapshot().theme} left [3,4]`);
  } finally { globalThis.requestAnimationFrame = raf; }
});
console.log(`preview-config-contracts: ${n} passed`);
