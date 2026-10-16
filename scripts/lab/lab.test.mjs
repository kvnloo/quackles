// node --test scripts/lab/lab.test.mjs — pure checks for the lab receipt/tape/aggregation contract (#53).
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
import { checkReceipt, frameStats, METRIC_KEYS, percentile, RECEIPT_SCHEMA, sourceFamilies, stableStringify, summarize, tapeHash, validateTape } from "./lib.mjs";

const tape = JSON.parse(fs.readFileSync(new URL("./tapes/smoke-inspect.json", import.meta.url), "utf8"));

test("percentile is nearest-rank and null on no samples", () => {
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5, 1, 3, 2, 4], 50), 3);
  assert.equal(percentile([1, 2, 3, 4, 100], 95), 100);
  assert.equal(percentile([1, NaN, 2], 100), 2);
});

test("tape hash ignores key order but not content", () => {
  const reordered = JSON.parse(stableStringify(tape));
  assert.equal(tapeHash(reordered), tapeHash(tape));
  const edited = structuredClone(tape);
  edited.steps[1].zoom = 5;
  assert.notEqual(tapeHash(edited), tapeHash(tape));
});

test("shipped tape is valid; bad tapes are refused", () => {
  assert.equal(validateTape(tape), tape);
  assert.throws(() => validateTape({ ...tape, steps: [{ t: 10, action: "wait" }, { t: 5, action: "wait" }] }), /non-decreasing/);
  assert.throws(() => validateTape({ ...tape, steps: [{ t: 0, action: "teleport" }] }), /unknown action/);
  assert.throws(() => validateTape({ ...tape, steps: [{ t: 0, action: "wheel", x: 1.5 }] }), /frame fraction/);
});

test("frame stats drop hidden-page gaps and count tails", () => {
  const ts = [0, 16, 32, 82, 99, 5000, 5016];
  const s = frameStats(ts);
  assert.equal(s.frames, 5);
  assert.equal(s.droppedIntervals, 1);
  assert.equal(s.maxFrameMs, 50);
  assert.equal(s.framesOver33Ms, 1);
  assert.equal(s.framesOver50Ms, 0);
  assert.equal(frameStats([1]).rafP95Ms, null);
});

test("source families separate legacy and gp tiers", () => {
  assert.deepEqual(sourceFamilies(["/quackles-assets/blue/p0000000/0/1_2.webp", "/quackles-assets/blue/p0000000/1/0_0.webp"]), ["blue/p0000000"]);
  assert.deepEqual(sourceFamilies(["/quackles-assets/blue/p0000000/gp/3/0_0.webp", "/quackles-assets/blue/p0000000/0/0_0.webp", "/sequence/x.webp"]), ["blue/p0000000", "blue/p0000000/gp"]);
});

const receipt = (over = {}) => ({
  schema: RECEIPT_SCHEMA, runId: "r", branch: "nightly", sha: "a".repeat(40), status: "PASS",
  fixture: {}, environment: { profile: "desktop" }, scenario: { id: "s" }, validation: { passed: [], failed: [], notRun: [] },
  metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, 1])), metricNotes: {}, ...over,
});

test("receipts need full SHAs and a reason for every null metric", () => {
  assert.deepEqual(checkReceipt(receipt()), []);
  assert.match(checkReceipt(receipt({ sha: "abc123" })).join(), /full 40-hex/);
  const nulled = receipt();
  nulled.metrics.timeToSharpMs = null;
  assert.match(checkReceipt(nulled).join(), /timeToSharpMs is null without a reason/);
  nulled.metricNotes.timeToSharpMs = "not reached";
  assert.deepEqual(checkReceipt(nulled), []);
  const fake = receipt();
  fake.metrics.score = 99;
  assert.match(checkReceipt(fake).join(), /unknown metric score/);
});

test("summary never turns NOT RUN into numbers and never merges SHAs", () => {
  const ran = receipt({ metrics: { ...receipt().metrics, rafP95Ms: 20 } });
  const ran2 = receipt({ metrics: { ...receipt().metrics, rafP95Ms: 40 } });
  const skipped = receipt({ status: "NOT RUN", sha: "b".repeat(40), metrics: { ...receipt().metrics, rafP95Ms: 0 }, validation: { passed: [], failed: [], notRun: ["build failed"] } });
  const cells = summarize([ran, ran2, skipped]);
  assert.equal(cells.length, 2);
  assert.deepEqual(cells[0].stats.rafP95Ms, { median: 20, min: 20, max: 40, n: 2 });
  assert.equal(cells[1].status, "NOT RUN");
  assert.equal(cells[1].stats.rafP95Ms, null);
  assert.deepEqual(cells[1].notRunReasons, ["build failed"]);
  const missingAssets = receipt({ status: "NOT RUN", validation: { passed: [], failed: ["no-http-errors: 404"], notRun: ["assets missing"] } });
  assert.deepEqual(summarize([missingAssets])[0].failures, []);
  const failed = summarize([ran, receipt({ status: "FAIL", validation: { passed: [], failed: ["no-blank-polls: 3 polls"], notRun: [] } })]);
  assert.equal(failed[0].status, "FAIL");
});
