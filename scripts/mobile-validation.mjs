#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright-core')); }
catch {
  try { ({ chromium } = require('playwright')); }
  catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/home/kvn/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
}
const BASE = process.env.BASE_URL || 'http://127.0.0.1:43217';
const OUT = path.resolve(process.env.ARTIFACTS || '../../outputs/mobile-validation');
const LABEL = process.env.LABEL || 'current';
const MODE = process.env.MODE || 'all';
const STEPS = Number(process.env.STEPS || 120);
const DURATION = Number(process.env.DURATION || 6000);
const DIR = path.join(OUT, LABEL);
await fs.mkdir(DIR, { recursive: true });

function distribution(values, budget = 1000 / 60) {
  const sorted = values.slice().sort((a, b) => a - b);
  const percentile = p => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  let consecutive = 0, maxConsecutiveMisses = 0;
  for (const value of values) { consecutive = value > budget * 1.5 ? consecutive + 1 : 0; maxConsecutiveMisses = Math.max(maxConsecutiveMisses, consecutive); }
  return {
    intervalsOver2xBudget: values.filter(x => x > budget * 2 + .25).length, maxConsecutiveMisses,
    samples: values.length, mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    p50: percentile(.5), p95: percentile(.95), p99: percentile(.99), max: sorted.at(-1) ?? null,
    budgetMs: budget, missedIntervals: values.filter(x => x > budget * 1.5).length,
    estimatedMissedVsyncs: values.reduce((sum, x) => sum + Math.max(0, Math.round(x / budget) - 1), 0),
    intervalsOver50ms: values.filter(x => x > 50).length,
    intervalsOver120HzBudget: values.filter(x => x > 1000 / 120 + .25).length,
  };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'],
});
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
const failedRequests = [];
page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
await page.addInitScript(() => {
  window.__PERF_TEST__ = { longTasks: [], longFrames: [], reactCommits: 0, recording: true, coldFrames: [], startup: performance.now() };
  let previous;
  const coldFrame = now => { if (previous !== undefined) window.__PERF_TEST__.coldFrames.push(now - previous); previous = now; if (window.__PERF_TEST__.coldRecording !== false) requestAnimationFrame(coldFrame); };
  requestAnimationFrame(coldFrame);
  for (const [type, key] of [['longtask', 'longTasks'], ['long-animation-frame', 'longFrames']]) {
    if (PerformanceObserver.supportedEntryTypes.includes(type)) {
      new PerformanceObserver(list => { if (window.__PERF_TEST__.recording) window.__PERF_TEST__[key].push(...list.getEntries().map(x => x.toJSON())); }).observe({ type, buffered: false });
    }
  }
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true, renderers: new Map(),
    inject(renderer) { const id = this.renderers.size + 1; this.renderers.set(id, renderer); return id; },
    onCommitFiberRoot() { if (window.__PERF_TEST__.recording) window.__PERF_TEST__.reactCommits++; },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {},
  };
});

async function state() { return page.evaluate(() => ({ ...(window.__QUACKLES_DEBUG__?.getState() ?? window.__QUACKLES__ ?? {}), audit:window.__QUACKLES_DEBUG__?.getAuditState?.() ?? null })); }
async function progress(value) {
  await page.evaluate(p => {
    if (window.__QUACKLES_DEBUG__?.setProgress) window.__QUACKLES_DEBUG__.setProgress(p);
    else window.scrollTo(0, p * (document.documentElement.scrollHeight - innerHeight));
  }, value);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function theme(name) {
  const themeButton = page.getByRole('radio', { name: new RegExp(`^${name}$`, 'i') });
  if (await themeButton.count()) await themeButton.first().click();
  else {
    const set = await page.evaluate(n => {
      if (window.__QUACKLES_DEBUG__?.setTheme) { window.__QUACKLES_DEBUG__.setTheme(n); return true; }
      const button = document.querySelector(`[data-theme="${n}"]`);
      if (button instanceof HTMLButtonElement) { button.click(); return true; }
      return false;
    }, name);
    if (!set) throw new Error(`Cannot select theme ${name}`);
  }
  await page.waitForTimeout(700);
}
async function screenshot(name) {
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(DIR, file), scale: 'css' });
  return file;
}
async function ready() {
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForFunction(() => Boolean(window.__QUACKLES_DEBUG__?.getState()?.rigLoaded || window.__QUACKLES__?.rigReady), { timeout: 45000 });
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
  await page.waitForTimeout(1500);
}
async function realTimePass(direction, duration, changeThemes = false) {
  await progress(direction === 'forward' ? 0 : 1);
  await page.waitForTimeout(300);
  return page.evaluate(async ({ direction, duration, changeThemes }) => {
    const test = window.__PERF_TEST__;
    test.longTasks = []; test.longFrames = []; test.reactCommits = 0; test.recording = true;
    const total = document.documentElement.scrollHeight - innerHeight;
    const frames = [];
    let start, previous;
    let lastTheme = -1;
    await new Promise(resolve => {
      function frame(now) {
        start ??= now; previous ??= now;
        const fraction = Math.min(1, (now - start) / duration);
        const target = direction === 'forward' ? fraction : 1 - fraction;
        const before = performance.now();
        window.scrollTo(0, total * target);
        const q = window.__QUACKLES_DEBUG__?.getState() ?? window.__QUACKLES__ ?? {};
        const themeIndex = Math.min(2, Math.floor(fraction * 3));
        if (changeThemes && themeIndex !== lastTheme) {
          lastTheme = themeIndex;
          const names = ['White', 'Blue', 'Dark'];
          const button = [...document.querySelectorAll('button,[role=radio]')].find(x => x.textContent.trim() === names[themeIndex] || x.getAttribute('aria-label') === names[themeIndex]);
          button?.click();
        }
        if (now !== start) frames.push({ time: now - start, dt: now - previous, targetProgress: target, state: { ready:q.ready, rigLoaded:q.rigLoaded, progress:q.progress, explode:q.explode, jump:q.jump, renderCount:q.renderCount, renderedProgress:q.renderedProgress, renderedAt:q.renderedAt, rootPosition:q.rootPosition?.slice(), feetMinY:q.feetMinY, renderer:q.renderer ? {...q.renderer}:null }, probeCostMs: performance.now() - before });
        previous = now;
        if (fraction < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    await new Promise(resolve => requestAnimationFrame(resolve));
    test.recording = false;
    return { frames, longTasks: test.longTasks, longAnimationFrames: test.longFrames, reactCommits: test.reactCommits };
  }, { direction, duration, changeThemes });
}
async function metrics() {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    overflow: document.documentElement.scrollWidth > innerWidth,
    densityCorrectedIntrinsicImageBytesEstimate: [...document.images].reduce((sum, img) => sum + img.naturalWidth * img.naturalHeight * 4, 0),
    images: [...document.images].map(img => ({ src: img.currentSrc, width: img.naturalWidth, height: img.naturalHeight, ready: img.complete && img.naturalWidth > 0 })),
    resources: performance.getEntriesByType('resource').map(entry => ({ name: entry.name, type: entry.initiatorType, bytes: entry.encodedBodySize, transferBytes: entry.transferSize, duration: entry.duration })),
    canvas: [...document.querySelectorAll('canvas')].map(canvas => { const gl = canvas.getContext('webgl2') || canvas.getContext('webgl'); const extension = gl?.getExtension('WEBGL_debug_renderer_info'); return { width: canvas.width, height: canvas.height, cssWidth: canvas.clientWidth, cssHeight: canvas.clientHeight, filter: getComputedStyle(canvas).filter, renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null }; }),
    heap: performance.memory ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize } : null,
    state: window.__QUACKLES_DEBUG__?.getState() ?? window.__QUACKLES__ ?? null,
    userAgent: navigator.userAgent,
    supportedPerformanceEntries: PerformanceObserver.supportedEntryTypes,
    reactRendererHookCount: window.__REACT_DEVTOOLS_GLOBAL_HOOK__?.renderers.size ?? 0,
  }));
}

const report = {
  environment: { node: process.version, platform: process.platform, cpus: os.cpus().length, loadAverageAtStart: os.loadavg(), concurrentLoad: 'Other user workflows may be active; parent may run Blender on four low-priority CPU threads. No cross-run causal speedup claim.' },
  buildId: await fs.readFile(path.resolve('.next/BUILD_ID'), 'utf8').catch(() => 'unavailable'),
  version: 1, date: new Date().toISOString(), label: LABEL, url: BASE,
  limitations: ['Chromium desktop with mobile viewport and touch emulation; not a physical Galaxy S25.', 'rAF timestamps measure scheduling, not physical display presentation.', 'Deterministic screenshots are not taken during timing measurements.', 'Finite samples cannot establish every possible continuous scroll position.'],
  timings: [], visualSamples: [], errors: [],
};
try {
  await ready();
  if (process.env.HIDE_CANVAS === '1') { await page.addStyleTag({content:'canvas { visibility: hidden !important; }'}); report.experiment = 'Canvas hidden via visibility; application/native scroll and R3F scheduling unchanged. Measures presentation dependency, not usable UI.'; }
  report.cold = await page.evaluate(() => { const test = window.__PERF_TEST__; test.coldRecording = false; test.recording = false; return { timeToReadyAndSettled: performance.now() - test.startup, frameIntervals: test.coldFrames, longTasks: test.longTasks, longAnimationFrames: test.longFrames, navigation: performance.getEntriesByType('navigation').map(x => x.toJSON()) }; });
  report.initial = await metrics();
  const idle = await page.evaluate(() => new Promise(resolve => {
    const samples = []; let previous;
    const frame = now => { if (previous !== undefined) samples.push(now - previous); previous = now; if (samples.length < 90) requestAnimationFrame(frame); else resolve(samples); };
    requestAnimationFrame(frame);
  }));
  const idleMedian = distribution(idle).p50;
  report.idle = distribution(idle, idleMedian);
  const afterIdle = await state();
  report.idleRenderedFrames = afterIdle.renderCount - report.initial.state.renderCount;
  report.refreshBudgetMs = idleMedian;
  report.canVerify120Hz = false;
  if (MODE !== 'visual') {
    for (const [width, height] of [[430, 932], [360, 800]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(400);
      for (const direction of ['forward', 'reverse']) {
        const pass = await realTimePass(direction, DURATION);
        report.timings.push({ viewport: { width, height }, direction, ...pass, statistics: distribution(pass.frames.map(x => x.dt), idleMedian) });
        console.log(JSON.stringify({phase:'timing',width,height,direction,statistics:report.timings.at(-1).statistics,longTasks:pass.longTasks.length,reactCommits:pass.reactCommits}));
      }
    }
    await page.setViewportSize({ width: 430, height: 932 });
    const themed = await realTimePass('forward', DURATION, true);
    report.timings.push({ viewport: { width: 430, height: 932 }, direction: 'forward-with-themes', ...themed, statistics: distribution(themed.frames.map(x => x.dt), idleMedian) });
  }
  console.log(JSON.stringify({phase:'timing-complete', directory:DIR}));
  if (MODE !== 'timing') {
    await page.setViewportSize({ width: 430, height: 932 });
    for (const name of ['White', 'Blue', 'Dark']) {
      await theme(name);
      const stepCount = name === 'White' ? STEPS : Math.min(STEPS, 40);
      for (let i = 0; i <= stepCount; i++) {
        const p = i / stepCount;
        await progress(p);
        report.visualSamples.push({ theme: name, progress: p, state: await state(), image: await screenshot(`${name.toLowerCase()}-${String(i).padStart(3, '0')}`) });
      }
    }
    await theme('White');
    for (const p of [1, .9, .8, .7, .6, .5, .4, .3, .2, .1, 0]) {
      await progress(p);
      report.visualSamples.push({ theme: 'White-reverse', progress: p, state: await state(), image: await screenshot(`reverse-${String(Math.round(p * 100)).padStart(3, '0')}`) });
    }
    await page.setViewportSize({ width: 360, height: 800 });
    for (const name of ['White', 'Blue', 'Dark']) {
      await theme(name);
      const stepCount = name === 'White' ? STEPS : Math.min(STEPS, 40);
      for (let i = 0; i <= stepCount; i++) {
        const p = i / stepCount;
        await progress(p);
        report.visualSamples.push({ theme: `Small-${name}`, progress: p, state: await state(), image: await screenshot(`small-${name.toLowerCase()}-${String(i).padStart(3, '0')}`) });
      }
    }
    await theme('White');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const p of [0, .5, 1]) {
      await progress(p);
      report.visualSamples.push({ theme: 'Reduced-Motion', progress: p, state: await state(), image: await screenshot(`reduced-${Math.round(p * 100)}`) });
    }
  }
  if (process.env.TRACE === '1') {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 430, height: 932 });
    await page.waitForTimeout(300);
    const client = await context.newCDPSession(page);
    await client.send('Tracing.start', {categories:'devtools.timeline,v8.execute,blink.user_timing,disabled-by-default-devtools.timeline.frame', transferMode:'ReturnAsStream'});
    await realTimePass('forward', DURATION);
    const done = new Promise(resolve => client.once('Tracing.tracingComplete', resolve));
    await client.send('Tracing.end');
    const {stream} = await done;
    let trace = '';
    for (;;) { const chunk = await client.send('IO.read', {handle:stream}); trace += chunk.data; if (chunk.eof) break; }
    await client.send('IO.close', {handle:stream});
    await fs.writeFile(path.join(DIR,'chromium-trace.json'), trace);
    report.trace = 'chromium-trace.json';
    await client.detach();
  }
  report.final = await metrics();
  report.environment.loadAverageAtEnd = os.loadavg();
  report.errors = consoleErrors;
  report.failedRequests = failedRequests;
} finally {
  await fs.writeFile(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
const summary = report.timings.map(pass => ({ viewport: pass.viewport, direction: pass.direction, statistics: pass.statistics, longTasks: pass.longTasks.length, reactCommits: pass.reactCommits, peakExplode:Math.max(0,...pass.frames.map(f=>f.state.explode??0)),peakJump:Math.max(0,...pass.frames.map(f=>f.state.jump??0)), frameBudgetMet:pass.statistics.missedIntervals===0 }));
await fs.writeFile(path.join(DIR, 'summary.json'), JSON.stringify({ idle: report.idle, passes: summary, screenshotCount: report.visualSamples.length, errors: report.errors, limitations: report.limitations }, null, 2));
console.log(JSON.stringify({ directory: DIR, idle: report.idle, passes: summary, screenshotCount: report.visualSamples.length, errors: report.errors }, null, 2));
