#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = process.env.BASE_URL || 'http://127.0.0.1:43217';
const mode = process.env.MODE || 'functional';
const out = path.resolve(process.env.ARTIFACTS || path.join(root, `../../outputs/mobile-validation/sequence-${mode}`));
const themes = ['day', 'white', 'blue', 'dark', 'night'];
const viewports = (process.env.VIEWPORTS || '430x932,360x800,430x740,360x740').split(',').map(value => { const [width, height] = value.split('x').map(Number); return { width, height }; });
const report = { at: new Date().toISOString(), base, mode, host: { loadAverage: os.loadavg(), node: process.version }, checks: [], runs: [], limitations: ['Chromium mobile emulation is not physical phone validation.', 'No physical Galaxy S25 or 120 Hz claim.', 'Functional sparse poses do not establish motion continuity.', 'Decoded bytes exclude browser codec scratch space and other browser memory; canvas bytes are reported separately.'] };
const errors = [];
function check(name, passed, evidence) { report.checks.push({ name, passed: Boolean(passed), evidence }); }
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', ...(process.env.SOFTWARE === '1' ? ['--disable-gpu'] : [])] });
async function openPage(viewport, reducedMotion = 'no-preference', setup) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({ viewport, error: error.message }));
  await page.addInitScript(() => {
    const probe = window.__SEQUENCE_PROBE__ = { samples: [], draws: [], requests: [], bitmapsCreated: 0, bitmapsClosed: 0, activeDecodes: 0, maxDecodes: 0, contexts: {}, decodeDelayMs: 0, auditing: false, longTasks: [] };
    const blobUrls = new WeakMap(), bitmapUrls = new WeakMap(), closed = new WeakSet(), counted = new WeakSet();
    const nativeFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const nativeBlob = response.blob.bind(response);
      response.blob = async () => { const blob = await nativeBlob(); blobUrls.set(blob, response.url || String(args[0])); return blob; };
      if (/\/sequence\/.*\.(webp|png|avif)(\?|$)/.test(response.url)) probe.requests.push({ url: response.url, at: performance.now(), status: response.status });
      return response;
    };
    if ('caches' in window) {
      const match = Cache.prototype.match;
      Cache.prototype.match = async function (...args) {
        const response = await match.apply(this, args);
        if (response) { const nativeBlob = response.blob.bind(response); response.blob = async () => { const blob = await nativeBlob(); blobUrls.set(blob, typeof args[0] === 'string' ? args[0] : args[0].url); return blob; }; }
        return response;
      };
    }
    const create = window.createImageBitmap;
    window.createImageBitmap = async (...args) => {
      const auditing = probe.auditing;
      if (!auditing) { probe.activeDecodes++; probe.maxDecodes = Math.max(probe.maxDecodes, probe.activeDecodes); }
      try {
        const bitmap = await create(...args); bitmapUrls.set(bitmap, blobUrls.get(args[0]) ?? 'unknown');
        if (!auditing) { probe.bitmapsCreated++; counted.add(bitmap); }
        if (probe.decodeDelayMs && !auditing) await new Promise(resolve => setTimeout(resolve, probe.decodeDelayMs));
        return bitmap;
      } finally { if (!auditing) probe.activeDecodes--; }
    };
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () { if (!closed.has(this) && counted.has(this)) { closed.add(this); probe.bitmapsClosed++; } return close.call(this); };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) { const result = getContext.call(this, type, ...args); if (result) probe.contexts[type] = (probe.contexts[type] ?? 0) + 1; return result; };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (bitmap, ...args) {
      if (!probe.auditing && this.canvas instanceof HTMLCanvasElement && this.canvas.classList.contains('sequence-base')) {
        const state = window.__QUACKLES_SEQUENCE__?.getState();
        const url = bitmapUrls.get(bitmap) ?? 'unknown';
        probe.draws.push({ at: performance.now(), url, requestedFrame: state?.requested?.frameId, requestedThemes: state?.requested?.themes, requestedUrls: state?.requested?.urls, generation: state?.requested?.generation, stale: url !== 'unknown' && !state?.requested?.urls.includes(url) });
      }
      return draw.call(this, bitmap, ...args);
    };
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) new PerformanceObserver(list => probe.longTasks.push(...list.getEntries().map(row => row.toJSON()))).observe({ type: 'longtask', buffered: false });
    const sample = now => {
      const state = window.__QUACKLES_SEQUENCE__?.getState();
      if (state && probe.samples.length < 30000) probe.samples.push({ at: now, requested: state.requested && { frameId: state.requested.frameId, themes: state.requested.themes, tierWidth: state.requested.tierWidth, generation: state.requested.generation }, rendered: state.rendered && { frameId: state.rendered.frameId, themes: state.rendered.themes, tierWidth: state.rendered.tierWidth, generation: state.rendered.generation }, cache: state.cache, drawCount: state.drawCount, surfaceBytes: state.surfaceBytes });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  if (setup) await setup(page);
  const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__?.getState().ready, undefined, { timeout: 45000 });
  await page.evaluate(() => document.fonts.ready);
  return { page, context, viewport, documentSha256: createHash('sha256').update(await response.body()).digest('hex') };
}
const state = page => page.evaluate(() => window.__QUACKLES_SEQUENCE__.getState());
async function select(page, theme, progress) {
  const started = await page.evaluate(({ theme, progress }) => { if (theme) window.__QUACKLES_SEQUENCE__.setTheme(theme); if (progress !== undefined) window.__QUACKLES_SEQUENCE__.setProgress(progress); return performance.now(); }, { theme, progress });
  await page.waitForFunction(({ theme, progress }) => {
    const s = window.__QUACKLES_SEQUENCE__.getState();
    return s.requested && s.rendered && (!theme || s.rendered.themes.length === 1 && s.rendered.themes[0] === theme && s.current.theme === s.current.target) && (progress === undefined || Math.abs(s.current.progress - progress) < .003 && Math.abs(s.requested.progress - progress) < .003) && s.requested.frameId === s.rendered.frameId && JSON.stringify(s.requested.themes) === JSON.stringify(s.rendered.themes);
  }, { theme, progress }, { timeout: 20000 });
  return page.evaluate(start => ({ settledAfterMs: performance.now() - start, state: window.__QUACKLES_SEQUENCE__.getState() }), started);
}
async function pixelComparison(page) {
  return page.evaluate(async () => {
    const probe = window.__SEQUENCE_PROBE__; probe.auditing = true;
    try {
      const s = window.__QUACKLES_SEQUENCE__.getState(), baseCanvas = document.querySelector('.sequence-base');
      const bitmap = await createImageBitmap(await (await fetch(s.rendered.urls[0])).blob());
      const reference = new OffscreenCanvas(baseCanvas.width, baseCanvas.height), ctx = reference.getContext('2d', { alpha: false });
      ctx.drawImage(bitmap, 0, 0, reference.width, reference.height); bitmap.close();
      if (s.rendered.themes.length === 2) {
        const second = await createImageBitmap(await (await fetch(s.rendered.urls[1])).blob());
        ctx.globalAlpha = s.rendered.mix; ctx.drawImage(second, 0, 0, reference.width, reference.height); second.close(); ctx.globalAlpha = 1;
      }
      const actual = baseCanvas.getContext('2d').getImageData(0, 0, baseCanvas.width, baseCanvas.height).data;
      const expected = ctx.getImageData(0, 0, reference.width, reference.height).data;
      let sum = 0, max = 0, different = 0;
      for (let i = 0; i < actual.length; i++) { const diff = Math.abs(actual[i] - expected[i]); sum += diff; max = Math.max(max, diff); if (diff) different++; }
      const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
      return { frame: s.rendered.frameId, theme: s.rendered.themes, source: s.rendered.urls[0], width: reference.width, height: reference.height, meanChannelError: sum / actual.length, maxChannelError: max, differentChannels: different, actualSha256: await hash(actual), expectedSha256: await hash(expected) };
    } finally { probe.auditing = false; }
  });
}
async function layout(page) {
  return page.evaluate(() => {
    const bounds = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const elements = selector => [...document.querySelectorAll(selector)].map(element => { const style = getComputedStyle(element); return { text: element.textContent.trim(), ...bounds(element), color: style.color, background: style.backgroundColor, fontSize: style.fontSize, href: element.getAttribute('href'), target: element.getAttribute('target'), display: style.display }; });
    const player = document.querySelector('.sequence-player'), paper = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
    const channels = color => color.startsWith('#') ? [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16)) : color.match(/[\d.]+/g).slice(0, 3).map(Number);
    const luma = color => channels(color).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
    const links = elements('.site-nav a').map(row => { const values = [luma(row.color), luma(paper)].sort((a, b) => a - b); return { ...row, contrastAgainstPaper: (values[1] + .05) / (values[0] + .05) }; });
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scale: visualViewport?.scale }, scrollHeight: document.documentElement.scrollHeight, scrollY, overflow: document.documentElement.scrollWidth > innerWidth, player: bounds(player), playerAspect: player.clientWidth / player.clientHeight, paper, bodyBackground: getComputedStyle(document.body).backgroundColor, header: elements('.site-nav'), links, dock: elements('.scene-dock'), themeButtons: elements('.theme-seg-btn'), touchAction: getComputedStyle(document.querySelector('.poster-frame')).touchAction, viewportMeta: document.querySelector('meta[name=viewport]')?.content };
  });
}
async function detailComparison(page) {
  return page.evaluate(async () => {
    const probe = window.__SEQUENCE_PROBE__; probe.auditing = true;
    try {
      const s = window.__QUACKLES_SEQUENCE__.getState(), canvas = document.querySelector('.sequence-detail');
      if (!s.detailWidth || getComputedStyle(canvas).visibility !== 'visible') return { available: false };
      const manifestUrl = performance.getEntriesByType('resource').find(row => /\/sequence\/manifest\.json/.test(row.name)).name;
      const manifest = await (await fetch(manifestUrl)).json();
      const variant = manifest.frames.find(frame => frame.id === s.rendered.frameId).assets[s.rendered.themes[0]].find(row => row.width === s.detailWidth);
      const crop = { x: parseFloat(canvas.style.left) / 100, y: parseFloat(canvas.style.top) / 100, width: parseFloat(canvas.style.width) / 100, height: parseFloat(canvas.style.height) / 100 };
      const reference = new OffscreenCanvas(canvas.width, canvas.height), ctx = reference.getContext('2d', { alpha: false });
      if ('url' in variant) {
        const image = await createImageBitmap(await (await fetch(new URL(variant.url, manifestUrl))).blob());
        ctx.drawImage(image, crop.x * variant.width, crop.y * variant.height, crop.width * variant.width, crop.height * variant.height, 0, 0, canvas.width, canvas.height); image.close();
      } else {
        const sx = canvas.width / (crop.width * variant.width), sy = canvas.height / (crop.height * variant.height);
        for (let y = 0; y < variant.tiles.rows; y++) for (let x = 0; x < variant.tiles.columns; x++) {
          const url = new URL(variant.tiles.urlTemplate.replaceAll('{x}', String(x)).replaceAll('{y}', String(y)), manifestUrl).href;
          if (!s.rendered.urls.includes(url)) continue;
          const image = await createImageBitmap(await (await fetch(url)).blob());
          const overlap = variant.tiles.overlap ?? 0;
          const sourceX = Math.max(0, x * variant.tiles.tileSize - (x > 0 ? overlap : 0));
          const sourceY = Math.max(0, y * variant.tiles.tileSize - (y > 0 ? overlap : 0));
          const originX = crop.x * variant.width, originY = crop.y * variant.height;
          const dx = Math.floor((sourceX - originX) * sx);
          const dy = Math.floor((sourceY - originY) * sy);
          const dw = Math.ceil((sourceX + image.width - originX) * sx) - dx;
          const dh = Math.ceil((sourceY + image.height - originY) * sy) - dy;
          ctx.drawImage(image, dx, dy, dw, dh); image.close();
        }
      }
      const actual = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, expected = ctx.getImageData(0, 0, reference.width, reference.height).data;
      let sum = 0, max = 0;
      for (let i = 0; i < actual.length; i++) { const d = Math.abs(actual[i] - expected[i]); sum += d; max = Math.max(max, d); }
      return { available: true, width: s.detailWidth, tiles: s.detailTiles, crop, backingWidth: canvas.width, backingHeight: canvas.height, meanChannelError: sum / actual.length, maxChannelError: max, method: 'Compare displayed crop against the independently decoded source variants at DOM crop coordinates; native master-to-tile seam validation is separate.' };
    } finally { probe.auditing = false; }
  });
}
async function finish(run, name) {
  const { page, context, viewport, documentSha256 } = run;
  await page.waitForFunction(() => window.__QUACKLES_SEQUENCE__.getState().cache.inflight === 0);
  const { final, probe } = await page.evaluate(() => ({ final: window.__QUACKLES_SEQUENCE__.getState(), probe: window.__SEQUENCE_PROBE__ }));
  const cacheSamples = probe.samples.filter(row => row.cache);
  check(`${name}: decoded plus reserved never exceeds 96 MiB`, cacheSamples.every(row => row.cache.totalBytes <= 96 * 1024 * 1024), Math.max(...cacheSamples.map(row => row.cache.totalBytes)));
  check(`${name}: pinned bytes included in decoded bytes`, cacheSamples.every(row => row.cache.pinnedBytes <= row.cache.decodedBytes));
  check(`${name}: compressed cache within 128 MiB`, cacheSamples.every(row => row.cache.compressedBytes <= 128 * 1024 * 1024));
  check(`${name}: no more than three active jobs and one high detail job`, cacheSamples.every(row => row.cache.inflight <= 3 && row.cache.highTierInflight <= 1));
  check(`${name}: zero created WebGL contexts`, !probe.contexts.webgl && !probe.contexts.webgl2 && !probe.contexts['experimental-webgl'], probe.contexts);
  check(`${name}: no obsolete source painted over latest intent`, probe.draws.every(row => !row.stale), { draws: probe.draws.length, stale: probe.draws.filter(row => row.stale) });
  check(`${name}: every bitmap resident, closing, or accounted for`, probe.bitmapsCreated - probe.bitmapsClosed === (final.cache?.entries ?? 0) + (final.cache?.decoding ?? 0), { created: probe.bitmapsCreated, closed: probe.bitmapsClosed, entries: final.cache?.entries, decoding: final.cache?.decoding });
  const artifact = `${name}.json`; await fs.writeFile(path.join(out, artifact), `${JSON.stringify({ viewport, documentSha256, final, probe, evidence: run.evidence }, null, 2)}\n`);
  report.runs.push({ name, viewport, artifact, revision: final.manifestId, frameCount: final.frameCount, evidence: run.evidence });
  await context.close();
}
async function functional() {
  for (const viewport of viewports) {
    const run = await openPage(viewport), { page } = run;
    const initial = await state(page), frames = initial.frames ?? [{ id: 'p0000000', progress: 0 }, { id: 'p0450000', progress: .45 }, { id: 'p0560000', progress: .56 }, { id: 'p0840000', progress: .84 }, { id: 'p1000000', progress: 1 }];
    run.evidence = { seeks: [], layouts: [], comparisons: [] };
    for (const theme of themes) {
      for (const frame of [...frames, ...frames.slice().reverse()]) {
        const result = await select(page, theme, frame.progress);
        check(`${viewport.width}x${viewport.height} ${theme} seek ${frame.id}`, result.state.rendered.frameId === frame.id, { requested: result.state.requested, drawn: result.state.rendered, lagMs: result.settledAfterMs });
        run.evidence.seeks.push({ theme, progress: frame.progress, expected: frame.id, drawn: result.state.rendered.frameId, settleMs: result.settledAfterMs });
      }
      await select(page, theme, 1);
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-${theme}-final.png`), scale: 'css' });
      await select(page, theme, 0);
      const comparison = await pixelComparison(page); run.evidence.comparisons.push(comparison);
      check(`${viewport.width}x${viewport.height} ${theme} canvas matches source`, comparison.maxChannelError === 0, comparison);
      const measure = await layout(page); run.evidence.layouts.push({ theme, ...measure });
      check(`${viewport.width}x${viewport.height} ${theme} phone bounds`, !measure.overflow && Math.abs(measure.playerAspect - 2 / 3) < .003 && measure.dock.every(row => row.x >= 0 && row.right <= viewport.width && row.y >= 0 && row.bottom <= viewport.height), measure);
      check(`${viewport.width}x${viewport.height} ${theme} header links have contrast and stay in paper field`, measure.links.every(row => row.contrastAgainstPaper >= 4.5 && row.x >= measure.player.x && row.right <= measure.player.x + measure.player.width * .684 + 1), measure.links);
      await page.screenshot({ path: path.join(out, `${viewport.width}x${viewport.height}-${theme}-hero.png`), scale: 'css' });
    }
    await select(page, 'white', .56);
    const before = await pixelComparison(page); await select(page, 'night', 1); await select(page, 'white', .56); const after = await pixelComparison(page);
    check(`${viewport.width}x${viewport.height} repeated nonsequential frame has identical pixels`, before.actualSha256 === after.actualSha256);
    run.evidence.repeatedFrame = { before, after };
    await finish(run, `${viewport.width}x${viewport.height}-functional`);
  }
}
async function touch(page, points) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [points[0]] });
  for (const point of points.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach(); await page.waitForTimeout(350);
}
async function gestures() {
  for (const viewport of viewports.slice(0, 2)) {
    const run = await openPage(viewport), { page } = run; run.evidence = {};
    await select(page, 'white', .45);
    const box = await page.locator('.poster-frame').boundingBox(), y = box.y + Math.min(box.height * .5, viewport.height * .5);
    const before = await state(page);
    await touch(page, Array.from({ length: 9 }, (_, i) => ({ x: box.x + box.width * (.8 - i * .065), y })));
    const horizontal = await state(page);
    check(`${viewport.width}: horizontal touch parks a continuous theme mix and retains frame`, horizontal.current.theme === horizontal.current.target && horizontal.current.theme !== 1 && Number.isInteger(before.current.target) && horizontal.rendered.frameId === before.rendered.frameId, { before, horizontal });
    await select(page, 'white', .45); const beforeVertical = await page.evaluate(() => scrollY);
    await touch(page, Array.from({ length: 9 }, (_, i) => ({ x: box.x + box.width * .5, y: y + 90 - i * 25 })));
    const vertical = await state(page), afterVertical = await page.evaluate(() => scrollY);
    check(`${viewport.width}: vertical touch scrolls without changing theme`, vertical.current.target === 1 && afterVertical !== beforeVertical, { beforeVertical, afterVertical, target: vertical.current.target });
    const cdp = await page.context().newCDPSession(page);
    await select(page, 'blue', 0);
    const beforePinch = await state(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: viewport.width * .4, y: viewport.height * .45, id: 1 }, { x: viewport.width * .6, y: viewport.height * .45, id: 2 }] });
    for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: viewport.width * (.4 - i * .02), y: viewport.height * .45, id: 1 }, { x: viewport.width * (.6 + i * .02), y: viewport.height * .45, id: 2 }] }); await page.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await page.waitForTimeout(500);
    const pinch = await state(page);
    check(`${viewport.width}: two finger gesture keeps the selected theme`, pinch.current.target === beforePinch.current.target, { zoom: pinch.zoom, before: beforePinch.current.target, after: pinch.current.target });
    check(`${viewport.width}: pinch zooms the inspection camera or the visual viewport`, pinch.zoom > 1.1 || pinch.inspection.targetZoom > 1.1, { scale: pinch.zoom, inspection: pinch.inspection.targetZoom });
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); await cdp.detach();
    await page.getByTestId('theme-white').focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(350);
    const keyboard = await state(page); check(`${viewport.width}: keyboard theme control`, keyboard.current.target === 2, keyboard.current);
    run.evidence = { before, horizontal, vertical, pinch, keyboard, layout: await layout(page) };
    await finish(run, `${viewport.width}-gestures`);
  }
}
async function adversarial() {
  const failing = await openPage(viewports[0]), failingPage = failing.page;
  let failedOnce = false;
  await failingPage.route(/\/night\/p1000000-1024\.webp$/, async route => {
    if (!failedOnce) { failedOnce = true; await route.fulfill({ status: 503, body: 'Injected transient asset failure' }); }
    else await route.continue();
  });
  await select(failingPage, 'white', 0);
  await failingPage.evaluate(() => { window.__QUACKLES_SEQUENCE__.setTheme('night'); window.__QUACKLES_SEQUENCE__.setProgress(1); });
  await failingPage.waitForFunction(() => window.__QUACKLES_SEQUENCE__.getState().cache.failures > 0);
  await failingPage.waitForTimeout(400);
  const failedState = await state(failingPage), retained = await pixelComparison(failingPage);
  check('failed frame request preserves a complete rendered source', failedState.ready && retained.maxChannelError === 0 && failedState.rendered !== null, { failedState, retained });
  await select(failingPage, 'white', 0);
  await failingPage.evaluate(() => { window.__QUACKLES_SEQUENCE__.setTheme('night'); window.__QUACKLES_SEQUENCE__.setProgress(1); });
  let recovered = true;
  try { await failingPage.waitForFunction(() => { const s = window.__QUACKLES_SEQUENCE__.getState(); return s.rendered?.frameId === 'p1000000' && s.rendered.themes.length === 1 && s.rendered.themes[0] === 'night'; }, undefined, { timeout: 5000 }); }
  catch { recovered = false; }
  const retryState = await state(failingPage);
  check('returning to a failed frame retries and recovers', recovered, retryState);
  failing.evidence = { failedState, retained, retryState, recovered }; await finish(failing, 'fetch-failure-retry');

  let release, received;
  const held = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { received = resolve; });
  const delayed = await openPage(viewports[0], 'no-preference', async page => page.route(/\/night\/p1000000-1024\.webp$/, async route => { received(); await held; await route.continue().catch(() => {}); }));
  await delayed.page.evaluate(() => { window.__QUACKLES_SEQUENCE__.setTheme('night'); window.__QUACKLES_SEQUENCE__.setProgress(1); });
  await Promise.race([started, new Promise((_, reject) => setTimeout(() => reject(new Error('Delayed asset was never requested')), 5000))]);
  await select(delayed.page, 'blue', .45); const beforeRelease = await state(delayed.page); release(); await delayed.page.waitForTimeout(600); const afterRelease = await state(delayed.page);
  check('late network response cannot replace a newer theme and frame', afterRelease.rendered.frameId === beforeRelease.rendered.frameId && afterRelease.rendered.themes[0] === 'blue', { beforeRelease, afterRelease });
  delayed.evidence = { beforeRelease, afterRelease }; await finish(delayed, 'delayed-response');

  const run = await openPage(viewports[0]), { page } = run; run.evidence = {};
  await select(page, 'white', 0);
  await page.evaluate(() => { window.__SEQUENCE_PROBE__.decodeDelayMs = 500; window.__QUACKLES_SEQUENCE__.setTheme('night'); window.__QUACKLES_SEQUENCE__.setProgress(1); });
  await page.waitForFunction(() => window.__SEQUENCE_PROBE__.activeDecodes > 0);
  const pending = await state(page);
  await page.evaluate(() => { window.__QUACKLES_SEQUENCE__.setTheme('day'); window.__QUACKLES_SEQUENCE__.setProgress(.45); });
  await page.waitForTimeout(70);
  const settled = await select(page, 'blue', .56);
  await page.evaluate(() => { window.__SEQUENCE_PROBE__.decodeDelayMs = 0; });
  await page.waitForTimeout(650); const final = await state(page);
  check('cancelled decode discarded', final.cache.staleDiscard > 0, { pending: pending.cache, final: final.cache });
  check('rapid themes and reverse settle to latest frame', final.rendered.frameId === final.requested.frameId && final.rendered.themes.length === 1 && final.rendered.themes[0] === 'blue', final);
  run.evidence = { pending, settled, final }; await finish(run, 'cancelled-decode');
  for (const failure of ['unavailable', 'quota']) {
    const failedRun = await openPage(viewports[0], 'no-preference', async page => page.addInitScript(kind => { if (kind === 'unavailable') CacheStorage.prototype.open = async () => { throw new DOMException('Injected cache unavailable', 'SecurityError'); }; else Cache.prototype.put = async () => { throw new DOMException('Injected quota failure', 'QuotaExceededError'); }; }, failure));
    failedRun.evidence = await select(failedRun.page, 'night', 1);
    check(`CacheStorage ${failure} playback`, failedRun.evidence.state.rendered.themes[0] === 'night');
    await finish(failedRun, `cache-${failure}`);
  }
}
async function reduced() {
  const run = await openPage(viewports[0], 'reduce'), { page } = run;
  run.evidence = [];
  const manifestResponse = await page.request.get(`${base.replace(/\/$/, '')}/preview-scene/sequence/manifest.json`);
  const manifest = await manifestResponse.json();
  for (const theme of themes) for (const progress of [0, .3, .55, .559, .56, .561, .8, 1]) {
    const result = await select(page, theme, progress), expected = manifest.reducedMotion.findLast(row => row.from <= result.state.requested.progress).frameId;
    check(`reduced ${theme} ${progress} is static authored pose`, result.state.rendered.frameId === expected && result.state.current.reducedMotion, { actual: result.state.rendered.frameId, expected });
    run.evidence.push({ theme, requestedProgress: progress, actualScrollProgress: result.state.requested.progress, expected, result });
  }
  const first = await state(page); await page.waitForTimeout(500); const second = await state(page);
  check('reduced motion has no idle redraws or wind interpolation', first.drawCount === second.drawCount, { before: first.drawCount, after: second.drawCount });
  await finish(run, 'reduced-motion');
}
async function zoom() {
  for (const viewport of viewports.slice(0, 2)) {
    const run = await openPage(viewport), { page } = run; run.evidence = [];
    const cdp = await page.context().newCDPSession(page), initial = await state(page);
    for (const theme of themes) for (const level of [2, 4]) {
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 }); await select(page, theme, 0);
      await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: level }); await page.waitForTimeout(1800);
      const s = await state(page), measure = await layout(page);
      check(`${viewport.width} ${theme} ${level}x DPR2 hero promotion`, s.detailWidth >= (level === 2 ? 2048 : 4096) && s.rendered.frameId === initial.frames[0].id && s.rendered.themes[0] === theme, { state: s, layout: measure });
      if (level === 4) check(`${viewport.width} ${theme} 4096 uses independent tiles`, s.detailTiles > 0, s.detailTiles);
      const comparison = await detailComparison(page);
      check(`${viewport.width} ${theme} ${level}x drawn detail agrees with source crop`, comparison.available && comparison.meanChannelError < .1, comparison);
      run.evidence.push({ theme, level, state: s, layout: measure, comparison });
      await page.screenshot({ path: path.join(out, `${viewport.width}-${theme}-${level}x.png`), scale: 'device' });
    }
    await cdp.detach(); await finish(run, `${viewport.width}-zoom`);
  }
}
async function timing() {
  if (process.env.PERF_APPROVED !== '1') throw new Error('Timing requires PERF_APPROVED=1 after coordinating GPU load with the render owner.');
  for (const viewport of viewports.slice(0, 2)) {
    const run = await openPage(viewport), { page } = run; run.evidence = {};
    const refresh = await page.evaluate(async () => {
      const deltas = []; let last;
      await new Promise(resolve => { const frame = now => { if (last !== undefined) deltas.push(now - last); last = now; if (deltas.length < 120) requestAnimationFrame(frame); else resolve(); }; requestAnimationFrame(frame); });
      return deltas;
    });
    const sorted = refresh.slice().sort((a, b) => a - b), interval = sorted[Math.floor(sorted.length / 2)];
    run.evidence.refreshIntervals = refresh; run.evidence.measuredRefreshIntervalMs = interval; run.evidence.passes = [];
    for (const theme of themes) for (const direction of ['forward', 'reverse']) {
      await select(page, theme, direction === 'forward' ? 0 : 1);
      const pass = await page.evaluate(async ({ direction, duration }) => {
        const probe = window.__SEQUENCE_PROBE__; probe.longTasks = [];
        const rows = []; let started, previous;
        await new Promise(resolve => { const frame = now => {
          started ??= now; const fraction = Math.min(1, (now - started) / duration), progress = direction === 'forward' ? fraction : 1 - fraction;
          window.__QUACKLES_SEQUENCE__.setProgress(progress);
          const s = window.__QUACKLES_SEQUENCE__.getState();
          rows.push({ at: now - started, dt: previous === undefined ? null : now - previous, intendedProgress: progress, requested: s.requested, rendered: s.rendered, drawCount: s.drawCount, cache: s.cache }); previous = now;
          if (fraction < 1) requestAnimationFrame(frame); else resolve();
        }; requestAnimationFrame(frame); });
        return { rows, longTasks: probe.longTasks };
      }, { direction, duration: Number(process.env.DURATION || 6000) });
      const intervals = pass.rows.map(row => row.dt).filter(value => value !== null), ordered = intervals.slice().sort((a, b) => a - b);
      const p95 = ordered[Math.ceil(ordered.length * .95) - 1], missed = intervals.filter(value => value > interval * 1.5);
      const changed = pass.rows.filter((row, i, rows) => i && row.rendered?.frameId !== rows[i - 1].rendered?.frameId), drawnIds = new Set(changed.map(row => row.rendered?.frameId));
      const summary = { theme, direction, p95, p99: ordered[Math.ceil(ordered.length * .99) - 1], maximumMs: ordered.at(-1), intervals: intervals.length, missedIntervals: missed.length, intervalsOver50Ms: intervals.filter(value => value > 50).length, authoredFrameChanges: changed.length, uniqueDrawnFrames: drawnIds.size, repeatedDisplayedFrames: pass.rows.length - changed.length, limitations: 'No screenshots during this pass. Intervals include host/browser effects and do not identify physical device cadence.' };
      run.evidence.passes.push({ ...summary, ...pass });
      check(`${viewport.width} ${theme} ${direction} rAF p95 within 1.1x observed refresh`, p95 <= interval * 1.1, summary);
    }
    await finish(run, `${viewport.width}-timing`);
  }
}
try {
  if (mode === 'functional') await functional();
  else if (mode === 'gestures') await gestures();
  else if (mode === 'adversarial') await adversarial();
  else if (mode === 'reduced') await reduced();
  else if (mode === 'zoom') await zoom();
  else if (mode === 'timing') await timing();
  else throw new Error('MODE must be functional, gestures, adversarial, reduced, zoom, or timing');
} catch (error) { errors.push({ fatal: true, error: error.stack }); }
finally {
  await browser.close(); report.errors = errors; report.finishedAt = new Date().toISOString(); report.passed = !errors.length && report.checks.every(row => row.passed);
  await fs.writeFile(path.join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ passed: report.passed, checks: report.checks.length, failures: report.checks.filter(row => !row.passed).map(row => row.name), errors, report: path.join(out, 'report.json') }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
