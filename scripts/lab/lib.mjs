// Quackles Lab shared helpers (#53). Pure functions only: no browser, no git, no fs writes.
import { createHash } from "node:crypto";

export const RECEIPT_SCHEMA = "quackles-lab.receipt.v1";

/** Metric keys every receipt carries (issue #53). A null value needs a reason in `metricNotes`. */
export const METRIC_KEYS = [
  "rafP50Ms", "rafP95Ms", "rafP99Ms", "maxFrameMs", "framesOver33Ms", "framesOver50Ms",
  "firstCorrectVisualMs", "timeToSharpMs", "inputToCameraMs",
  "requests", "transferredBytes", "abortCount", "staleWorkCount",
  "blankFrames", "staleVisibleFrames", "sourcePops",
  "decodedPeakBytes", "gpuResidentBytesEstimate",
];

/** Nearest-rank percentile (same rule as scripts/fps-harness.mjs). Null for no samples. */
export function percentile(values, p) {
  const xs = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!xs.length) return null;
  return xs[Math.min(xs.length - 1, Math.max(0, Math.ceil((p / 100) * xs.length) - 1))];
}

export function median(values) {
  return percentile(values, 50);
}

/** JSON with sorted object keys, so equal content always hashes equal. */
export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export const tapeHash = (tape) => sha256(stableStringify(tape));

const TAPE_ACTIONS = new Set(["wait", "setTarget", "wheel", "touch", "mouseMove", "mark", "pageWheel", "settle"]);

/** Throws on a malformed tape (steps must already be in time order); returns the tape. */
export function validateTape(tape) {
  const errors = [];
  if (tape?.schema !== "quackles-lab.tape.v1") errors.push("schema must be quackles-lab.tape.v1");
  if (!tape?.id) errors.push("id is required");
  if (!Number.isInteger(tape?.seed)) errors.push("seed must be an integer");
  if (!Array.isArray(tape?.steps) || !tape.steps.length) errors.push("steps must be a non-empty array");
  let last = -1;
  let contacts = new Set();
  for (const [i, step] of (tape?.steps ?? []).entries()) {
    if (!TAPE_ACTIONS.has(step.action)) errors.push(`step ${i}: unknown action ${step.action}`);
    if (!Number.isFinite(step.t) || step.t < last) errors.push(`step ${i}: t must be finite and non-decreasing`);
    last = step.t;
    for (const k of ["x", "y", "vx", "vy"]) {
      if (k in step && !(step[k] >= 0 && step[k] <= 1)) errors.push(`step ${i}: ${k} must be a frame fraction in [0,1]`);
    }
    if (step.action === "touch") {
      const { type, points } = step;
      if (!["touchStart", "touchMove", "touchEnd", "touchCancel"].includes(type)) errors.push(`step ${i}: invalid touch type`);
      if (!Array.isArray(points)) { errors.push(`step ${i}: touch points must be an array`); continue; }
      const ids = new Set();
      for (const p of points) {
        if (!p || !Number.isInteger(p.id) || p.id < 0 || ids.has(p.id)) errors.push(`step ${i}: touch IDs must be unique non-negative integers`);
        ids.add(p?.id);
        if (!p || !["x", "y"].every((k) => Number.isFinite(p[k]) && p[k] >= 0 && p[k] <= 1)) errors.push(`step ${i}: touch coordinates must be finite frame fractions in [0,1]`);
      }
      if (type === "touchStart") {
        if (contacts.size || !ids.size) errors.push(`step ${i}: touchStart requires no active contacts and non-empty points`);
        contacts = ids;
      } else if (type === "touchMove") {
        if (!contacts.size || ids.size !== contacts.size || [...ids].some((id) => !contacts.has(id))) errors.push(`step ${i}: touchMove must retain all existing IDs; use touchEnd to release contacts`);
      } else if (type === "touchEnd" || type === "touchCancel") {
        if (!contacts.size) errors.push(`step ${i}: ${type} requires active contacts`);
        if (type === "touchCancel" && points.length) errors.push(`step ${i}: touchCancel requires empty points`);
        if ([...ids].some((id) => !contacts.has(id))) errors.push(`step ${i}: touchEnd can only release existing IDs`);
        // Legacy Chromium CDP supports nonempty touchEnd as the contacts to release.
        // The synthetic-pointer path rejects this request rather than preserving a false survivor.
        if (type === "touchCancel" || !ids.size) contacts.clear();
        else for (const id of ids) contacts.delete(id);
      }
    } else if (contacts.size && !["wait", "mark"].includes(step.action)) {
      errors.push(`step ${i}: only touch, wait and mark are allowed while contacts are active`);
    }
  }
  if (contacts.size) errors.push("tape ends with active touch contacts");
  if (errors.length) throw new Error(`invalid tape ${tape?.id ?? "?"}:\n  ${errors.join("\n  ")}`);
  return tape;
}

/** A replay must not accept an inspection target silently ignored while the story is scrolled. */
export function inspectionTargetMatches(requestedZoom, actualTargetZoom, maxZoom) {
  const expected = Math.min(requestedZoom, maxZoom ?? requestedZoom);
  return Number.isFinite(requestedZoom) && requestedZoom >= 1 && Number.isFinite(actualTargetZoom) && Math.abs(actualTargetZoom - expected) <= 1e-6;
}

/**
 * E proves page-scoped offline replay only with acknowledged emulation and complete CDP HTTP-cache evidence.
 * Request/fetch counts are attempts, not wire IO; even zero attempts needs confirmed offline controls.
 */
export function offlineReplayCoverage(evidence, requestCount) {
  const reasons = [];
  if (evidence?.networkEnabled !== true) reasons.push("CDP Network.enable was not acknowledged");
  if (evidence?.offlineAcknowledged !== true) reasons.push("CDP offline emulation was not acknowledged");
  if (evidence?.navigatorOnlineAtStart !== false) reasons.push("navigator.onLine was not false at measured start");
  if (evidence?.navigatorOnlineAtEnd !== false) reasons.push("navigator.onLine was not false at measured end");
  const requests = evidence?.requests ?? [];
  if (!Number.isInteger(requestCount) || requestCount !== requests.length) reasons.push(`request coverage mismatch: Playwright=${requestCount ?? "unknown"}, CDP=${requests.length}`);
  if (evidence?.pendingAtStart?.length) reasons.push(`${evidence.pendingAtStart.length} requests were still in flight at measured start`);
  for (const event of evidence?.unknownEvents ?? []) reasons.push(`unmatched ${event.event} for request ${event.requestId}`);
  for (const error of evidence?.observationErrors ?? []) reasons.push(error);
  let cacheServed = 0;
  for (const request of requests) {
    const label = `${request.requestId}/${request.hop} ${request.path ?? "[non-owned URL omitted]"}`;
    if (request.owned !== true) reasons.push(`${label}: request was not to the owned fixture origin`);
    if (request.failure) reasons.push(`${label}: failed (${request.failure.errorText ?? "unknown"})`);
    if (!request.completion) reasons.push(`${label}: completion not observed`);
    if (!request.response) reasons.push(`${label}: response not observed`);
    else if (!(request.response.status >= 200 && request.response.status < 400)) reasons.push(`${label}: HTTP status ${request.response.status}`);
    // A service-worker response is not proof of an HTTP-cache hit, even if another cache flag is present.
    const cached = request.servedFromCache === true || request.response?.fromDiskCache === true || request.response?.fromPrefetchCache === true;
    if (request.response?.fromServiceWorker === true) reasons.push(`${label}: service-worker response is not verified HTTP-cache service`);
    if (!cached) reasons.push(`${label}: no positive HTTP-cache evidence`);
    if (cached && request.owned === true && !request.failure && request.completion && request.response?.status >= 200 && request.response.status < 400 && request.response.fromServiceWorker !== true) cacheServed++;
  }
  return { valid: reasons.length === 0, cacheServed, requestCount: requests.length, reasons };
}

/** Frame intervals in ms. Keep long foreground stalls; the runner invalidates hidden-page trials separately. */
export function frameStats(timestamps) {
  const dts = [];
  let dropped = 0;
  for (let i = 1; i < timestamps.length; i++) {
    const dt = timestamps[i] - timestamps[i - 1];
    if (dt > 0) dts.push(dt);
    else dropped++;
  }
  return {
    frames: dts.length,
    droppedIntervals: dropped,
    rafP50Ms: round(percentile(dts, 50)),
    rafP95Ms: round(percentile(dts, 95)),
    rafP99Ms: round(percentile(dts, 99)),
    maxFrameMs: round(dts.length ? Math.max(...dts) : null),
    framesOver33Ms: dts.length ? dts.filter((d) => d > 33.4).length : null,
    framesOver50Ms: dts.length ? dts.filter((d) => d > 50).length : null,
  };
}

export function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Source families from requested asset paths: "/quackles-assets/<theme>/<plate>[/gp]/..." -> "<theme>/<plate>[/gp]". */
export function sourceFamilies(paths) {
  const families = new Set();
  for (const p of paths) {
    const m = /\/quackles-assets\/([^/]+)\/([^/]+)\/(gp\/)?/.exec(p);
    if (m) families.add(`${m[1]}/${m[2]}${m[3] ? "/gp" : ""}`);
  }
  return [...families].sort();
}

/** Every null metric must carry a reason; unknown metric keys are rejected. Returns a list of problems (empty = valid). */
export function checkReceipt(receipt) {
  const problems = [];
  if (receipt?.schema !== RECEIPT_SCHEMA) problems.push(`schema must be ${RECEIPT_SCHEMA}`);
  for (const k of ["branch", "sha", "runId", "status"]) if (!receipt?.[k]) problems.push(`${k} is required`);
  if (receipt?.sha && !/^[0-9a-f]{40}$/.test(receipt.sha)) problems.push("sha must be a full 40-hex commit SHA");
  if (!["PASS", "FAIL", "NOT RUN"].includes(receipt?.status)) problems.push(`status ${receipt?.status} is not PASS|FAIL|NOT RUN`);
  for (const k of ["fixture", "environment", "scenario", "metrics", "validation"]) {
    if (!receipt?.[k] || typeof receipt[k] !== "object") problems.push(`${k} object is required`);
  }
  const metrics = receipt?.metrics ?? {};
  for (const k of Object.keys(metrics)) if (!METRIC_KEYS.includes(k)) problems.push(`unknown metric ${k}`);
  for (const k of METRIC_KEYS) {
    if (!(k in metrics)) problems.push(`metric ${k} missing (use null + metricNotes reason)`);
    else if (metrics[k] === null && !receipt?.metricNotes?.[k]) problems.push(`metric ${k} is null without a reason`);
  }
  return problems;
}

/** Turns a ref name into a file-safe slug: preview/gp-net6 -> preview__gp-net6. */
export const slug = (ref) => ref.replace(/[^A-Za-z0-9._-]+/g, "__");

const SUMMARY_METRICS = [
  "rafP50Ms", "rafP95Ms", "rafP99Ms", "maxFrameMs", "framesOver33Ms", "framesOver50Ms",
  "firstPaintReportedMs", "timeToSharpMs", "inputToCameraMs", "requests", "transferredBytes", "abortCount",
  "staleWorkCount", "blankFrames", "decodedPeakBytes", "gpuResidentBytesEstimate",
];

/**
 * Groups receipts into cells (branch + sha + scenario + profile) and reports, per metric, the median, min and max
 * across valid trials. No composite score and no ranking: cells keep the order receipts are passed in.
 */
export function summarize(receipts) {
  const cells = new Map();
  for (const r of receipts) {
    const key = [r.branch, r.sha, r.scenario?.id, r.scenario?.mode ?? "A", r.environment?.profile].join("|");
    if (!cells.has(key)) {
      cells.set(key, {
        branch: r.branch, sha: r.sha, scenario: r.scenario?.id, mode: r.scenario?.mode ?? "A", profile: r.environment?.profile,
        trials: 0, pass: 0, fail: 0, notRun: 0, failures: new Set(), notRunReasons: new Set(), rows: [],
      });
    }
    const cell = cells.get(key);
    cell.trials++;
    if (r.status === "PASS") cell.pass++;
    else if (r.status === "FAIL") cell.fail++;
    else cell.notRun++;
    // A NOT RUN trial's gate results are diagnostics, not failures of the build.
    if (r.status === "FAIL") for (const f of r.validation?.failed ?? []) cell.failures.add(f);
    for (const f of r.validation?.notRun ?? []) cell.notRunReasons.add(f);
    // Only trials that ran contribute numbers; a NOT RUN trial is never a zero.
    if (r.status !== "NOT RUN") cell.rows.push({ ...r.metrics, firstPaintReportedMs: r.extra?.firstPaintReportedMs ?? null });
  }
  return [...cells.values()].map((cell) => {
    const stats = {};
    for (const m of SUMMARY_METRICS) {
      const xs = cell.rows.map((row) => row[m]).filter(Number.isFinite);
      stats[m] = xs.length ? { median: round(median(xs)), min: round(Math.min(...xs)), max: round(Math.max(...xs)), n: xs.length } : null;
    }
    const status = cell.notRun === cell.trials ? "NOT RUN" : cell.fail ? "FAIL" : "PASS";
    return {
      branch: cell.branch, sha: cell.sha, scenario: cell.scenario, mode: cell.mode, profile: cell.profile, status,
      trials: cell.trials, pass: cell.pass, fail: cell.fail, notRun: cell.notRun,
      failures: [...cell.failures], notRunReasons: [...cell.notRunReasons], stats,
    };
  });
}

export { SUMMARY_METRICS };
