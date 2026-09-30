#!/usr/bin/env node
/** Story pacing contract (run with --import ./scripts/register-ts-resolve.mjs).
 * On-screen motion per page px of scroll, from the measured plate-to-plate optical flow (scripts/assets/story-motion.json),
 * must be even inside each authored segment: no 10x jolts between neighbouring spans (owner: "shaky and messy").
 *  P1 map is monotone, (0,0)..(1,1), storyAt(scrollAt(p)) == p.
 *  P2 phase anchors are fixed points (hero hold end .08, jump .30, landing .56, explode .62, inspection .84, final hold .92).
 *  P3 inside 0.08-0.30, 0.30-0.56 and 0.62-0.84: coefficient of variation of on-screen speed <= 0.15, neighbour ratio <= 2. */
import assert from "node:assert/strict";
import fs from "node:fs";
const { storyAt, scrollAt, KNOTS } = await import("../lib/sequence/pacing.ts");
const manifest = JSON.parse(fs.readFileSync(new URL("../public/preview-scene/sequence/manifest.json", import.meta.url)));
const motion = JSON.parse(fs.readFileSync(new URL("./assets/story-motion.json", import.meta.url)));
const P = new Map(manifest.frames.map((f) => [f.id, f.progress]));
const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

for (let i = 1; i < KNOTS.length; i++) check(KNOTS[i][0] > KNOTS[i - 1][0] && KNOTS[i][1] > KNOTS[i - 1][1], `knot ${i} not strictly increasing`);
check(storyAt(0) === 0 && storyAt(1) === 1, "map must run (0,0)..(1,1)");
for (let p = 0; p <= 1.0001; p += 0.01) check(Math.abs(storyAt(scrollAt(p)) - p) < 1e-9, `round trip at ${p.toFixed(2)}`);
for (const a of [0.08, 0.3, 0.56, 0.62, 0.84, 0.92]) check(Math.abs(storyAt(a) - a) < 1e-9, `anchor ${a} moved to ${storyAt(a).toFixed(4)}`);

const report = {};
for (const [lo, hi] of [[0.08, 0.3], [0.3, 0.56], [0.62, 0.84]]) {
  const speeds = motion.steps.filter((s) => P.get(s.from) >= lo - 1e-9 && P.get(s.to) <= hi + 1e-9)
    .map((s) => s.p90 / Math.max(1e-9, scrollAt(P.get(s.to)) - scrollAt(P.get(s.from))));
  assert(speeds.length >= 3, `segment ${lo}-${hi} has plates`);
  const mean = speeds.reduce((a, b) => a + b, 0) / speeds.length;
  const cv = Math.sqrt(speeds.reduce((a, b) => a + (b - mean) ** 2, 0) / speeds.length) / mean;
  const ratio = Math.max(...speeds.slice(1).map((s, i) => Math.max(s, speeds[i]) / Math.min(s, speeds[i])));
  report[`${lo}-${hi}`] = { spans: speeds.length, cv: +cv.toFixed(3), maxNeighbourRatio: +ratio.toFixed(2) };
  check(cv <= 0.15, `segment ${lo}-${hi}: speed CV ${cv.toFixed(3)} > 0.15`);
  check(ratio <= 2, `segment ${lo}-${hi}: neighbour speed ratio ${ratio.toFixed(2)} > 2`);
}
console.log(JSON.stringify(report));
for (const f of fails) console.log("FAIL:", f);
process.exit(fails.length ? 1 : 0);
