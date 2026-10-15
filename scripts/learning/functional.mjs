#!/usr/bin/env node
/** DOM/JS-only extraction of browser.mjs lines 28–36; NOT visual, pointer, keyboard or perf proof.
 * LIGHTPANDA=/path/to/lightpanda BASE_URL=http://127.0.0.1:43219 node scripts/learning/functional.mjs
 * ENGINE=chromium uses the original Playwright click/select path as the differential baseline.
 * Requires Node >=22 (native WebSocket). No changes to existing rendering/browser gates.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { performance } from 'node:perf_hooks';

const engine = process.env.ENGINE || process.argv[2] || 'lightpanda';
assert.ok(['chromium', 'lightpanda', 'lightpanda-raw'].includes(engine), 'supported functional engine');
const base = new URL(process.env.BASE_URL || 'http://127.0.0.1:43219');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname), 'local preview only');
const url = new URL(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/learn/`, base).href;
const started = performance.now();
let browser, page, child, socket, sessionId, nextId = 0;
const pending = new Map();
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const timeout = 10000;

async function send(method, params = {}, session = sessionId) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(session ? { sessionId: session } : {}) }));
  });
}
async function evaluate(expression) {
  if (page) return page.evaluate(expression);
  const reply = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  assert.ok(!reply.exceptionDetails, JSON.stringify(reply.exceptionDetails));
  return reply.result.value;
}
async function until(expression) {
  const deadline = performance.now() + timeout;
  do { if (await evaluate(expression)) return; await sleep(10); } while (performance.now() < deadline);
  throw new Error(`Condition timed out: ${expression}`);
}
async function select(id, value) {
  if (page) await page.selectOption(id, value);
  else await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(id)}); element.value = ${JSON.stringify(value)}; element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  // The real handler awaits load() even when data is already loaded. Flush it before asserting.
  await evaluate('Promise.resolve().then(() => true)');
}
async function count(selector) {
  return evaluate(`document.querySelectorAll(${JSON.stringify(selector)}).length`);
}
try {
  if (engine === 'chromium') {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/chromium', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(timeout);
    await page.goto(url, { waitUntil: 'domcontentloaded' });
  } else {
    child = spawn(process.env.LIGHTPANDA || 'lightpanda', ['serve', '--host', '127.0.0.1', '--port', '0', '--load-resources', 'stylesheet'], {
      env: { ...process.env, LIGHTPANDA_DISABLE_TELEMETRY: 'true', LIGHTPANDA_DISABLE_CORE_DUMP: '1' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Lightpanda startup timed out')), timeout);
      const fail = error => { clearTimeout(timer); reject(error); };
      child.once('error', fail);
      child.once('exit', code => fail(new Error(`Lightpanda exited ${code}`)));
      let log = '';
      child.stderr.on('data', bytes => {
        log += bytes.toString();
        const match = log.match(/server running.*address=127\.0\.0\.1:(\d+)/);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
    });
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP connection timed out')), timeout);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP connection failed')); }, { once: true });
    });
    socket.addEventListener('message', ({ data }) => {
      const response = JSON.parse(data);
      const call = pending.get(response.id);
      if (!call) return;
      pending.delete(response.id); clearTimeout(call.timer);
      if (response.error) call.reject(new Error(JSON.stringify(response.error))); else call.resolve(response.result);
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
    sessionId = (await send('Target.attachToTarget', { targetId, flatten: true }, null)).sessionId;
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', { url });
    await until("document.readyState === 'complete' || document.readyState === 'interactive'");
  }
  const counts = [];
  assert.equal(await count('.learn-lesson'), 6, 'six lessons');
  assert.equal(await count('#learn-results details'), 10, 'ten initial curated records');
  // Expected total comes from the real immutable JSON, not a fabricated or hard-coded count.
  const source = await evaluate("new URL(document.querySelector('#explorer').dataset.source, location.href).href");
  const response = await fetch(source);
  assert.equal(response.status, 200, 'immutable explorer data served');
  const expected = (await response.json()).length;
  if (page) await page.locator('#learn-load').click();
  else await evaluate("document.querySelector('#learn-load').click()");
  await until("document.querySelector('#learn-status').textContent.includes('matching records')");
  const status = await evaluate("document.querySelector('#learn-status').textContent");
  assert.ok(status.startsWith(`${expected} matching records`), 'full explorer dataset loaded');
  for (const [selector, value, expectedCount] of [
    ['#learn-method', 'conservative-review', 5],
    ['#learn-scene', 'day', 1],
    ['#learn-outcome', 'kept', 0],
    ['#learn-method', 'geometry-fit', 1],
  ]) {
    await select(selector, value);
    const actual = await count('#learn-results details');
    assert.equal(actual, expectedCount, `${selector}=${value}`);
    counts.push(actual);
  }
  console.log(JSON.stringify({ status: 'PASS', engine, expectedRecords: expected, filterCounts: counts, elapsedMs: performance.now() - started, scope: 'DOM/JS only; no physical pointer, keyboard, layout, paint, image decode or frame-rate claim' }));
} finally {
  await browser?.close();
  socket?.close();
  for (const call of pending.values()) { clearTimeout(call.timer); call.reject(new Error('CDP closed')); }
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
    await exited; clearTimeout(timer);
  }
}
