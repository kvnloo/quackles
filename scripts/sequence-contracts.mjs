#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.resolve(process.env.ARTIFACTS || path.join(root, '../../outputs/mobile-validation/sequence-contracts'));
const MiB = 1024 * 1024;
const hashes = {};
async function sourceModule(name) {
  const source = await fs.readFile(path.join(root, `lib/sequence/${name}.ts`), 'utf8');
  hashes[name] = createHash('sha256').update(source).digest('hex');
  // Direct import (run with --import ./scripts/register-ts-resolve.mjs) so relative imports like "../paths" resolve.
  return import(pathToFileURL(path.join(root, `lib/sequence/${name}.ts`)).href);
}
const { FrameCache, DECODED_BUDGET } = await sourceModule('cache');
const { parseManifest, frameAt } = await sourceModule('manifest');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function until(predicate, message) {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await sleep(1); }
  throw new Error(`Timed out: ${message}`);
}
function environment(options = {}) {
  const requests = [], bitmaps = [], cacheStores = new Map(), deletedCaches = [];
  let activeFetch = 0, maxFetch = 0, activeDecode = 0, maxDecode = 0;
  class ResponseFixture {
    constructor(body, init = {}) { this.body = body; this.headers = new Headers(init.headers); this.ok = true; this.status = 200; }
    async blob() { return this.body; }
  }
  function makeCache(name) {
    const entries = new Map();
    const cache = {
      entries,
      async keys() { return [...entries.keys()].map(url => ({ url })); },
      async match(key) { return entries.get(typeof key === 'string' ? key : key.url); },
      async put(key, value) { if (options.quotaFailure) throw new DOMException('Quota exceeded', 'QuotaExceededError'); entries.set(key, value); },
      async delete(key) { return entries.delete(typeof key === 'string' ? key : key.url); },
    };
    cacheStores.set(name, cache);
    return cache;
  }
  const storage = {
    async open(name) { if (options.unavailable) throw new DOMException('Storage unavailable', 'SecurityError'); return cacheStores.get(name) ?? makeCache(name); },
    async keys() { return [...cacheStores.keys()]; },
    async delete(name) { deletedCaches.push(name); return cacheStores.delete(name); },
  };
  globalThis.window = { caches: storage };
  globalThis.caches = storage;
  globalThis.Response = ResponseFixture;
  globalThis.fetch = async (url, { signal } = {}) => { // warm/compressed-only fetches pass no init
    const asset = options.assets?.get(url) ?? { width: 1024, height: 1536 };
    const record = { url, signal, attempt: requests.filter(row => row.url === url).length + 1 };
    requests.push(record); activeFetch++; maxFetch = Math.max(maxFetch, activeFetch);
    try {
      if (options.fetchGate) await options.fetchGate.promise;
      signal?.throwIfAborted();
      if (options.failFirst && record.attempt === 1) throw new TypeError('Injected network failure');
      return new ResponseFixture({ asset, size: options.encodedBytes ?? 1200, type: 'image/webp' });
    } finally { activeFetch--; }
  };
  globalThis.createImageBitmap = async blob => {
    activeDecode++; maxDecode = Math.max(maxDecode, activeDecode);
    try {
      if (options.decodeGate) await options.decodeGate.promise;
      const bitmap = { width: blob.asset.width, height: blob.asset.height, closed: false, closeCalls: 0, close() { this.closed = true; this.closeCalls++; } };
      bitmaps.push(bitmap);
      return bitmap;
    } finally { activeDecode--; }
  };
  return { requests, bitmaps, cacheStores, deletedCaches, storage, ResponseFixture, get activeDecode() { return activeDecode; }, get maxFetch() { return maxFetch; }, get maxDecode() { return maxDecode; } };
}
const asset = (name, width = 1024) => ({ url: `https://sequence.test/${name}.webp`, width, height: width * 1.5 });
const report = { startedAt: new Date().toISOString(), method: 'Actual TypeScript cache/manifest modules, transpiled without edits. Deterministic fetch, CacheStorage and bitmap fixtures; no image allocation or GPU work. Browser and native image evidence are separate.', checks: [], sourceSha256: hashes };
async function check(name, run) {
  const started = performance.now();
  try { const evidence = await run(); report.checks.push({ name, passed: true, durationMs: performance.now() - started, evidence }); }
  catch (error) { report.checks.push({ name, passed: false, durationMs: performance.now() - started, error: error.stack }); }
}
function bounded(cache) {
  const stats = cache.stats();
  assert.ok(stats.totalBytes <= 96 * MiB, `decoded + reserved = ${stats.totalBytes}`);
  assert.ok(stats.pinnedBytes <= stats.decodedBytes);
  assert.ok(stats.inflight <= 3);
  assert.ok(stats.highTierInflight <= 1);
  assert.ok(stats.compressedBytes <= 128 * MiB);
  return stats;
}

await check('deduplicate one URL and cap concurrent network requests at three', async () => {
  const gate = defer(), env = environment({ fetchGate: gate });
  const cache = new FrameCache('dedup'), assets = Array.from({ length: 8 }, (_, i) => asset(`dedup-${i}`));
  cache.retain(assets.map(row => row.url));
  const first = cache.load(assets[0]);
  assert.equal(cache.load(assets[0]), first);
  const jobs = [first, ...assets.slice(1).map(row => cache.load(row))];
  await until(() => env.requests.length === 3, 'first three requests');
  const pending = bounded(cache); assert.equal(pending.inflight, 3); assert.equal(pending.queued, 5);
  gate.resolve(); await Promise.all(jobs); await sleep(5);
  const result = bounded(cache); assert.equal(env.requests.length, 8); assert.equal(env.maxFetch, 3);
  cache.dispose(); assert.ok(env.bitmaps.every(bitmap => bitmap.closed));
  return { pending, final: result, maxNetworkRequests: env.maxFetch, created: env.bitmaps.length };
});
await check('serialize high detail work and count decode reservations', async () => {
  const assets = Array.from({ length: 6 }, (_, i) => asset(`detail-${i}`, 2048));
  const gate = defer(), env = environment({ decodeGate: gate, assets: new Map(assets.map(row => [row.url, row])) });
  const cache = new FrameCache('detail'); cache.retain(assets.map(row => row.url));
  const jobs = assets.map(row => cache.load(row));
  await until(() => env.activeDecode === 1, 'first detail decode');
  const pending = bounded(cache); assert.equal(pending.reservedBytes, 24 * MiB); assert.equal(pending.highTierInflight, 1);
  // 6 x 24 MiB of equally wanted detail exceeds the 96 MiB budget: the first four decode, the other two wait (#53 Q1:
  // equal priorities no longer evict each other in a decode/evict cycle) and are rejected when the player is disposed.
  gate.resolve(); await Promise.all(jobs.slice(0, 4)); await sleep(5);
  const result = bounded(cache); assert.equal(env.maxDecode, 1); assert.equal(result.deferred, 2); assert.equal(result.closedBitmaps, 0);
  cache.dispose(); assert.ok(env.bitmaps.every(bitmap => bitmap.closed));
  assert.deepEqual((await Promise.allSettled(jobs.slice(4))).map(row => row.reason?.name), ['AbortError', 'AbortError']);
  return { pending, final: result, maxSimultaneousDecodes: env.maxDecode };
});
await check('evict old frames while the currently drawn bitmap remains pinned', async () => {
  const env = environment(), cache = new FrameCache('pinned'), current = asset('displayed');
  const drawn = await cache.load(current); cache.pin([current.url]);
  let peak = 0;
  for (let i = 0; i < 26; i++) { await cache.load(asset(`pressure-${i}`)); peak = Math.max(peak, bounded(cache).totalBytes); assert.equal(drawn.bitmap.closed, false); }
  assert.ok(env.bitmaps.some(bitmap => bitmap.closed));
  const result = bounded(cache); cache.dispose(); assert.ok(env.bitmaps.every(bitmap => bitmap.closed));
  assert.ok(env.bitmaps.every(bitmap => bitmap.closeCalls === 1));
  return { peak, final: result, bitmapsCreatedAndClosed: env.bitmaps.length };
});
await check('cancel a completed obsolete decode and close its bitmap', async () => {
  const gate = defer(), env = environment({ decodeGate: gate }), cache = new FrameCache('cancel');
  const old = asset('old'), latest = asset('latest'); cache.retain([old.url]);
  const oldJob = cache.load(old).then(() => ({ ok: true }), error => ({ name: error.name }));
  await until(() => env.activeDecode === 1, 'obsolete decode starts');
  cache.retain([latest.url]); const latestJob = cache.load(latest); gate.resolve();
  assert.deepEqual(await oldJob, { name: 'AbortError' }); await latestJob; await sleep(5);
  const result = bounded(cache); assert.equal(result.staleDiscard, 1); assert.equal(cache.peek(old.url), undefined);
  assert.equal(env.bitmaps[0].closed, true); assert.equal(cache.peek(latest.url).bitmap.closed, false);
  cache.dispose(); assert.ok(env.bitmaps.every(bitmap => bitmap.closed));
  return result;
});
await check('dispose while decode is pending closes every created bitmap', async () => {
  const gate = defer(), env = environment({ decodeGate: gate }), cache = new FrameCache('dispose');
  const job = cache.load(asset('disposable')).then(() => ({ ok: true }), error => ({ name: error.name }));
  await until(() => env.activeDecode === 1, 'decode starts'); cache.dispose(); gate.resolve();
  assert.deepEqual(await job, { name: 'AbortError' }); await sleep(5);
  assert.ok(env.bitmaps.every(bitmap => bitmap.closed)); assert.equal(cache.stats().totalBytes, 0);
  return { stats: cache.stats(), createdAndClosed: env.bitmaps.length };
});
await check('network failure can retry the same frame', async () => {
  const env = environment({ failFirst: true }), cache = new FrameCache('retry'), row = asset('retry');
  await assert.rejects(cache.load(row), /Injected network failure/); await sleep(5);
  await cache.load(row); const result = bounded(cache); assert.equal(env.requests.length, 2); cache.dispose(); return result;
});
await check('compressed cache evicts to 128 MiB without allocating large test payloads', async () => {
  const env = environment({ encodedBytes: 20 * MiB }), cache = new FrameCache('compressed');
  for (let i = 0; i < 10; i++) { await cache.load(asset(`encoded-${i}`)); await sleep(1); bounded(cache); }
  const result = bounded(cache); assert.equal(result.compressedBytes, 120 * MiB);
  assert.equal(env.cacheStores.get('quackles-sequence-compressed').entries.size, 6);
  cache.dispose(); return result;
});
for (const option of ['unavailable', 'quotaFailure']) await check(`CacheStorage ${option} retains network playback`, async () => {
  const env = environment({ [option]: true }), cache = new FrameCache(option);
  await cache.load(asset(option)); await sleep(5); const result = bounded(cache);
  assert.equal(result.entries, 1); assert.equal(result.compressedBytes, 0); assert.equal(env.requests.length, 1); cache.dispose(); return result;
});
await check('delete only stale Quackles sequence caches and recover after eviction', async () => {
  const env = environment(); await env.storage.open('unrelated-application'); await env.storage.open('quackles-sequence-old');
  const cache = new FrameCache('new'), row = asset('eviction'); await cache.load(row); await sleep(5);
  assert.equal(env.cacheStores.has('unrelated-application'), true); assert.deepEqual(env.deletedCaches, ['quackles-sequence-old']);
  const disk = env.cacheStores.get('quackles-sequence-new'); disk.entries.clear(); cache.dispose();
  const replacement = new FrameCache('new'); await replacement.load(row); assert.equal(env.requests.length, 2); replacement.dispose();
  return { deletedCaches: env.deletedCaches, requests: env.requests.length };
});
await check('reject a full master larger than decoded budget', async () => {
  const env = environment(), cache = new FrameCache('oversize');
  await assert.rejects(cache.load(asset('too-large', 8192)), /use tiles/);
  assert.equal(env.requests.length, 0); cache.dispose(); return { budgetBytes: DECODED_BUDGET };
});
// ---- #53 Q1: bounded admission + priority-aware eviction ---------------------------------------------------------------
// A player-like demand loop: retain the wanted set (with priorities), request what is neither decoded nor already waiting,
// and re-render when a request settles (SequencePlayer.request/schedule). Q1_LEGACY_RETAIN=1 retains bare URLs (v1 API).
const PLATE = 1024 * 1536 * 4;
const legacyRetain = process.env.Q1_LEGACY_RETAIN === '1';
function demand(cache, wanted) {
  const waiting = new Set(); let renders = 0, scheduled = false;
  const render = () => {
    scheduled = false; renders++;
    const rows = wanted();
    cache.pin(rows.filter(row => row.pinned).map(row => row.asset.url));
    cache.retain(legacyRetain ? rows.map(row => row.asset.url) : rows.map(row => [row.asset.url, row.priority]));
    for (const { asset: row, priority } of rows) {
      if (cache.peek(row.url) || waiting.has(row.url)) continue;
      waiting.add(row.url);
      cache.load(row, priority).catch(() => {}).finally(() => { waiting.delete(row.url); schedule(); });
    }
  };
  const schedule = () => { if (!scheduled && renders < 400) { scheduled = true; setTimeout(render, 0); } };
  render();
  return { get renders() { return renders; }, waiting, rerender: () => schedule() };
}
// Decoded + reserved bytes sampled every millisecond while a check runs.
function budgetWatch(cache) {
  let max = 0; const timer = setInterval(() => { max = Math.max(max, cache.stats().totalBytes); }, 1); timer.unref?.(); // a failed check must not keep the process alive
  return { stop() { clearInterval(timer); max = Math.max(max, cache.stats().totalBytes); return max; } };
}
// Quiet = no new decode for `ms`: what "at rest" means for the cache.
async function quiet(env, ms = 60, cap = 3000) {
  let last = env.bitmaps.length, since = performance.now(); const start = since;
  while (performance.now() - start < cap) { await sleep(5); if (env.bitmaps.length !== last) { last = env.bitmaps.length; since = performance.now(); } else if (performance.now() - since >= ms) return true; }
  return false;
}
const plates = (prefix, n) => Array.from({ length: n }, (_, i) => asset(`${prefix}-${i}`));

await check('Q1: wanted bytes exceeding the decoded budget settle without a decode/evict cycle', async () => {
  const env = environment(), cache = new FrameCache('q1-over', { decodedBudgetBytes: 4 * PLATE }), watch = budgetWatch(cache);
  const rows = plates('spec', 6).map(row => ({ asset: row, priority: 19 }));      // six equal speculative plates, room for four
  const loop = demand(cache, () => rows);
  const settled = await quiet(env); const decodes = env.bitmaps.length, renders = loop.renders;
  await sleep(150);                                                               // stay at rest: nothing may churn
  const max = watch.stop(), stats = cache.stats();
  assert.ok(settled, `cache never went quiet: ${env.bitmaps.length} decodes in 3 s`);
  assert.equal(env.bitmaps.length, decodes, 'decodes continued at rest');
  assert.ok(decodes <= rows.length, `${decodes} decodes for ${rows.length} wanted assets`);
  assert.equal(stats.closedBitmaps, 0, 'a wanted, equally useful image was evicted');
  assert.ok(max <= 4 * PLATE, `decoded + reserved ${max} > budget`);
  cache.dispose(); return { decodes, renders, maxBytes: max, entries: stats.entries, queued: stats.queued };
});

await check('Q1: low-priority work never displaces an immediately useful image', async () => {
  const env = environment(), cache = new FrameCache('q1-useful', { decodedBudgetBytes: 4 * PLATE }), watch = budgetWatch(cache);
  const useful = plates('tile', 4).map(row => ({ asset: row, priority: 90 }));
  let rows = useful; const loop = demand(cache, () => rows);
  await quiet(env); const first = useful.map(row => cache.peek(row.asset.url));
  assert.ok(first.every(Boolean), 'useful images decoded');
  const spec = asset('speculative'); rows = [...useful, { asset: spec, priority: 19 }]; loop.rerender();
  await quiet(env); await sleep(50);
  const max = watch.stop();
  assert.ok(useful.every(row => cache.peek(row.asset.url) && !cache.peek(row.asset.url).bitmap.closed), 'a useful image was evicted for speculative work');
  assert.equal(cache.peek(spec.url), undefined, 'speculative plate decoded without capacity');
  assert.ok(max <= 4 * PLATE);
  const stats = cache.stats();
  assert.equal(stats.closedBitmaps, 0, `${stats.closedBitmaps} bitmaps closed: useful images were displaced (and re-decoded) on the way`);
  cache.dispose();
  return { decodes: env.bitmaps.length, closed: stats.closedBitmaps, maxBytes: max };
});

await check('Q1: priorities that change during forward and reverse story scrolling keep the current frame fed without churn', async () => {
  const env = environment(), cache = new FrameCache('q1-scroll', { decodedBudgetBytes: 4 * PLATE }), watch = budgetWatch(cache);
  const frames = plates('frame', 9); let center = 2;
  // SequencePlayer: current frame pinned (required), adjacent frames +1,-1,+2,+3 at 19,19,18,17 (speculative).
  const wanted = () => [{ asset: frames[center], priority: 100, pinned: true },
    ...[[1, 19], [-1, 19], [2, 18], [3, 17]].filter(([o]) => frames[center + o]).map(([o, p]) => ({ asset: frames[center + o], priority: p }))];
  const loop = demand(cache, wanted); const steps = [];
  for (const next of [3, 4, 5, 4, 3, 2]) {
    center = next; loop.rerender();
    const t0 = performance.now(); await until(() => cache.peek(frames[center].url), `current frame ${center} decoded`);
    const fed = performance.now() - t0;
    const settled = await quiet(env); const decodes = env.bitmaps.length; await sleep(80);
    steps.push({ center, fedMs: Math.round(fed), settled, churnAtRest: env.bitmaps.length - decodes });
  }
  const max = watch.stop();
  assert.ok(steps.every(step => step.settled && step.churnAtRest === 0), `churn at rest: ${JSON.stringify(steps)}`);
  assert.ok(max <= 4 * PLATE, `decoded + reserved ${max} > budget`);
  assert.ok(env.bitmaps.length <= 6 * 5, `${env.bitmaps.length} decodes for 6 steps`);
  cache.dispose(); return { steps, decodes: env.bitmaps.length, maxBytes: max };
});

await check('Q1: deferred requests dedupe, abort when stale, stay compressed, and resolve when capacity frees (no timers)', async () => {
  const env = environment(), cache = new FrameCache('q1-deferred', { decodedBudgetBytes: 4 * PLATE }), watch = budgetWatch(cache);
  const useful = plates('busy', 4);
  cache.retain(useful.map(row => [row.url, 90])); await Promise.all(useful.map(row => cache.load(row, 90)));
  const spec = asset('later'), stale = asset('stale');
  cache.retain([...useful.map(row => [row.url, 90]), [spec.url, 19], [stale.url, 19]]);
  const first = cache.load(spec, 19), again = cache.load(spec, 19);
  assert.equal(first, again, 'duplicate request created a second job');
  const staleJob = cache.load(stale, 19).then(() => 'resolved', error => error.name);
  let settledSpec = false; first.then(() => { settledSpec = true; }, () => { settledSpec = true; });
  await sleep(40);
  assert.equal(settledSpec, false, 'deferred request resolved without capacity');
  assert.equal(cache.peek(spec.url), undefined);
  assert.ok(env.cacheStores.get('quackles-sequence-q1-deferred')?.entries.has(spec.url), 'deferred speculative asset not kept compressed');
  cache.retain([...useful.map(row => [row.url, 90]), [spec.url, 19]]);                       // stale drops out of demand
  assert.equal(await staleJob, 'AbortError');
  const requestsBefore = env.requests.filter(row => row.url === spec.url).length;
  cache.retain([...useful.slice(1).map(row => [row.url, 90]), [spec.url, 19]]);             // demand change frees capacity
  const image = await first;
  const max = watch.stop();
  assert.equal(image.bitmap.closed, false);
  assert.equal(env.requests.filter(row => row.url === spec.url).length, requestsBefore, 'admitted deferred job re-fetched instead of reading the compressed copy');
  assert.equal(cache.stats().queued, 0, 'unresolved deferred work left behind');
  assert.ok(max <= 4 * PLATE);
  cache.dispose(); return { maxBytes: max, specRequests: requestsBefore };
});

await check('Q1: identical demand does not re-run admission (reconsider only on demand or capacity change)', async () => {
  const env = environment(), cache = new FrameCache('q1-idle', { decodedBudgetBytes: 2 * PLATE });
  const rows = plates('idle', 3); const tuples = rows.map(row => [row.url, 19]);
  cache.retain(tuples); rows.forEach(row => cache.load(row, 19).catch(() => {})); await quiet(env);
  const before = cache.stats().admissionPasses;
  assert.equal(typeof before, 'number', 'cache does not count admission passes');
  for (let i = 0; i < 100; i++) { cache.retain(tuples); cache.pin([]); }
  assert.equal(cache.stats().admissionPasses, before, 'identical retain/pin re-ran admission');
  cache.retain([...tuples.slice(1)]); assert.ok(cache.stats().admissionPasses > before, 'a demand change did not reconsider deferred work');
  cache.dispose(); return { before, after: cache.stats().admissionPasses };
});

await check('explicit nonuniform frame positions and static reduced motion frames', async () => {
  const themeIds = ['day', 'white', 'blue', 'dark', 'night'];
  const fixture = { version: 1, id: 'fixture-only', aspect: [2, 3], defaultTheme: 'white', themes: themeIds.map(id => ({ id, label: id, palette: { paper: '#ffffff', deep: '#eeeeee', ink: '#111111', cobalt: '#2222ff' } })), frames: [0, .45, .56, .84, 1].map((progress, i) => ({ id: `f${i}`, progress, phase: 'fixture', windPhase: progress, assets: Object.fromEntries(themeIds.map(id => [id, [asset(`${id}-${i}`)]])) })), reducedMotion: [{ from: 0, frameId: 'f0' }, { from: .56, frameId: 'f4' }] };
  const manifest = parseManifest(fixture, 'https://sequence.test/manifest.json');
  const seeks = [1, .555, .3, 0, .8, .56, .5].map(progress => ({ progress, actual: frameAt(manifest, progress, false).id }));
  assert.deepEqual(seeks.map(row => row.actual), ['f4', 'f2', 'f1', 'f0', 'f3', 'f2', 'f1']);
  assert.equal(frameAt(manifest, .55, true).id, 'f0'); assert.equal(frameAt(manifest, .56, true).id, 'f4');
  const wrongOrder = structuredClone(fixture); wrongOrder.frames[2].progress = .2;
  assert.throws(() => parseManifest(wrongOrder, 'https://sequence.test/manifest.json'), /ordered/);
  return { seeks, reducedMotionBeforeImpact: 'f0', reducedMotionAfterImpact: 'f4', fixtureOnly: true };
});
report.finishedAt = new Date().toISOString(); report.passed = report.checks.every(row => row.passed);
await fs.mkdir(output, { recursive: true });
await fs.writeFile(path.join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter(row => !row.passed).map(row => ({ name: row.name, error: row.error })), report: path.join(output, 'report.json') }, null, 2));
if (!report.passed) process.exitCode = 1;
