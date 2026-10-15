#!/usr/bin/env node
/**
 * Paired comparison of lab receipts (#53 research loop). Trials are paired by trial number within one run (same host
 * window, seeded random order), per mode/profile/scenario. For each metric: per-pair difference (candidate - base),
 * median difference, a seeded bootstrap 95% CI of that median, and the base's own run-to-run noise (MAD).
 * "beyondNoise" = CI excludes 0 AND |median diff| > base MAD. No verdicts here: the wave write-up decides.
 *
 *   node scripts/lab/compare.mjs results/<run-id> --base <sha|ref> --cand <sha|ref>[,<sha|ref>] [--out file.md] [--json file.json]
 */
import fs from "node:fs";
import path from "node:path";
import { median, RECEIPT_SCHEMA, round } from "./lib.mjs";

const dir = process.argv[2];
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
if (!dir || !arg("base") || !arg("cand")) {
  console.error("usage: node scripts/lab/compare.mjs results/<run-id> --base REF --cand REF[,REF] [--out FILE.md] [--json FILE.json]");
  process.exit(2);
}
const matches = (r, ref) => r.branch === ref || r.sha === ref || r.sha.startsWith(ref);
const receipts = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"))).filter((r) => r.schema === RECEIPT_SCHEMA);

// Metric getters: receipt metrics plus the attribution the runner records in extra.
const METRICS = {
  framesOver50Ms: (r) => r.metrics.framesOver50Ms,
  framesOver33Ms: (r) => r.metrics.framesOver33Ms,
  rafP95Ms: (r) => r.metrics.rafP95Ms,
  rafP99Ms: (r) => r.metrics.rafP99Ms,
  maxFrameMs: (r) => r.metrics.maxFrameMs,
  inputToCameraMs: (r) => r.metrics.inputToCameraMs,
  timeToSharpMs: (r) => r.metrics.timeToSharpMs,
  detailPaints: (r) => r.extra?.detailPaints?.n,
  detailPaintsAtRest: (r) => r.extra?.detailPaints?.atRest,
  detailPaintsMoving: (r) => r.extra?.detailPaints?.whileMoving,
  longFramesWithPaint: (r) => r.extra?.detailPaints?.longFramesWithPaint,
  loafScriptMs: (r) => r.extra?.loaf?.scriptMs,
  decodes: (r) => r.extra?.measuredApp?.decodes,
  requests: (r) => r.metrics.requests,
  decodedPeakBytes: (r) => r.metrics.decodedPeakBytes,
  blankFrames: (r) => r.metrics.blankFrames,
  // Q1: whole measured run, the 30 s stationary hold after refinement, and the story-scroll phases.
  runRedecodes: (r) => r.extra?.run?.perAsset?.redecodes,
  runMaxDecodesPerAsset: (r) => r.extra?.run?.perAsset?.maxPerAsset,
  runProcessCpuMs: (r) => r.extra?.run?.cpu?.processCpuMs,
  runMainThreadMs: (r) => r.extra?.run?.cpu?.mainThreadTaskMs,
  stationaryDecodes: (r) => r.extra?.stationary?.appDecodes,
  stationaryEvictions: (r) => r.extra?.stationary?.evictions,
  stationaryDetailPaints: (r) => r.extra?.stationary?.detailPaints,
  stationaryProcessCpuMs: (r) => r.extra?.stationary?.cpu?.processCpuMs,
  stationaryOver33Ms: (r) => r.extra?.stationary?.framesOver33Ms,
  refineSettleMs: (r) => r.extra?.settles?.find((x) => x.label === "refined")?.waitedMs,
  scrollFwdP95Ms: (r) => r.extra?.phases?.find((x) => x.from === "scroll-forward")?.rafP95Ms,
  scrollFwdMaxMs: (r) => r.extra?.phases?.find((x) => x.from === "scroll-forward")?.maxFrameMs,
  scrollRevP95Ms: (r) => r.extra?.phases?.find((x) => x.from === "scroll-reverse")?.rafP95Ms,
  scrollRevMaxMs: (r) => r.extra?.phases?.find((x) => x.from === "scroll-reverse")?.maxFrameMs,
  scrollOver33Ms: (r) => { const ph = (r.extra?.phases ?? []).filter((x) => x.from === "scroll-forward" || x.from === "scroll-reverse"); return ph.length ? ph.reduce((a, x) => a + (x.framesOver33Ms ?? 0), 0) : null; },
};

function bootstrapMedianCI(diffs, seed = 53, n = 10000) {
  if (diffs.length < 2) return [null, null];
  let x = seed >>> 0;
  const rand = () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const meds = [];
  for (let b = 0; b < n; b++) meds.push(median(Array.from(diffs, () => diffs[Math.floor(rand() * diffs.length)])));
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(0.025 * n)], meds[Math.ceil(0.975 * n) - 1]];
}

const mad = (xs) => { const m = median(xs); return m == null ? null : median(xs.map((v) => Math.abs(v - m))); };

const base = arg("base"), cands = arg("cand").split(",");
const rows = [];
const groups = new Map();
for (const r of receipts) {
  if (r.status !== "PASS") continue;
  const k = [r.scenario?.id, r.scenario?.mode ?? "A", r.environment?.profile].join("|");
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(r);
}
for (const [k, rs] of groups) {
  const [scenario, mode, profile] = k.split("|");
  const byTrial = (ref) => new Map(rs.filter((r) => matches(r, ref)).map((r) => [r.trial, r]));
  const b = byTrial(base);
  for (const cand of cands) {
    const c = byTrial(cand);
    const trials = [...b.keys()].filter((t) => c.has(t)).sort((x, y) => x - y);
    for (const [name, get] of Object.entries(METRICS)) {
      const pairs = trials.map((t) => [get(b.get(t)), get(c.get(t))]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (!pairs.length) continue;
      const diffs = pairs.map(([x, y]) => y - x), baseVals = pairs.map(([x]) => x);
      const [lo, hi] = bootstrapMedianCI(diffs);
      const md = median(diffs), noise = mad(baseVals);
      rows.push({
        scenario, mode, profile, cand: c.values().next().value?.branch ?? cand, candSha: c.values().next().value?.sha, metric: name, n: pairs.length,
        baseMedian: round(median(baseVals)), candMedian: round(median(pairs.map(([, y]) => y))), medianDiff: round(md),
        ci95: [round(lo), round(hi)], baseMAD: round(noise),
        beyondNoise: lo != null && (lo > 0 || hi < 0) && Math.abs(md) > (noise ?? 0),
      });
    }
  }
}

const md = [
  `# Paired comparison: \`${path.basename(dir)}\``, "",
  `Base \`${base}\` vs ${cands.map((c) => `\`${c}\``).join(", ")}. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.`, "",
  "| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.scenario} | ${r.mode} | ${r.profile} | \`${r.cand}\` | ${r.metric} | ${r.n} | ${r.baseMedian} | ${r.candMedian} | ${r.medianDiff} | [${r.ci95.join(", ")}] | ${r.baseMAD} | ${r.beyondNoise ? "**yes**" : "no"} |`),
  "",
].join("\n");
if (arg("out")) fs.writeFileSync(arg("out"), md); else console.log(md);
if (arg("json")) fs.writeFileSync(arg("json"), JSON.stringify(rows, null, 1) + "\n");
