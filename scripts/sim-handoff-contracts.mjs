// Contracts for the ?sim=1 story -> simulator state machine (pure; no DOM).
// Run: node --test scripts/sim-handoff-contracts.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDOFF, initialHandoff, reduceHandoff, handoffWeights, loadStage } from '../lib/sim/handoff-machine.ts';

const run = (state, events) => events.reduce(reduceHandoff, state);
const ticks = (ms, step = 16) => Array.from({ length: Math.ceil(ms / step) }, () => ({ type: 'tick', dt: step }));
const wheel = (deltaY, now, progress = 1, atMinZoom = true) => ({ type: 'wheel', deltaY, now, progress, atMinZoom });
const enterByWheel = (s, now = 0) => run(s, [wheel(120, now), wheel(120, now + 50), wheel(120, now + 100)]);

test('load stages: nothing before 0.78, live layer from 0.78, runtime prefetch from 0.92', () => {
  assert.equal(HANDOFF.liveProgress, 0.78);
  assert.equal(HANDOFF.runtimeProgress, 0.92);
  assert.equal(loadStage(0), 'none');
  assert.equal(loadStage(0.7799), 'none');
  assert.equal(loadStage(0.78), 'live');
  assert.equal(loadStage(0.9199), 'live');
  assert.equal(loadStage(0.92), 'runtime');
  assert.equal(loadStage(1), 'runtime');
});

test('wheel below the end of the story never leaves STORY', () => {
  const s = run(initialHandoff(false), Array.from({ length: 40 }, (_, i) => wheel(400, i * 10, 0.998)));
  assert.equal(s.phase, 'story');
});

test('entry needs SUSTAINED down-intent at p>=0.999; a single flick or a paused gesture does not enter', () => {
  const one = run(initialHandoff(false), [wheel(200, 0)]);
  assert.equal(one.phase, 'story');
  const gap = run(initialHandoff(false), [wheel(200, 0), wheel(200, 0 + HANDOFF.intentWindowMs + 1)]);
  assert.equal(gap.phase, 'story');
  const reversed = run(initialHandoff(false), [wheel(200, 0), wheel(-10, 30), wheel(200, 60)]);
  assert.equal(reversed.phase, 'story');
  const sustained = enterByWheel(initialHandoff(false));
  assert.equal(sustained.phase, 'swap-in');
  assert.equal(sustained.entries, 1);
});

test('forward path: SWAP cross-fade, then REASSEMBLE ~1 s, then SIM once the backend is ready', () => {
  let s = enterByWheel(initialHandoff(false));
  let w = handoffWeights(s);
  assert.deepEqual([w.liveOpacity, w.assembled], [0, 0]);
  s = run(s, ticks(HANDOFF.swapMs));
  assert.equal(s.phase, 'reassemble');
  assert.equal(handoffWeights(s).liveOpacity, 1);
  assert.equal(handoffWeights(s).assembled, 0);
  let last = 0;
  for (let i = 0; i < 200 && s.phase === 'reassemble'; i++) {
    s = reduceHandoff(s, { type: 'tick', dt: 16 });
    const a = handoffWeights(s).assembled;
    assert.ok(a >= last, 'assembly weight is monotonic');
    last = a;
  }
  assert.ok(HANDOFF.reassembleMs >= 800 && HANDOFF.reassembleMs <= 1200);
  assert.equal(s.phase, 'await');
  assert.equal(handoffWeights(s).assembled, 1);
  s = reduceHandoff(s, { type: 'backend-ready' });
  assert.equal(s.phase, 'sim');
});

test('a backend that is ready before reassembly completes enters SIM directly', () => {
  let s = enterByWheel(initialHandoff(false));
  s = reduceHandoff(s, { type: 'backend-ready' });
  s = run(s, ticks(HANDOFF.swapMs + HANDOFF.reassembleMs + 32));
  assert.equal(s.phase, 'sim');
});

test('exit path mirrors entry: SIM -> return -> disassemble -> swap-out -> STORY', () => {
  let s = run(enterByWheel(initialHandoff(false)), [{ type: 'backend-ready' }, ...ticks(HANDOFF.swapMs + HANDOFF.reassembleMs + 32)]);
  assert.equal(s.phase, 'sim');
  s = reduceHandoff(s, { type: 'exit' });
  assert.equal(s.phase, 'return');
  assert.equal(handoffWeights(s).simPose, 1);
  s = run(s, ticks(HANDOFF.returnMs + 16));
  assert.equal(s.phase, 'disassemble');
  assert.equal(handoffWeights(s).simPose, 0);
  s = run(s, ticks(HANDOFF.reassembleMs + 16));
  assert.equal(s.phase, 'swap-out');
  assert.equal(handoffWeights(s).assembled, 0);
  s = run(s, ticks(HANDOFF.swapMs + 16));
  assert.equal(s.phase, 'story');
  assert.equal(handoffWeights(s).liveOpacity, 0);
  assert.equal(s.exits, 1);
});

test('exit mid-reassembly reverses from the current assembly weight (no jump)', () => {
  let s = run(enterByWheel(initialHandoff(false)), ticks(HANDOFF.swapMs + HANDOFF.reassembleMs * 0.4));
  assert.equal(s.phase, 'reassemble');
  const before = handoffWeights(s).assembled;
  s = reduceHandoff(s, { type: 'exit' });
  assert.equal(s.phase, 'disassemble');
  assert.ok(Math.abs(handoffWeights(s).assembled - before) < 1e-9);
  s = run(enterByWheel(initialHandoff(false)), ticks(HANDOFF.swapMs * 0.5));
  const opacity = handoffWeights(s).liveOpacity;
  s = reduceHandoff(s, { type: 'exit' });
  assert.equal(s.phase, 'swap-out');
  assert.ok(Math.abs(handoffWeights(s).liveOpacity - opacity) < 1e-9);
});

test('wheel-up exits SIM only at minimum zoom and only when sustained', () => {
  let s = run(enterByWheel(initialHandoff(false)), [{ type: 'backend-ready' }, ...ticks(HANDOFF.swapMs + HANDOFF.reassembleMs + 32)]);
  s = run(s, [wheel(-300, 5000, 1, false), wheel(-300, 5050, 1, false), wheel(-300, 5100, 1, false)]);
  assert.equal(s.phase, 'sim');
  s = run(s, [wheel(-100, 6000)]);
  assert.equal(s.phase, 'sim');
  s = run(s, [wheel(-150, 6050), wheel(-150, 6100)]);
  assert.equal(s.phase, 'return');
});

test('input during transitions is ignored (deterministic, no re-entry until STORY)', () => {
  let s = run(enterByWheel(initialHandoff(false)), [{ type: 'backend-ready' }, ...ticks(HANDOFF.swapMs + HANDOFF.reassembleMs + 32), { type: 'exit' }]);
  s = run(s, [{ type: 'enter', progress: 1 }, wheel(400, 9000), wheel(400, 9010)]);
  assert.equal(s.phase, 'return');
  assert.equal(s.entries, 1);
});

test('backend failure in SIM returns to the story', () => {
  let s = run(enterByWheel(initialHandoff(false)), [{ type: 'backend-ready' }, ...ticks(HANDOFF.swapMs + HANDOFF.reassembleMs + 32)]);
  s = reduceHandoff(s, { type: 'backend-lost' });
  assert.equal(s.phase, 'return');
});

test('reduced motion: wheel never enters; the explicit button enters with no animation; exit is instant', () => {
  let s = run(initialHandoff(true), Array.from({ length: 20 }, (_, i) => wheel(400, i * 10)));
  assert.equal(s.phase, 'story');
  s = reduceHandoff(s, { type: 'enter', progress: 1 });
  assert.equal(s.phase, 'await');
  assert.deepEqual([handoffWeights(s).liveOpacity, handoffWeights(s).assembled], [1, 1]);
  s = reduceHandoff(s, { type: 'backend-ready' });
  assert.equal(s.phase, 'sim');
  s = reduceHandoff(s, { type: 'exit' });
  assert.equal(s.phase, 'story');
  assert.equal(handoffWeights(s).liveOpacity, 0);
});

test('the explicit button also works without reduced motion, but only at the end of the story', () => {
  assert.equal(reduceHandoff(initialHandoff(false), { type: 'enter', progress: 0.5 }).phase, 'story');
  assert.equal(reduceHandoff(initialHandoff(false), { type: 'enter', progress: 1 }).phase, 'swap-in');
});
