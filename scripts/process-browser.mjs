#!/usr/bin/env node
/** Built-output integration test. Owns an ephemeral static server; never attaches to or kills a user's server. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';

const directory = resolve(process.env.OUT_DIR || 'out');
const artifacts = resolve(process.env.ARTIFACTS || join(process.env.TMPDIR || '.', 'quackles-process-browser'));
const prefix = process.env.NEXT_PUBLIC_BASE_PATH || '';
await mkdir(artifacts, { recursive: true });
const server = spawn('python3', ['-u', '-c',
  'from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler; from functools import partial; import sys; s=ThreadingHTTPServer(("127.0.0.1",0),partial(SimpleHTTPRequestHandler,directory=sys.argv[1])); print(s.server_port,flush=True); s.serve_forever()', directory
], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
let serverLog = '';
server.stderr.on('data', chunk => { serverLog += chunk; });
const stop = () => { server.kill('SIGTERM'); };
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => reject(new Error('server announcement timed out')), 10000);
    let text = '';
    server.once('error', error => { clearTimeout(timer); reject(error); });
    server.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
    server.stdout.on('data', chunk => {
      text += chunk;
      if (/^\d+\n/.test(text)) { clearTimeout(timer); resolvePort(Number(text.trim())); }
    });
  });
  const origin = `http://127.0.0.1:${port}`;
  const url = `${origin}${prefix}/process/`;
  assert.equal((await fetch(url)).status, 200, 'owned server serves the built process route');
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const results = [];
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    // Real no-JS browsing: disclosure controls must be the browser's native behavior.
    const context = await browser.newContext({ viewport, javaScriptEnabled: false, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const failures = [];
    page.on('response', response => { if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`); });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.locator('.process-hero-figure img').evaluate(async image => { await image.decode(); if (!image.naturalWidth) throw new Error('hero did not decode'); });
    await page.waitForTimeout(100); // Allow the decoded image to paint; rAF callbacks do not run in a no-JS context.
    assert.equal(await page.locator('h1').innerText(), 'HOW THIS\nWAS MADE');
    assert.equal(await page.locator('article > section').count(), 11);
    const details = page.locator('details');
    assert.ok(await details.count() >= 22);
    assert.equal(await page.locator('details[open]').count(), 0);
    assert.equal(await page.locator('.process-status').innerText(), 'In progress / October 15');
    const label = viewport.width === 1440 ? 'desktop' : 'mobile';
    await page.screenshot({ path: join(artifacts, `${label}-top.png`) });
    const first = page.locator('#loop-detail-1');
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.ok(await first.evaluate(element => element.open), 'Enter opens native details without JS');
    assert.ok(await first.locator('blockquote').isVisible());
    await first.locator('summary').evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 80));
    await page.screenshot({ path: join(artifacts, `${label}-deep-dive.png`) });
    await first.locator('summary').focus();
    await page.keyboard.press('Space');
    assert.equal(await first.evaluate(element => element.open), false, 'Space closes disclosure');
    const gallery = page.locator('#night-detail-2');
    await gallery.locator('summary').click();
    assert.ok(await gallery.evaluate(element => element.open));
    const galleryImage = gallery.locator('.process-gallery img').first();
    await galleryImage.scrollIntoViewIfNeeded();
    await galleryImage.evaluate(image => image.decode());
    await galleryImage.evaluate(element => window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 40));
    await page.screenshot({ path: join(artifacts, `${label}-gallery.png`) });
    // Exercise every disclosure and every image in the actual exported document.
    for (const item of await details.all()) {
      if (!(await item.evaluate(element => element.open))) await item.locator('summary').click();
      assert.ok(await item.locator('.process-dive-body').isVisible());
    }
    for (const image of await page.locator('article img').all()) {
      await image.scrollIntoViewIfNeeded();
      await image.evaluate(element => element.decode());
      assert.ok(await image.evaluate(element => element.naturalWidth > 0 && element.width > 0));
    }
    const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
    assert.ok(geometry.width <= geometry.viewport, 'no horizontal overflow at the tested width');
    const images = await page.locator('.process-figure img').evaluateAll(nodes => nodes.map(node => ({ width: node.getAttribute('width'), height: node.getAttribute('height'), alt: node.alt, loading: node.loading, src: node.getAttribute('src') })));
    assert.ok(images.every(image => Number(image.width) > 0 && Number(image.height) > 0 && image.alt));
    assert.ok(images.slice(1).every(image => image.loading === 'lazy'));
    assert.ok(images.every(image => image.src.startsWith(`${prefix}/process/images/`)));
    assert.equal(await page.locator('.process-nav a').first().getAttribute('href'), `${prefix}/`);
    const body = await page.locator('main').innerText();
    assert.doesNotMatch(body, /\/mnt\/|\/home\/|\/workspace\/|@session:|[—–]/);
    assert.deepEqual(failures, [], 'no failed local asset requests');
    results.push({ viewport, javaScriptEnabled: false, details: await details.count(), imageInstances: images.length, geometry, keyboard: 'Enter opens / Space closes', assets: 'all decoded', status: 'PASS' });
    await context.close();
  }
  // Also catch hydration/runtime errors in the normal JS-enabled document.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.locator('#day-detail-1 summary').click();
  assert.equal(await page.locator('#day-detail-1').evaluate(element => element.open), true);
  assert.deepEqual(errors, []);
  await writeFile(join(artifacts, 'browser-results.json'), JSON.stringify({ results, hydrationErrors: errors }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', results, hydrationErrors: errors }, null, 2));
} finally {
  await browser?.close();
  if (server.exitCode === null && server.signalCode === null) {
    const exited = once(server, 'exit');
    stop();
    await exited;
  }
  await writeFile(join(artifacts, 'server.log'), serverLog);
  process.removeListener('SIGINT', stop);
  process.removeListener('SIGTERM', stop);
}
