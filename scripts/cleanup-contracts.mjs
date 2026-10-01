#!/usr/bin/env node
// Behaviour-neutral cleanup contracts:
//  - the unmounted CinematicHandoffController and its data-cinematic-phase CSS are gone;
//  - SequencePlayer no longer keeps write-only `settled` / `inspectionSettled` flags;
//  - one camera helper (lib/sequence/camera-zoom.ts) owns the 1.02 "zoomed in" threshold and the
//    hero touch-action / overscroll policy, and nothing else hard-codes either.
// Run: node --import ./scripts/register-ts-resolve.mjs scripts/cleanup-contracts.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let n = 0, failed = 0;
const test = async (name, fn) => {
  try { await fn(); n++; console.log("PASS", name); } catch (e) { failed++; console.log("FAIL", name, "-", e.message); }
};

await test("CinematicHandoffController is removed", () => {
  assert.ok(!fs.existsSync(path.join(root, "components/experience/CinematicHandoffController.tsx")));
});
await test("no dead data-cinematic-phase / cinematic-live-rig CSS", () => {
  const css = read("app/globals.css");
  assert.ok(!css.includes("data-cinematic-phase"), "data-cinematic-phase selector still present");
  assert.ok(!css.includes("cinematic-live-rig"), "cinematic-live-rig rule still present");
});
await test("SequencePlayer has no write-only settled / inspectionSettled flags", () => {
  const src = read("components/sequence/SequencePlayer.tsx");
  assert.ok(!/\binspectionSettled\b/.test(src), "inspectionSettled still declared");
  assert.ok(!/\bsettled\s*=/.test(src), "settled still assigned");
});
await test("1.02 zoom threshold lives only in the camera helper", () => {
  for (const f of ["components/sequence/HeroInspection.tsx", "components/sequence/SequenceFrame.tsx",
    "components/sequence/SequencePlayer.tsx", "components/sequence/InspectionViewfinder.tsx"]) {
    assert.ok(!/\b1\.02\b/.test(read(f)), `${f} still hard-codes 1.02`);
  }
});
await test("touch-action is set in one place (helper policy via SequenceFrame), not duplicated in CSS", () => {
  const css = read("app/globals.css");
  assert.ok(!/\.poster-frame\[data-inspecting="true"\]\s*\{\s*touch-action/.test(css), "duplicate data-inspecting touch-action CSS rule");
  const frame = read("components/sequence/SequenceFrame.tsx");
  assert.ok(/heroTouchPolicy/.test(frame), "SequenceFrame does not use heroTouchPolicy");
  assert.ok(!/["']pan-y["']/.test(frame) && !/touchAction = zoomed/.test(frame), "SequenceFrame still decides touch-action inline");
});

let helper = null;
await test("camera helper module loads", async () => { helper = await import("../lib/sequence/camera-zoom.ts"); });
if (helper) {
  const { ZOOMED_IN_THRESHOLD, isZoomedIn, heroZoomed, heroTouchPolicy } = helper;
  await test("threshold is 1.02 and strictly-greater", () => {
    assert.equal(ZOOMED_IN_THRESHOLD, 1.02);
    assert.equal(isZoomedIn(1.02), false);
    assert.equal(isZoomedIn(1.0200001), true);
    assert.equal(isZoomedIn(1), false);
    assert.equal(isZoomedIn(4), true);
  });
  await test("heroZoomed: current or target zoom above threshold", () => {
    assert.equal(heroZoomed({ zoom: 1, targetZoom: 1 }), false);
    assert.equal(heroZoomed({ zoom: 1.5, targetZoom: 1 }), true);
    assert.equal(heroZoomed({ zoom: 1, targetZoom: 1.03 }), true);
    assert.equal(heroZoomed({ zoom: 1.02, targetZoom: 1.02 }), false);
  });
  await test("heroTouchPolicy: camera owns touches when zoomed or active, else native pan-y", () => {
    assert.deepEqual(heroTouchPolicy({ zoom: 1, targetZoom: 1, active: false }), { touchAction: "pan-y", overscrollBehavior: "" });
    assert.deepEqual(heroTouchPolicy({ zoom: 1, targetZoom: 1, active: true }), { touchAction: "none", overscrollBehavior: "none" });
    assert.deepEqual(heroTouchPolicy({ zoom: 1, targetZoom: 2, active: false }), { touchAction: "none", overscrollBehavior: "none" });
    assert.deepEqual(heroTouchPolicy({ zoom: 1.021, targetZoom: 1, active: false }), { touchAction: "none", overscrollBehavior: "none" });
  });
}
console.log(`${n} passed, ${failed} failed`);
if (failed) process.exit(1);
