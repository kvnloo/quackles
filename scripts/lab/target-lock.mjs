/** Fail-closed experimental intent contract (#53). No external dependencies. */
import fs from "node:fs";

const SHA = /^[0-9a-f]{40}$/;
const GP_BRANCH = /^preview\/(?:gigapixel-single|gp-|rfc-002-refine|scenes-gigapixel)/;
const fail = (reasons) => { if (reasons.length) throw new Error("TARGET_LOCK_INVALID:\n- " + reasons.join("\n- ")); };

export function isGigapixelRef(ref) { return GP_BRANCH.test(ref); }

export function loadTargetLock(path) {
  const lock = JSON.parse(fs.readFileSync(path, "utf8"));
  const refs = [lock?.control, ...(lock?.candidates ?? [])];
  const errors = [];
  if (lock?.schema !== "quackles.target-lock.v1") errors.push("unsupported lock schema");
  if (!lock?.id || !lock?.userObjective) errors.push("missing objective identity");
  if (refs.length < 2 || refs.some((x) => !x?.ref || !SHA.test(x?.sha ?? ""))) errors.push("invalid pinned control/candidates");
  if (new Set(refs.map((x) => x.ref)).size !== refs.length) errors.push("duplicate pinned refs");
  if (!SHA.test(lock?.assets?.sha ?? "")) errors.push("missing pinned asset SHA");
  const f = lock?.assets?.fixture;
  if (!f?.preview || !f?.sourceFamily || !f?.tilePathPrefix || !Number.isInteger(f?.width) || !Number.isInteger(f?.height)) errors.push("missing canonical live fixture");
  fail(errors);
  return lock;
}

/** Verify before building/attaching Chrome. Every trial cohort must contain the requested control and a candidate. */
export function checkPlan(lock, { refs, resolved, assetsSha, assetsDirty, explicitRefs }) {
  const errors = [];
  const control = lock.control.ref;
  const allowed = new Map([lock.control, ...lock.candidates].map((a) => [a.ref, a.sha]));
  if (!explicitRefs) errors.push("--refs omitted; implicit defaults are forbidden");
  if (refs.length < 2) errors.push("must compare target control with at least one distinct target candidate");
  if (!refs.includes(control)) errors.push("missing GP control " + control);
  if (!refs.some((r) => r !== control && allowed.has(r))) errors.push("no GP scheduling candidate selected");
  if (new Set(refs).size !== refs.length) errors.push("duplicate --refs");
  for (const ref of refs) if (!allowed.has(ref)) errors.push("unrequested ref " + ref + "; no silent main/nightly/other substitution");
  if (assetsSha !== lock.assets.sha || assetsDirty) errors.push("wrong or dirty assets: need " + lock.assets.sha);
  if (!Array.isArray(resolved) || resolved.length !== refs.length) errors.push("resolved refs missing");
  else for (const { ref, sha } of resolved) {
    if (allowed.get(ref) !== sha) errors.push("head drift for " + ref + ": got " + sha + "; inspect diff before editing pinned lock");
  }
  return errors;
}

/** Check what browser actually rendered, not just which repo worktree was used. */
export function checkRuntime(lock, { branch, sha, preview, assetPaths, fixture, assetsSha }) {
  const errors = [];
  const allowed = new Map([lock.control, ...lock.candidates].map((a) => [a.ref, a.sha]));
  const f = lock.assets.fixture;
  if (allowed.get(branch) !== sha) errors.push("unexpected executing branch/SHA " + branch + "@" + sha);
  if (assetsSha !== lock.assets.sha) errors.push("asset revision mismatch: " + assetsSha);
  if (preview !== f.preview) errors.push("live app preview " + JSON.stringify(preview) + " != " + f.preview);
  const tilePaths = (assetPaths ?? []).filter((p) => p.includes("/quackles-assets/"));
  if (!tilePaths.some((p) => p.startsWith(f.tilePathPrefix))) errors.push("no observed " + f.tilePathPrefix + " tile fetch; main/201MP/no-tile is not GP evidence");
  if (tilePaths.some((p) => !p.startsWith(f.tilePathPrefix))) errors.push("different-master/mixed-family tile request observed");
  if (fixture?.sourceFamily !== f.sourceFamily) errors.push("fixture family " + fixture?.sourceFamily + " != " + f.sourceFamily);
  if (fixture?.width !== f.width || fixture?.height !== f.height) errors.push("fixture dimensions " + fixture?.width + "x" + fixture?.height + " != " + f.width + "x" + f.height);
  if (fixture?.tileSize !== f.tileSize) errors.push("tile size " + fixture?.tileSize + " != " + f.tileSize);
  return errors;
}

/** Replay assistant handoffs: refuse a new prompt that loses the originally requested branch cohort. */
export function checkHandoff(lock, handoff) {
  const errors = [];
  for (const item of [lock.control, ...lock.candidates]) if (!handoff.includes(item.ref)) errors.push("handoff omitted " + item.ref);
  if (!handoff.includes("--refs")) errors.push("handoff did not require explicit --refs");
  if (!handoff.includes("--target-lock")) errors.push("handoff did not require executable --target-lock");
  if (!/abort|invalid|fail closed|not run/i.test(handoff)) errors.push("handoff does not define mismatch failure");
  if (!handoff.includes(lock.assets.fixture.sourceFamily)) errors.push("handoff omitted required runtime source identity");
  return errors;
}
