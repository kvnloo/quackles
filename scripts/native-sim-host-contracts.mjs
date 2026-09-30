// Contracts for the module-Worker host that owns the native backend: a fixed
// 50 Hz clock (never the render loop), session tokens that drop late results,
// pause/resume without catch-up, and one-shot disposal. Deterministic fake
// clock and fake backend; the real backend is covered by native-sim-contracts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimHost, CONTROL_PERIOD_MS, MAX_TICKS_PER_STEP } from '../lib/sim/native/host.mjs';

function harness({ stepDelay = 0, failLoad = false } = {}) {
  let clock = 0;
  const timers = new Map();
  let nextId = 1;
  const posted = [];
  const calls = { step: [], seed: [], command: [], pause: 0, resume: 0, dispose: 0, load: 0 };
  const pending = [];
  let generation = 0;
  let status = 'paused';
  const snap = () => ({
    generation, time: calls.step.reduce((a, b) => a + b, 0) * 0.02,
    position: Float64Array.from([0.01, 0.02, 0.12]), quaternion: Float64Array.from([1, 0, 0, 0]),
    joints: new Float64Array(14).fill(0.5), qpos: new Float64Array(21), velocity: new Float64Array(20),
  });
  const backend = {
    get status() { return status; },
    get generation() { return generation; },
    seed(pose) { calls.seed.push(pose); generation++; status = 'paused'; return snap(); },
    setCommand(c) { calls.command.push(c); },
    resume() { calls.resume++; status = 'running'; },
    pause() { calls.pause++; status = 'paused'; generation++; },
    step(n) {
      calls.step.push(n);
      const result = { status: 'stepped', steps: n, snapshot: snap() };
      if (!stepDelay) return Promise.resolve(result);
      return new Promise((resolve) => pending.push(() => resolve(result)));
    },
    dispose() { calls.dispose++; status = 'disposed'; return Promise.resolve(); },
  };
  const host = createSimHost({
    loadBackend: async () => { calls.load++; if (failLoad) throw new Error('boom'); return backend; },
    post: (message) => posted.push(message),
    now: () => clock,
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, at: clock + Math.max(0, ms) }); return id; },
    clearTimer: (id) => timers.delete(id),
  });
  const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
  const advance = async (ms) => {
    const end = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      clock = Math.max(clock, due[1].at);
      due[1].fn();
      await flush();
    }
    clock = end;
    await flush();
  };
  return { host, posted, calls, advance, flush, pending, timers };
}

const boot = async (h, token = 1) => {
  h.host.handle({ type: 'load', token, baseUrl: 'http://x/sim/native/' });
  await h.flush();
  h.host.handle({ type: 'seed', token, pose: { position: [0, 0, 0.12], quaternion: [1, 0, 0, 0], joints: new Array(14).fill(0) } });
  h.host.handle({ type: 'run', token });
};

test('clock is a fixed 50 Hz control rate, independent of any render loop', async () => {
  assert.equal(CONTROL_PERIOD_MS, 20);
  const h = harness();
  await boot(h);
  assert.deepEqual(h.posted.filter((m) => m.type === 'loaded').map((m) => m.token), [1]);
  assert.equal(h.posted.find((m) => m.type === 'seeded').token, 1);
  await h.advance(1000);
  const ticks = h.calls.step.reduce((a, b) => a + b, 0);
  assert.ok(ticks >= 49 && ticks <= 50, `ticks ${ticks}`);
  assert.ok(h.calls.step.every((n) => n >= 1 && n <= MAX_TICKS_PER_STEP));
  const snaps = h.posted.filter((m) => m.type === 'snapshot');
  assert.equal(snaps.length, h.calls.step.length);
  assert.ok(snaps.every((m) => m.token === 1 && m.joints.length === 14 && m.position.length === 3 && m.quaternion.length === 4));
});

test('catch-up after a stall is capped at three ticks and the excess is dropped, never queued', async () => {
  const h = harness();
  await boot(h);
  // A single timer callback arriving 1 s late (e.g. a long GC pause).
  const [id, timer] = [...h.timers.entries()][0];
  h.timers.delete(id);
  await h.advance(1000);
  timer.fn();
  await h.flush();
  assert.deepEqual(h.calls.step, [3]);
  const dropped = h.posted.filter((m) => m.type === 'snapshot').at(-1).dropped;
  assert.ok(dropped >= 45, `dropped ${dropped}`);
  h.calls.step.length = 0;
  await h.advance(40);
  assert.ok(h.calls.step.reduce((a, b) => a + b, 0) <= 2, JSON.stringify(h.calls.step));
});

test('pause stops stepping; resume does not catch up the paused interval', async () => {
  const h = harness();
  await boot(h);
  await h.advance(100);
  h.host.handle({ type: 'pause', token: 1 });
  const before = h.calls.step.length;
  await h.advance(5000);
  assert.equal(h.calls.step.length, before);
  assert.equal(h.calls.pause, 1);
  h.host.handle({ type: 'run', token: 1 });
  await h.advance(20);
  assert.ok(h.calls.step.slice(before).every((n) => n === 1), JSON.stringify(h.calls.step.slice(before)));
});

test('a step that resolves after the session token changed is dropped', async () => {
  const h = harness({ stepDelay: 1 });
  await boot(h);
  await h.advance(20);
  assert.equal(h.pending.length, 1);
  // Re-seed under a new token while the old inference is still in flight.
  h.host.handle({ type: 'seed', token: 2, pose: {} });
  h.pending.shift()();
  await h.flush();
  assert.equal(h.posted.filter((m) => m.type === 'snapshot').length, 0);
});

test('messages bearing a stale token are ignored', async () => {
  const h = harness();
  await boot(h, 5);
  h.host.handle({ type: 'command', token: 4, twist: [0.25, 0, 0] });
  h.host.handle({ type: 'command', token: 5, twist: [0.1, 0, 0] });
  assert.deepEqual(h.calls.command.map((c) => Array.from(c.twist)), [[0.1, 0, 0]]);
});

test('no second step is issued while one is in flight', async () => {
  const h = harness({ stepDelay: 1 });
  await boot(h);
  await h.advance(200);
  assert.equal(h.calls.step.length, 1);
  h.pending.shift()();
  await h.flush();
  await h.advance(20);
  assert.equal(h.calls.step.length, 2);
});

test('dispose releases the backend once, stops the clock, and ignores later messages', async () => {
  const h = harness();
  await boot(h);
  await h.advance(60);
  h.host.handle({ type: 'dispose', token: 1 });
  h.host.handle({ type: 'dispose', token: 1 });
  await h.flush();
  assert.equal(h.calls.dispose, 1);
  assert.ok(h.posted.some((m) => m.type === 'disposed'));
  const steps = h.calls.step.length;
  h.host.handle({ type: 'run', token: 1 });
  await h.advance(500);
  assert.equal(h.calls.step.length, steps);
  assert.equal(h.timers.size, 0);
});

test('load failures are reported with the token and never start the clock', async () => {
  const h = harness({ failLoad: true });
  h.host.handle({ type: 'load', token: 3, baseUrl: 'http://x/' });
  await h.flush();
  const error = h.posted.find((m) => m.type === 'error');
  assert.equal(error.token, 3);
  assert.match(error.message, /boom/);
  h.host.handle({ type: 'run', token: 3 });
  await h.advance(100);
  assert.equal(h.calls.step.length, 0);
});
