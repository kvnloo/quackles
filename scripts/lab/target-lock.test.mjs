import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { checkHandoff, checkPlan, checkRuntime, loadTargetLock } from "./target-lock.mjs";

const LOCK = loadTargetLock(new URL("../../experiments/locks/gigapixel-performance.json", import.meta.url));
const refs = [LOCK.control.ref, LOCK.candidates[0].ref];
const resolved = [LOCK.control, LOCK.candidates[0]];
const fixture = { ...LOCK.assets.fixture };
const good = { branch: LOCK.candidates[0].ref, sha: LOCK.candidates[0].sha,
  preview: fixture.preview, assetPaths: ["/quackles-assets/white/p0000000/gp/3/2_1.webp"],
  fixture, assetsSha: LOCK.assets.sha };

// Conversation replay: the earlier OMP prompt from this chat substituted a different experiment.
// The later correction named GP branches but still lacked an executable validation lock.
const badHandoff = "Own the Quackles physical-Android autoresearch lane. Compare nightly@71c9813a, W1 6f2ef5d2, Q1-C 1b637ed1, W2A-G 18bb1dec. Run 12 balanced paired trials.";
const weakCorrection = "STOP. Test preview/gigapixel-single, preview/gp-motion-decode, preview/gp-net6, preview/gp-settle, preview/gp-all, preview/rfc-002-refine with --refs. Do not use main. Abort if wrong fixture.";
const fixed = readFileSync(new URL("../../experiments/locks/OMP_HANDOFF.md", import.meta.url), "utf8");

test("REPLAY original OMP handoff must fail: user target substituted", () => {
  assert.match(checkHandoff(LOCK, badHandoff).join("\n"), /omitted preview\/gigapixel-single/);
});
test("REPLAY weak correction still fails without executable target lock", () => {
  assert.match(checkHandoff(LOCK, weakCorrection).join("\n"), /--target-lock/);
});
test("REPLAY corrected handoff preserves all named targets, lock and fail-closed policy", () => {
  assert.deepEqual(checkHandoff(LOCK, fixed), []);
});
test("RED default/main-only cannot become GP evidence", () => {
  const errors = checkPlan(LOCK, { refs: ["main"], resolved: [{ ref: "main", sha: "0".repeat(40) }],
    assetsSha: LOCK.assets.sha, explicitRefs: false });
  assert.match(errors.join("\n"), /implicit defaults|unrequested ref main/);
});
test("RED nightly + W2A repaint candidate is the wrong experiment", () => {
  const errors = checkPlan(LOCK, { refs: ["nightly", "lab/53-phone-w2ag-reconstructed"], resolved: [],
    assetsSha: LOCK.assets.sha, explicitRefs: true });
  assert.ok(errors.length >= 2);
});
test("RED head drift fails even with correct branch names", () => {
  const errors = checkPlan(LOCK, { refs, resolved: [resolved[0], { ...resolved[1], sha: "0".repeat(40) }],
    assetsSha: LOCK.assets.sha, explicitRefs: true });
  assert.match(errors.join("\n"), /head drift/);
});
test("GREEN exact GP control, variant and asset SHA pass plan", () => {
  assert.deepEqual(checkPlan(LOCK, { refs, resolved, assetsSha: LOCK.assets.sha,
    assetsDirty: false, explicitRefs: true }), []);
});
test("RED correct checkout but Chrome rendering production/main preview", () => {
  assert.match(checkRuntime(LOCK, { ...good, preview: "production" }).join("\n"), /live app preview/);
});
test("RED Blue 201MP fixture and zero tile requests cannot impersonate GP", () => {
  const wrong = checkRuntime(LOCK, { ...good, assetPaths: ["/quackles-assets/blue/p0000000/0/0_0.webp"],
    fixture: { sourceFamily: "blue/p0000000", width: 11584, height: 17376, tileSize: 512 } });
  assert.match(wrong.join("\n"), /no observed.*gp/);
  assert.match(checkRuntime(LOCK, { ...good, assetPaths: [] }).join("\n"), /no observed/);
});
test("GREEN exact live preview, tile identity, family and dimensions", () => {
  assert.deepEqual(checkRuntime(LOCK, good), []);
});
