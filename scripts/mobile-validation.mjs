#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
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
const GPU_MODE = process.env.GPU_MODE || 'default';
if (!['default', 'hardware', 'software'].includes(GPU_MODE)) throw new Error('GPU_MODE must be default, hardware, or software');
const PROTOTYPE = process.env.PROTOTYPE === '1';
const VISUAL_THEMES = process.env.VISUAL_THEMES?.split(',') ?? ['White'];
if (VISUAL_THEMES.some(name => !['White', 'Blue', 'Dark'].includes(name))) throw new Error('VISUAL_THEMES must contain White, Blue, or Dark');
const CHECKPOINTS = process.env.CHECKPOINTS?.split(',').map(Number) ?? [0, .18, .30, .45, .56, .64, .82, 1];
if (CHECKPOINTS.some(value => !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('CHECKPOINTS must be comma-separated numbers between 0 and 1');
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

const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];
if (GPU_MODE === 'hardware') launchArgs.push('--enable-gpu', '--use-angle=vulkan', '--enable-features=Vulkan', '--disable-vulkan-surface');
if (GPU_MODE === 'software') launchArgs.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true,
  args: launchArgs,
});
const context = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const consoleErrors = [];
page.on('pageerror', error => consoleErrors.push(error.message));
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
const failedRequests = [];
const failedHttpResponses = [];
page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure() }));
page.on('response', response => { if (response.status() >= 400) failedHttpResponses.push({ url: response.url(), status: response.status() }); });
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

async function state() {
  return page.evaluate(() => {
    function effectiveOpacity(element) {
      let opacity = 1;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        opacity *= Number(style.opacity);
        if (style.visibility === 'hidden' || style.display === 'none') opacity = 0;
      }
      return opacity;
    }
    function textRects(element) {
      const rects = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) rects.push({ left: box.left, top: box.top, right: box.right, bottom: box.bottom });
      }
      return rects;
    }
    const headings = [...document.querySelectorAll('h1,h2,.specs-copy .hero-kicker,.specs-copy dt,.specs-copy dd,.specs-copy a')].map(element => {
      const rect = element.getBoundingClientRect();
      const opacity = effectiveOpacity(element);
      const rects = textRects(element);
      return { text: element.textContent.trim(), left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, rects, opacity };
    });
    const nav = [...document.querySelectorAll('.site-nav .wordmark,.site-nav nav a')].map(element => ({ text: element.textContent.trim(), rects: textRects(element), opacity: effectiveOpacity(element) }));
    const canvases = [...document.querySelectorAll('canvas')].map(element => ({ opacity: effectiveOpacity(element), filter: getComputedStyle(element).filter }));
    return { ...(window.__QUACKLES_DEBUG__?.getState() ?? window.__QUACKLES__ ?? {}), audit: window.__QUACKLES_DEBUG__?.getAuditState?.() ?? null, setAudit: window.__QUACKLES_DEBUG__?.getSetAudit?.() ?? null, layout: { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, headings, nav, canvases } };
  });
}
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
  const response = await page.goto(BASE, { waitUntil: 'networkidle', timeout: 120000 });
  report.servedDocument = { url: response.url(), sha256: createHash('sha256').update(await response.body()).digest('hex') };
  await page.waitForFunction(() => Boolean(window.__QUACKLES_DEBUG__?.getState()?.rigLoaded || window.__QUACKLES__?.rigReady), undefined, { timeout: 45000 });
  if (process.env.SPATIAL === '1') await page.waitForFunction(() => Boolean(window.__QUACKLES_DEBUG__?.getState()?.setReady && window.__QUACKLES_DEBUG__?.getState()?.ready), undefined, { timeout: 45000 });
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

async function boundaryChecks() {
  const results = [];
  for (const [name, expected] of [['Dark', 1], ['Blue', .5]]) {
    const testContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const testPage = await testContext.newPage();
    const errors = [], requests = [], heldUrls = [];
    testPage.on('pageerror', error => errors.push(error.message));
    testPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    testPage.on('response', response => { if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() }); });
    let releaseAssets, receivedAtlas;
    const released = new Promise(resolve => { releaseAssets = resolve; });
    const atlasStarted = new Promise(resolve => { receivedAtlas = resolve; });
    const result = { case: `cold-${name.toLowerCase()}`, expected, heldUrls, errors, failedHttpResponses: requests, passed: false };
    try {
      await testPage.route(/\/robot-surface-(?:cobalt|dark)-color\.webp(?:\?|$)/, async route => { heldUrls.push(route.request().url()); receivedAtlas(); await released; await route.continue(); });
      await testPage.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
      let timer;
      try { await Promise.race([atlasStarted, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('No robot theme atlas request was intercepted')), 30000); })]); }
      finally { clearTimeout(timer); }
      result.beforeTheme = await testPage.evaluate(() => ({ state: window.__QUACKLES_DEBUG__?.getState(), theme: window.__QUACKLES_DEBUG__?.getThemeAudit?.() }));
      if (result.beforeTheme.state?.rigLoaded) throw new Error('Robot was already ready before the controlled cold theme change');
      await testPage.getByRole('radio', { name: new RegExp(`^${name}$`, 'i') }).first().click();
      await testPage.waitForTimeout(700);
      result.whileHeld = await testPage.evaluate(() => ({ state: window.__QUACKLES_DEBUG__?.getState(), theme: window.__QUACKLES_DEBUG__?.getThemeAudit?.() }));
      releaseAssets();
      await testPage.waitForFunction(() => window.__QUACKLES_DEBUG__?.getState()?.ready, undefined, { timeout: 45000 });
      await testPage.waitForTimeout(300);
      result.afterReady = await testPage.evaluate(() => window.__QUACKLES_DEBUG__?.getThemeAudit?.());
      result.selected = await testPage.getByRole('radio', { name: new RegExp(`^${name}$`, 'i') }).first().getAttribute('aria-checked');
      result.image = `boundary-${name.toLowerCase()}-after-ready.png`;
      await testPage.screenshot({ path: path.join(DIR, result.image), scale: 'css' });
      result.passed = result.selected === 'true' && ['target', 'current', 'robot', 'set'].every(key => typeof result.afterReady?.[key] === 'number' && Math.abs(result.afterReady[key] - expected) < .002) && errors.length === 0 && requests.length === 0;
    } catch (error) { result.failure = error.stack || String(error); }
    finally { releaseAssets(); await testContext.close(); }
    results.push(result);
  }
  const testContext = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const testPage = await testContext.newPage();
  const errors = [], requests = [];
  testPage.on('pageerror', error => errors.push(error.message));
  testPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  testPage.on('response', response => { if (response.status() >= 400) requests.push({ url: response.url(), status: response.status() }); });
  const fallback = { case: 'canvas-component-error-fallback', passed: false, errors, failedHttpResponses: requests };
  try {
    await testPage.goto(BASE, { waitUntil: 'networkidle', timeout: 45000 });
    await testPage.waitForFunction(() => window.__QUACKLES_DEBUG__?.getState()?.ready, undefined, { timeout: 45000 });
    fallback.errorsBeforeInjection = errors.length;
    await testPage.evaluate(() => {
      if (!window.__QUACKLES_DEBUG__?.failCanvas) throw new Error('Controlled CanvasGuard trigger is unavailable');
      window.__QUACKLES_DEBUG__.failCanvas();
    });
    await testPage.waitForFunction(() => {
      const plates = document.querySelector('.poster-plates');
      const slot = document.querySelector('.duck-slot');
      return plates && slot && getComputedStyle(plates).visibility === 'visible' && getComputedStyle(slot).visibility === 'hidden' && document.querySelectorAll('canvas').length === 0 && window.__QUACKLES_DEBUG__?.getState()?.ready === false;
    }, undefined, { timeout: 15000 });
    await testPage.evaluate(async () => { await Promise.all([...document.querySelectorAll('.poster-plates img')].map(img => img.decode().catch(() => {}))); });
    fallback.afterError = await testPage.evaluate(() => {
      const plates = document.querySelector('.poster-plates');
      const slot = document.querySelector('.duck-slot');
      return { ready: window.__QUACKLES_DEBUG__?.getState()?.ready, posterVisibility: getComputedStyle(plates).visibility, canvasSlotVisibility: getComputedStyle(slot).visibility, canvasCount: document.querySelectorAll('canvas').length, images: [...plates.querySelectorAll('img')].map(img => ({ src: img.currentSrc, decoded: img.complete && img.naturalWidth > 0 })) };
    });
    fallback.image = 'boundary-component-error-fallback.png';
    await testPage.screenshot({ path: path.join(DIR, fallback.image), scale: 'css' });
    fallback.passed = fallback.errorsBeforeInjection === 0 && requests.length === 0 && fallback.afterError.images.some(img => img.decoded);
    fallback.expectedInjectedError = true;
  } catch (error) { fallback.failure = error.stack || String(error); }
  finally { await testContext.close(); }
  results.push(fallback);
  return results;
}

const report = {
  environment: { node: process.version, platform: process.platform, cpus: os.cpus().length, gpuMode: GPU_MODE, launchArgs, loadAverageAtStart: os.loadavg(), concurrentLoad: process.env.CONCURRENT_LOAD || 'Other user workflows may be active. No cross-run causal speedup claim.' },
  buildId: await fs.readFile(path.resolve('.next/BUILD_ID'), 'utf8').catch(() => 'unavailable'),
  version: 2, date: new Date().toISOString(), label: LABEL, url: BASE, prototype: PROTOTYPE, visualThemes: PROTOTYPE ? VISUAL_THEMES : ['White', 'Blue', 'Dark'], spatialRequired: process.env.SPATIAL === '1', surfaceRequired: process.env.SURFACE === '1', shadowRequired: process.env.SHADOW === '1', checkpoints: PROTOTYPE ? CHECKPOINTS : null,
  limitations: ['Chromium desktop with mobile viewport and touch emulation; not a physical Galaxy S25.', 'rAF timestamps measure scheduling, not physical display presentation.', 'Deterministic screenshots are not taken during timing measurements.', 'Finite samples cannot establish every possible continuous scroll position.'],
  timings: [], visualSamples: [], timelineSamples: [], reducedMotionSamples: [], directSeekSamples: [], errors: [],
};
if (MODE === 'boundary') {
  try { report.boundaryTests = await boundaryChecks(); }
  finally { await fs.writeFile(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  console.log(JSON.stringify({ directory: DIR, boundaryTests: report.boundaryTests }, null, 2));
  process.exit(report.boundaryTests.every(test => test.passed) ? 0 : 1);
}
try {
  await ready();
  if (process.env.HIDE_CANVAS === '1') { await page.addStyleTag({content:'canvas { visibility: hidden !important; }'}); report.experiment = 'Canvas hidden via visibility; application/native scroll and R3F scheduling unchanged. Measures presentation dependency, not usable UI.'; }
  report.cold = await page.evaluate(() => { const test = window.__PERF_TEST__; test.coldRecording = false; test.recording = false; return { timeToReadyAndSettled: performance.now() - test.startup, frameIntervals: test.coldFrames, longTasks: test.longTasks, longAnimationFrames: test.longFrames, navigation: performance.getEntriesByType('navigation').map(x => x.toJSON()) }; });
  report.initial = await metrics();
  if (report.surfaceRequired) {
    report.robotSurfaces = (await state()).audit?.robotSurfaces;
    if (!report.robotSurfaces?.meshes?.length) throw new Error('Required robot surface patches were not applied');
    report.robotSurfaceReference = JSON.parse(await fs.readFile(path.resolve('public/preview-scene/robot-surface-browser-audit.json'), 'utf8'));
    const expected = report.robotSurfaceReference.parts.map(part => part.meshName).sort();
    const actual = report.robotSurfaces.meshes.map(mesh => mesh.meshName).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('Applied robot surface patches do not match the complete audited source part list');
  }
  const systemSession = await browser.newBrowserCDPSession();
  const systemInfo = await systemSession.send('SystemInfo.getInfo');
  report.environment.gpu = { devices: systemInfo.gpu.devices, featureStatus: systemInfo.gpu.featureStatus, auxAttributes: { glRenderer: systemInfo.gpu.auxAttributes?.glRenderer, displayType: systemInfo.gpu.auxAttributes?.displayType, processCrashCount: systemInfo.gpu.auxAttributes?.processCrashCount } };
  await systemSession.detach();
  const renderers = report.initial.canvas.map(canvas => canvas.renderer).filter(Boolean);
  if (GPU_MODE === 'hardware' && (!renderers.length || renderers.some(renderer => /swiftshader|llvmpipe|software/i.test(renderer)))) throw new Error(`Hardware GPU mode did not produce a hardware WebGL renderer: ${JSON.stringify(renderers)}`);
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
    if (report.surfaceRequired) {
      const startAudit = performance.now();
      await page.evaluate(async () => {
        if (!window.__QUACKLES_DEBUG__?.prepareAudit) throw new Error('Robot surface audit preparation is unavailable');
        await window.__QUACKLES_DEBUG__.prepareAudit();
      });
      report.auditPreparationMs = performance.now() - startAudit;
      report.robotSurfaces = (await state()).audit?.robotSurfaces;
      if (!report.robotSurfaces?.complete) throw new Error('Robot surface audit preparation did not complete');
    }
    if (PROTOTYPE) {
      for (const [width, height] of [[430, 932], [360, 800]]) {
        await page.setViewportSize({ width, height });
        for (const name of VISUAL_THEMES) {
          await theme(name);
          for (const p of CHECKPOINTS) {
            await progress(p);
            report.visualSamples.push({ theme: width === 430 ? name : `Small-${name}`, progress: p, viewport: { width, height }, state: await state(), image: await screenshot(`prototype-${width}-${name.toLowerCase()}-${String(p).replace('.', '_')}`) });
          }
        }
      }
      await page.setViewportSize({ width: 430, height: 932 });
      await page.waitForTimeout(400);
      await theme('White');
      for (const p of CHECKPOINTS.toReversed()) {
        await progress(p);
        report.visualSamples.push({ theme: 'White-reverse', progress: p, state: await state(), image: await screenshot(`prototype-reverse-${String(p).replace('.', '_')}`) });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForTimeout(300);
      for (const p of [0, .5, 1]) {
        await progress(p);
        report.visualSamples.push({ theme: 'Reduced-Motion', progress: p, state: await state(), image: await screenshot(`prototype-reduced-${p}`) });
      }

    } else {
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
    await page.waitForTimeout(300);
    for (const p of [0, .5, 1]) {
      await progress(p);
      report.visualSamples.push({ theme: 'Reduced-Motion', progress: p, state: await state(), image: await screenshot(`reduced-${Math.round(p * 100)}`) });
    }
    }
    if (report.spatialRequired) {
      for (const p of [.55, .57, .8, 1]) {
        await progress(p);
        report.reducedMotionSamples.push({ progress: p, state: await state() });
      }
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForTimeout(300);
      for (const p of [.30, .54, .559, .561, .57, .60, .64]) {
        await progress(p);
        report.timelineSamples.push({ progress: p, state: await state() });
      }
      if (!PROTOTYPE) {
        for (const [width, height] of [[430, 932], [360, 800]]) {
          await page.setViewportSize({ width, height });
          await page.waitForTimeout(400);
          for (const name of ['White', 'Blue', 'Dark']) {
            await theme(name);
            for (const p of [1, .3, .7, .1, .5, 0]) {
              await progress(p);
              report.directSeekSamples.push({ theme: width === 430 ? name : `Small-${name}`, progress: p, state: await state() });
            }
          }
        }
      }
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
  report.failedHttpResponses = failedHttpResponses;
  if (report.surfaceRequired && (consoleErrors.length || failedRequests.length || failedHttpResponses.length)) throw new Error('Final candidate has browser errors or failed asset requests');
} catch (error) {
  report.failure = error.stack || String(error);
  throw error;
} finally {
  report.errors = consoleErrors;
  report.failedRequests = failedRequests;
  report.failedHttpResponses = failedHttpResponses;
  await fs.writeFile(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
const summary = report.timings.map(pass => ({ viewport: pass.viewport, direction: pass.direction, statistics: pass.statistics, longTasks: pass.longTasks.length, reactCommits: pass.reactCommits, actualRenderIncrements: pass.frames.at(-1)?.state.renderCount - pass.frames[0]?.state.renderCount, repeatedRenderCounters: pass.frames.slice(1).filter((frame, index) => frame.state.renderCount === pass.frames[index].state.renderCount).length, maxRequestedRenderedProgressGap: Math.max(0, ...pass.frames.map(frame => Math.abs(frame.targetProgress - frame.state.renderedProgress))), peakExplode:Math.max(0,...pass.frames.map(f=>f.state.explode??0)),peakJump:Math.max(0,...pass.frames.map(f=>f.state.jump??0)), frameBudgetMet:pass.statistics.missedIntervals===0 }));
await fs.writeFile(path.join(DIR, 'summary.json'), JSON.stringify({ environment: report.environment, idle: report.idle, passes: summary, screenshotCount: report.visualSamples.length, errors: report.errors, limitations: report.limitations }, null, 2));
console.log(JSON.stringify({ directory: DIR, idle: report.idle, passes: summary, screenshotCount: report.visualSamples.length, errors: report.errors }, null, 2));
