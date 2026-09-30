import { DEFAULT_POSE, DECIMATION, buildObservation, actionTargets, finiteVector } from './contract.mjs';

// IO is injectable for deterministic scheduling tests; loadNativeBackend wires
// only the real pinned MuJoCo/ORT implementations. No clocks, DOM or renderers.
export function createBackend({ physics, policy }) {
  let status = 'paused', activeJob = null, disposal = null, generation = 0;
  const check = () => { if (status === 'disposed') throw new Error('Native backend disposed'); };
  let previousAction = new Float32Array(14), command = new Float32Array(13), head = new Float32Array(4);
  const snapshot = () => {
    check();
    const state = physics.snapshot();
    if (!Number.isFinite(state.time)) throw new Error('Physics time must be finite');
    for (const [key, size] of [['position', 3], ['quaternion', 4], ['joints', 14], ['qpos', 21], ['velocity', 20], ['controls', 14]]) finiteVector(state[key], size, key);
    return { ...state, generation, previousAction: previousAction.slice(), command: command.slice(), head: head.slice() };
  };
  const seed = (pose = {}) => {
    check();
    const position = finiteVector(pose.position ?? [0, 0, 0.12], 3, 'position');
    const quaternion = finiteVector(pose.quaternion ?? [1, 0, 0, 0], 4, 'quaternion');
    const joints = finiteVector(pose.joints ?? DEFAULT_POSE, 14, 'joints');
    const velocity = finiteVector(pose.velocity ?? new Float64Array(20), 20, 'velocity');
    if (Math.abs(Math.hypot(...quaternion) - 1) > 1e-6) throw new TypeError('quaternion must be unit length');
    status = 'paused'; generation++;
    physics.seed({ position, quaternion, joints, velocity });
    previousAction = new Float32Array(14); command = new Float32Array(13); head = new Float32Array(4);
    return snapshot();
  };
  seed();
  return {
    get status() { return status; },
    get generation() { return generation; },
    snapshot, seed,
    setCommand({ twist, head: headTarget, body } = {}) {
      check();
      const next = command.slice();
      if (twist !== undefined) next.set(finiteVector(twist, 3, 'twist', Float32Array), 0);
      if (headTarget !== undefined) next.set(finiteVector(headTarget, 4, 'head', Float32Array), 3);
      if (body !== undefined) next.set(finiteVector(body, 6, 'body', Float32Array), 7);
      command = next;
    },
    resume() { check(); status = 'running'; },
    pause() { check(); status = 'paused'; generation++; },
    step(count = 1) {
      if (!Number.isSafeInteger(count) || count < 0) throw new TypeError('step count must be a nonnegative integer');
      if (status !== 'running') return Promise.resolve({ status, steps: 0, snapshot: null });
      if (activeJob) return Promise.resolve({ status: 'busy', steps: 0, snapshot: null });
      const token = generation;
      const current = () => status === 'running' && token === generation;
      const stale = steps => ({ status: 'stale', steps, snapshot: null });
      // One in-flight job, no queue. Excess catch-up is discarded, not deferred.
      activeJob = Promise.resolve().then(async () => {
        let steps = 0;
        try {
          for (; steps < Math.min(count, 3); steps++) {
            if (!current()) return stale(steps);
            const nextHead = Float32Array.from(head, (value, i) => value + 0.2 * (command[3 + i] - value));
            const inputCommand = command.slice(); inputCommand.set(nextHead, 3);
            const obs = buildObservation({ ...physics.read(), previousAction, command: inputCommand });
            const result = await policy.infer(obs);
            if (!current()) return stale(steps);
            const raw = finiteVector(result, 14, 'action', Float32Array);
            physics.control(actionTargets(raw));
            previousAction = raw; head = nextHead;
            for (let i = 0; i < DECIMATION; i++) physics.step();
            physics.forward();
          }
          return { status: 'stepped', steps, snapshot: snapshot() };
        } catch (error) {
          if (!current()) return stale(steps);
          status = 'paused'; generation++;
          throw error;
        } finally { activeJob = null; }
      });
      return activeJob;
    },
    dispose() {
      if (disposal) return disposal;
      status = 'disposed'; generation++;
      // ORT has no cancellable session.run. Quarantine late output, then release.
      disposal = (async () => {
        try { await activeJob; } catch { /* the originating step owns this error */ }
        try { await policy.dispose(); } finally { physics.dispose(); }
      })();
      return disposal;
    },
  };
}
