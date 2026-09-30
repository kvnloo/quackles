import assert from 'node:assert/strict';
import { test } from 'node:test';

const backendModule = await import('../lib/sim/native/backend.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function fixture(infer = async () => new Float32Array(14), corruptPhysics = false) {
  // Controllable IO boundary ONLY for lifecycle tests. The real WASM adapter
  // and model/policy are independently exercised by native-sim-smoke.mjs.
  const stats = { steps: 0, releases: 0, deletes: 0, controls: [], observations: [] };
  let state;
  const physics = {
    dimensions: { nq: 21, nv: 20, nu: 14, nbody: 16 },
    seed(pose) { state = { time: 0, ...structuredClone(pose), qpos: Float64Array.from([...pose.position, ...pose.quaternion, ...pose.joints]), controls: new Float64Array(14) }; },
    read() { return { angularVelocity: [0, 0, 0], quaternion: state.quaternion, positions: state.joints, velocities: state.velocity.slice(6) }; },
    snapshot() { return structuredClone(state); },
    control(values) { state.controls = values.slice(); stats.controls.push(values.slice()); },
    step() { stats.steps++; state.time += 0.005; if (corruptPhysics) state.qpos[0] = NaN; },
    forward() {},
    dispose() { stats.deletes++; },
  };
  const policy = {
    async infer(obs) { stats.observations.push(obs.slice()); return infer(obs); },
    async dispose() { stats.releases++; },
  };
  assert.equal(typeof backendModule.createBackend, 'function', 'production lifecycle backend exists');
  return { sim: backendModule.createBackend({ physics, policy }), stats };
}

const contract = await import('../lib/sim/native/contract.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

test('observation is the raw 61-slot policy contract, including inverse trunk gravity', () => {
  assert.equal(typeof contract.buildObservation, 'function', 'native observation builder exists');
  const { buildObservation, JOINT_NAMES, DEFAULT_POSE } = contract;
  assert.equal(JOINT_NAMES.length, 14);
  const observation = buildObservation({
    angularVelocity: [1, 2, 3], quaternion: [Math.SQRT1_2, 0, Math.SQRT1_2, 0],
    positions: DEFAULT_POSE.map((x, i) => x + (i + 1) / 8),
    velocities: Array.from({ length: 14 }, (_, i) => i + 10),
    previousAction: Array.from({ length: 14 }, (_, i) => i - 30),
    command: Array.from({ length: 13 }, (_, i) => i + 40),
  });
  assert.ok(observation instanceof Float32Array);
  assert.equal(observation.length, 61);
  assert.deepEqual(Array.from(observation.slice(0, 3)), [1, 2, 3]);
  assert.ok(Math.abs(observation[3] - 1) < 1e-6);
  assert.ok(Math.abs(observation[4]) < 1e-6 && Math.abs(observation[5]) < 1e-6);
  assert.deepEqual(Array.from(observation.slice(6, 20)), Array.from({ length: 14 }, (_, i) => (i + 1) / 8));
  assert.deepEqual(Array.from(observation.slice(20, 34)), Array.from({ length: 14 }, (_, i) => i + 10));
  assert.deepEqual(Array.from(observation.slice(34, 48)), Array.from({ length: 14 }, (_, i) => i - 30));
  assert.deepEqual(Array.from(observation.slice(48)), Array.from({ length: 13 }, (_, i) => i + 40));
});

test('seed and snapshots own their buffers; a step executes four physics ticks with raw action history', async () => {
  const raw = Float32Array.from({ length: 14 }, (_, i) => i / 10);
  const { sim, stats } = fixture(async () => raw);
  assert.equal(sim.status, 'paused');
  assert.equal((await sim.step()).status, 'paused');
  const pose = { position: [2, 3, 0.12], quaternion: [1, 0, 0, 0], joints: [...contract.DEFAULT_POSE] };
  sim.seed(pose);
  pose.position[0] = 999;
  const copy = sim.snapshot();
  assert.equal(copy.position[0], 2);
  copy.position[0] = -999;
  copy.joints.fill(99);
  copy.previousAction.fill(99);
  assert.equal(sim.snapshot().position[0], 2);
  assert.deepEqual(Array.from(sim.snapshot().previousAction), new Array(14).fill(0));
  const command = { twist: [0.25, 0, 0.3], head: [0.1, 0.2, 0.3, 0.4], body: [0, 0, 0, 0, 0, 0] };
  sim.setCommand(command);
  command.twist[0] = 99;
  sim.resume();
  const result = await sim.step();
  assert.equal(result.status, 'stepped');
  assert.equal(result.steps, 1);
  assert.equal(stats.steps, 4);
  assert.ok(Math.abs(result.snapshot.time - 0.02) < 1e-12);
  assert.deepEqual(Array.from(stats.controls[0]), contract.DEFAULT_POSE.map((x, i) => x + raw[i]));
  assert.equal(stats.observations[0][48], 0.25);
  assert.ok(Math.abs(stats.observations[0][51] - 0.02) < 1e-6, 'head EMA alpha 0.2');
  await sim.step();
  assert.deepEqual(Array.from(stats.observations[1].slice(34, 48)), Array.from(raw));
  raw.fill(77);
  assert.notEqual(sim.snapshot().previousAction[0], 77);
  sim.seed();
  assert.equal(sim.status, 'paused');
  assert.ok(sim.snapshot().previousAction.every(x => x === 0));
  assert.ok(sim.snapshot().command.every(x => x === 0));
  await sim.dispose();
  assert.equal(stats.releases, 1);
  assert.equal(stats.deletes, 1);
});

test('step work is serialized with zero queue and at most three policy ticks per call', async () => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  let calls = 0, active = 0, maxActive = 0;
  const { sim, stats } = fixture(async () => {
    calls++; active++; maxActive = Math.max(maxActive, active); started.resolve();
    try { if (calls === 1) await gate.promise; return new Float32Array(14); }
    finally { active--; }
  });
  sim.resume();
  const first = sim.step(900);
  await started.promise;
  try {
    assert.equal((await sim.step()).status, 'busy');
    assert.equal(calls, 1);
    gate.resolve();
    const result = await first;
    assert.equal(result.steps, 3);
    assert.equal(stats.steps, 12);
    assert.equal(maxActive, 1);
    // Immediate consumer continuation must be admitted, not spuriously busy.
    assert.equal((await sim.step()).status, 'stepped');
    assert.throws(() => sim.step(NaN), /integer/);
    assert.throws(() => sim.step(-1), /integer/);
    assert.equal((await sim.step(0)).steps, 0);
  } finally { gate.resolve(); await first; await sim.dispose(); }
});

for (const lateReject of [false, true]) {
  test(`pause/seed/reentry revokes an in-flight ${lateReject ? 'rejection' : 'result'} without late writes`, async () => {
    const gate = Promise.withResolvers(), started = Promise.withResolvers();
    let calls = 0;
    const { sim, stats } = fixture(async () => { if (++calls === 1) { started.resolve(); return gate.promise; } return new Float32Array(14); });
    sim.setCommand({ head: [1, 1, 1, 1] });
    sim.resume();
    const pending = sim.step(3);
    await started.promise;
    sim.pause();
    const paused = sim.snapshot();
    sim.seed({ position: [5, 6, 0.12] });
    sim.resume();
    const generation = sim.generation;
    const busy = await sim.step();
    assert.equal(busy.status, 'busy', 'reentry may not run concurrent ORT work');
    if (lateReject) gate.reject(new Error('old inference failed')); else gate.resolve(new Float32Array(14).fill(3));
    const stale = await pending;
    assert.equal(stale.status, 'stale');
    assert.equal(stale.snapshot, null);
    assert.equal(stats.steps, 0);
    assert.equal(stats.controls.length, 0);
    assert.equal(sim.generation, generation);
    assert.equal(sim.status, 'running');
    assert.ok(paused.head.every(x => x === 0), 'uncommitted EMA must not leak');
    assert.equal(sim.snapshot().position[0], 5);
    assert.ok(sim.snapshot().previousAction.every(x => x === 0));
    assert.equal((await sim.step()).status, 'stepped');
    await sim.dispose();
  });
}

test('dispose revokes immediately but releases resources once, only after in-flight inference settles', async () => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const { sim, stats } = fixture(async () => { started.resolve(); return gate.promise; });
  sim.resume();
  const pending = sim.step();
  await started.promise;
  const disposing = sim.dispose();
  assert.equal(sim.status, 'disposed');
  assert.equal(sim.dispose(), disposing, 'idempotent disposal promise');
  assert.equal(stats.releases, 0);
  assert.equal(stats.deletes, 0);
  assert.equal((await sim.step()).status, 'disposed');
  for (const operation of [() => sim.seed(), () => sim.resume(), () => sim.pause(), () => sim.setCommand(), () => sim.snapshot()]) assert.throws(operation, /disposed/);
  gate.resolve(new Float32Array(14).fill(100));
  assert.equal((await pending).status, 'stale');
  await disposing;
  assert.equal(stats.steps, 0);
  assert.equal(stats.releases, 1);
  assert.equal(stats.deletes, 1);
});

test('current inference failures and malformed actions pause atomically and permit immediate retry', async () => {
  let calls = 0;
  const { sim, stats } = fixture(async () => {
    if (++calls === 1) throw new Error('inference failure');
    if (calls === 2) return new Float32Array(14).fill(Infinity);
    return new Float32Array(14);
  });
  sim.setCommand({ head: [1, 1, 1, 1] });
  sim.resume();
  for (const message of [/inference failure/, /finite/]) {
    try { await sim.step(); assert.fail('must reject'); }
    catch (error) {
      assert.match(error.message, message);
      assert.equal(sim.status, 'paused');
      assert.equal(stats.controls.length, 0);
      assert.equal(stats.steps, 0);
      assert.ok(sim.snapshot().head.every(x => x === 0));
      sim.resume();
    }
  }
  assert.equal((await sim.step()).status, 'stepped');
  const before = sim.snapshot();
  assert.throws(() => sim.setCommand({ twist: [0.1, 0, 0], head: [NaN, 0, 0, 0] }), /finite/);
  assert.deepEqual(sim.snapshot().command, before.command);
  assert.throws(() => sim.seed({ quaternion: [0, 0, 0, 0] }), /unit/);
  assert.equal(sim.status, 'running');
  await sim.dispose();
});

test('nonfinite physics never escapes as a renderable snapshot', async () => {
  const { sim } = fixture(undefined, true);
  sim.resume();
  await assert.rejects(sim.step(), /finite/);
  assert.equal(sim.status, 'paused');
  assert.throws(() => sim.snapshot(), /finite/);
  sim.seed();
  assert.ok(sim.snapshot().qpos.every(Number.isFinite));
  await sim.dispose();
});

test('pause/resume alone invalidates old inference, even without a reseed', async () => {
  const gate = Promise.withResolvers(), started = Promise.withResolvers();
  const { sim, stats } = fixture(async () => { started.resolve(); return gate.promise; });
  sim.resume();
  const pending = sim.step();
  await started.promise;
  const generation = sim.generation;
  sim.pause(); sim.resume();
  assert.ok(sim.generation > generation);
  gate.resolve(new Float32Array(14).fill(1));
  assert.equal((await pending).status, 'stale');
  assert.equal(stats.steps, 0);
  assert.ok(sim.snapshot().previousAction.every(x => x === 0));
  await sim.dispose();
});

test('dispose before an admitted job starts prevents even its inference call', async () => {
  const { sim, stats } = fixture();
  sim.resume();
  const pending = sim.step();
  const disposing = sim.dispose();
  assert.equal((await pending).status, 'stale');
  await disposing;
  assert.equal(stats.observations.length, 0);
  assert.equal(stats.deletes, 1);
});

test('ORT adapter releases late-created sessions on abort or incompatible metadata', async () => {
  const { createPolicy } = await import('../lib/sim/native/policy.mjs');
  for (const abort of [false, true]) {
    const gate = Promise.withResolvers(), started = Promise.withResolvers();
    const controller = new AbortController();
    let releases = 0;
    const session = {
      inputNames: ['obs'], outputNames: ['actions'],
      inputMetadata: [{ isTensor: true, type: 'float32', shape: [1, abort ? 61 : 60] }],
      outputMetadata: [{ isTensor: true, type: 'float32', shape: [1, 14] }],
      async release() { releases++; },
    };
    const ort = { env: { versions: { web: '1.27.0' }, wasm: {} }, InferenceSession: { async create() { started.resolve(); await gate.promise; return session; } } };
    const pending = createPolicy({ ort, bytes: new Uint8Array(), wasmBinary: new Uint8Array(), signal: controller.signal });
    await started.promise;
    if (abort) controller.abort();
    gate.resolve();
    await assert.rejects(pending, abort ? { name: 'AbortError' } : /obs float32/);
    assert.equal(releases, 1);
    assert.equal(ort.env.wasm.wasmBinary, undefined);
  }
});

test('position controls add DEFAULT_POSE without clipping or normalizing raw action', () => {
  assert.equal(typeof contract.actionTargets, 'function');
  const raw = Float32Array.from({ length: 14 }, (_, i) => i - 8);
  const targets = contract.actionTargets(raw);
  assert.deepEqual(Array.from(targets), contract.DEFAULT_POSE.map((pose, i) => pose + raw[i]));
  assert.deepEqual(Array.from(raw), Array.from({ length: 14 }, (_, i) => i - 8));
  assert.throws(() => contract.actionTargets([1]), /14/);
  raw[3] = NaN;
  assert.throws(() => contract.actionTargets(raw), /finite/);
});

test('observation rejects malformed, nonfinite and nonunit state before inference', () => {
  const valid = { angularVelocity: [0, 0, 0], quaternion: [1, 0, 0, 0], positions: contract.DEFAULT_POSE, velocities: new Float64Array(14), previousAction: new Float32Array(14), command: new Float32Array(13) };
  assert.ok(contract.buildObservation(valid).slice(3, 6).every((x, i) => Math.abs(x - [0, 0, -1][i]) < 1e-6));
  for (const [key, value] of [['positions', [0]], ['quaternion', [0, 0, 0, 0]], ['angularVelocity', [1e100, 0, 0]], ['command', [NaN, ...new Array(12).fill(0)]]]) {
    assert.throws(() => contract.buildObservation({ ...valid, [key]: value }), /finite|length|unit/);
  }
});
