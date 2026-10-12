#!/usr/bin/env node
/**
 * Quackles Lab branch registry (#53, Phase 0). Read-only: lists remote refs, never checks out, merges or rewrites them.
 *
 *   node scripts/lab/inventory.mjs                 # writes experiments/branches.json
 *   REMOTE=github OUT=- node scripts/lab/inventory.mjs
 *
 * Every field comes from git metadata at the resolved SHA. Build/run status stays "not-verified" here: only a
 * scripts/lab/run.mjs receipt can say a ref built or ran.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REMOTE = process.env.REMOTE || "origin";
const CONTROL = process.env.CONTROL || "nightly";
const OUT = process.env.OUT || "experiments/branches.json";
const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20 }).trim();
const tryGit = (...args) => {
  try { return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return null; }
};

// Lanes and hypotheses as written in #53. A name is a hypothesis, not proof of behavior.
const LANES = [
  [/^nightly$/, "production-control", "Current product control (#41/#50 product authority)."],
  [/^dev$/, "production-control", "Integration branch; compare against nightly, not a control by itself."],
  [/^main$/, "infrastructure", "Pages publisher / five low-res scenes (v0 feel build); infrastructure, NOT the product control."],
  [/^fix\/direct-touch-p0-resume-20261008$/, "input", "Direct touch owns the camera during contact (#50 D). PR #52 was closed unmerged: not landed."],
  [/^preview\/scenes-(lowres|250mp|gigapixel)$/, "source-lod", "Quality/bytes/response vs source size and scene continuity."],
  [/^preview\/gigapixel-single$/, "source-lod", "Single 1GP source family per scene (candidate pyramid, not production-quality Blue)."],
  [/^preview\/gp-motion-decode$/, "gp-scheduling", "Decode during camera motion."],
  [/^preview\/gp-net6$/, "gp-scheduling", "Network concurrency 6."],
  [/^preview\/gp-settle$/, "gp-scheduling", "Settle detection before refinement."],
  [/^preview\/gp-all$/, "gp-scheduling", "Combination of GP changes: a combo control, not proof each component helped."],
  [/^preview\/rfc-002-refine$/, "gp-scheduling", "Async refinement (RFC-002)."],
  [/^preview\/(touch-pan|scroll-feel|scroll-native-wheel|scroll-boost|scroll-beats|scroll-short|cleanup)$/, "input-scroll", "Finger-to-camera latency, reversals, pacing, state integrity."],
  [/^preview\/(blue-chrome|chromecast)$/, "visual-other", "Separate visual/cast suites; not part of the GP performance ranking."],
  [/^preview\/rfc-00[135]-/, "independent-research", "RFC spike; report separately, never in a single-score ranking."],
];
const EXCLUDED = [
  [/^ci\/avrea-cache-pilot$/, "excluded: CI cache pilot, not a renderer (#53)"],
  [/^dependabot\//, "excluded: Dependabot dependency bump (#53)"],
  [/^claude\//, "excluded: harness branch (this lab), not an experiment"],
];
const SEPARATE_SUITE = new Set(["visual-other", "independent-research", "infrastructure"]);

// Existing harnesses #53 asks us to reuse before adding anything new.
const HARNESSES = [
  "scripts/inspection-browser.mjs", "scripts/gigapixel-feel-browser.mjs", "scripts/touch-input-browser.mjs",
  "scripts/scroll-feel-browser.mjs", "scripts/fps-harness.mjs", "scripts/static-server.mjs",
];

// Historical control candidates named by the owner's commit audit on #50. Candidates only: no owner-accepted screenshot
// or device evidence is attached here, and PR #52 (direct touch) is closed and unmerged.
const CONTROL_CANDIDATES = [
  { id: "Q0", commit: "17132d9084c2d884842ef6a4ef01e9434a4544be", source: "#50 audit comment", note: "Sep 15 quiet native-scroll film (with f273c871). Predates the authored 5-theme sequence and deep inspection." },
  { id: "Q1", commit: "2d22784d3877e3838fe9eae280e34ba0bb51d13a", source: "#50 audit comment", note: "Sep 21: 16-frame reversible inspection (105c64c3) + Blue ~200MP DZI integration. 'Strongest runtime baseline' per the audit." },
  { id: "Q1-nightly-promotion", commit: "cd62cd66ecdd364a4d7508620113179645f2f131", source: "first-parent nightly, Sep 21", note: "'Promote merged PR #39 state to nightly': Q1 plus 5f11714 (map DZI variants to committed pyramid levels). Q1 (2d22784d) alone requests DZI levels quackles-assets never had (lab run: 404 on blue/p0000000/12/*)." },
  { id: "Q1-source-policy", commit: "dfc627d582ea7a0ad950ab24b59ebf7e6ff5d8c4", source: "#43", note: "One source family per theme; Blue uses the 201MP control. A correctness fix, not a feel control." },
];

const nameFromTrailer = (line) => line.replace(/^co-authored-by:\s*/i, "").replace(/\s*<[^>]*>\s*$/, "").trim();

function authorsOf(range) {
  const out = tryGit("log", "--no-merges", "--format=%an%x09%(trailers:key=Co-authored-by,valueonly,separator=%x1f)", range);
  const authors = new Map(), coAuthors = new Map();
  for (const line of (out || "").split("\n").filter(Boolean)) {
    const [name, trailers = ""] = line.split("\t");
    authors.set(name, (authors.get(name) || 0) + 1);
    for (const t of trailers.split("\x1f").map((s) => s.trim()).filter(Boolean)) {
      const n = nameFromTrailer(t);
      coAuthors.set(n, (coAuthors.get(n) || 0) + 1);
    }
  }
  const list = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name, commits]) => ({ name, commits }));
  return { authors: list(authors), coAuthors: list(coAuthors) };
}

function inventoryRef(ref, controlSha) {
  const full = `${REMOTE}/${ref}`;
  const sha = git("rev-parse", full);
  const [subject, committedAt, author, parents] = git("log", "-1", "--format=%s%x00%cI%x00%an%x00%P", sha).split("\0");
  const mergeBase = tryGit("merge-base", sha, controlSha);
  const [behind, ahead] = (tryGit("rev-list", "--left-right", "--count", `${controlSha}...${sha}`) || "0 0").split(/\s+/).map(Number);
  const changed = mergeBase ? (tryGit("diff", "--name-only", mergeBase, sha) || "").split("\n").filter(Boolean) : [];
  const areas = {};
  for (const p of changed) { const top = p.includes("/") ? p.split("/")[0] + "/" : p; areas[top] = (areas[top] || 0) + 1; }
  const files = new Set((tryGit("ls-tree", "-r", "--name-only", sha, "scripts", "docs", "package.json", "lib/preview.ts") || "").split("\n"));
  const harnesses = HARNESSES.filter((h) => files.has(h));
  const evidenceDocs = [...files].filter((f) => /^docs\/rfcs\/.*(results|notes)[^/]*\.md$/.test(f)).sort();
  // Reusable harnesses that hard-code private host paths (owner traces, local 1GP clones) cannot run from a fresh clone.
  const privatePaths = harnesses.length
    ? (tryGit("grep", "-l", "/mnt/zer0models", sha, "--", ...harnesses) || "").split("\n").filter(Boolean).map((l) => l.slice(sha.length + 1)).sort()
    : [];
  const pkg = JSON.parse(tryGit("show", `${sha}:package.json`) || "{}");
  const previewId = /PREVIEWS\["([^"]+)"\]/.exec(tryGit("show", `${sha}:lib/preview.ts`) || "")?.[1] ?? null;

  const lane = LANES.find(([re]) => re.test(ref));
  const excluded = EXCLUDED.find(([re]) => re.test(ref));
  const laneId = excluded ? "excluded" : lane?.[1] ?? "unclassified";
  const flags = [];
  if (excluded) flags.push("not-comparable");
  if (SEPARATE_SUITE.has(laneId)) flags.push("separate-suite");
  if (privatePaths.length) flags.push("harness-needs-private-paths");
  if (!harnesses.includes("scripts/static-server.mjs")) flags.push("no-static-server-script");
  return {
    ref, sha, sameShaAs: null, subject, committedAt, tipAuthor: author, parents: parents.split(" ").filter(Boolean),
    lane: laneId, hypothesis: excluded ? excluded[1] : lane?.[2] ?? null,
    vsControl: { control: CONTROL, mergeBase, ahead, behind, containsControl: behind === 0, inControl: ahead === 0 },
    // Credit: who wrote the commits this ref adds over the control (git author + Co-authored-by trailers).
    credit: authorsOf(`${controlSha}..${sha}`),
    changedPaths: { count: changed.length, areas, sample: changed.slice(0, 40) },
    tests: { harnesses, testScripts: Object.keys(pkg.scripts || {}).filter((k) => /^(test|report|verify)/.test(k)).length },
    previewId, evidenceDocs, privatePaths,
    status: { build: "not-verified", run: "not-verified", assets: privatePaths.length ? "missing-private (see privatePaths)" : "not-verified" },
    flags,
  };
}

const refs = git("for-each-ref", "--format=%(refname:strip=3)", `refs/remotes/${REMOTE}`).split("\n").filter((r) => r && r !== "HEAD").sort();
const controlSha = git("rev-parse", `${REMOTE}/${CONTROL}`);
const registry = {
  schema: "quackles-lab.branches.v1",
  issue: "https://github.com/kvnloo/quackles/issues/53",
  remote: REMOTE,
  control: { ref: CONTROL, sha: controlSha },
  inventoriedAt: new Date().toISOString(),
  note: "Inventory only. Branch names are hypotheses; build/run status is 'not-verified' until a lab receipt exists. Never merge or rewrite these refs for a ranking.",
  refs: refs.map((r) => inventoryRef(r, controlSha)),
  controlCandidates: CONTROL_CANDIDATES.map((c) => ({
    ...c,
    resolved: tryGit("rev-parse", "--verify", `${c.commit}^{commit}`),
    subject: tryGit("log", "-1", "--format=%s", c.commit),
    committedAt: tryGit("log", "-1", "--format=%cI", c.commit),
    inControl: tryGit("merge-base", "--is-ancestor", c.commit, controlSha) !== null,
    status: "candidate: not owner-accepted; no screenshot/device evidence attached",
  })),
};

// Two names on one SHA are one experiment cell, not two.
for (const r of registry.refs) r.sameShaAs = registry.refs.filter((o) => o !== r && o.sha === r.sha).map((o) => o.ref);

const json = JSON.stringify(registry, null, 2) + "\n";
if (OUT === "-") process.stdout.write(json);
else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  const lanes = {};
  for (const r of registry.refs) lanes[r.lane] = (lanes[r.lane] || 0) + 1;
  console.log(`${OUT}: ${registry.refs.length} refs at ${REMOTE}, control ${CONTROL}@${controlSha.slice(0, 12)}`, lanes);
}
