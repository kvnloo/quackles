// Worker-side owner of the native backend. Physics advances on a fixed 50 Hz
// wall clock inside the Worker; the page only receives snapshots. Every
// message carries the page's session token: results computed for an older
// token are dropped. IO (clock, timers, loader, postMessage) is injected so the
// scheduling contract is deterministic under test.
export const CONTROL_PERIOD_MS = 20;
export const MAX_TICKS_PER_STEP = 3;

export function createSimHost({ loadBackend, post, now, setTimer, clearTimer }) {
  let backend = null;
  let token = null;
  let running = false;
  let busy = false;
  let disposed = false;
  let timer = 0;
  let origin = 0;
  let done = 0;
  let dropped = 0;
  let steps = 0;

  const stopClock = () => {
    running = false;
    if (timer) clearTimer(timer);
    timer = 0;
  };
  const schedule = () => {
    if (!running || disposed) return;
    const delay = origin + (done + 1) * CONTROL_PERIOD_MS - now();
    timer = setTimer(tick, Math.max(0, delay));
  };
  function tick() {
    timer = 0;
    if (!running || disposed || !backend) return;
    if (busy) { schedule(); return; }
    const due = Math.floor((now() - origin) / CONTROL_PERIOD_MS) - done;
    if (due <= 0) { schedule(); return; }
    const count = Math.min(MAX_TICKS_PER_STEP, due);
    dropped += due - count;
    done += due;
    busy = true;
    const session = token;
    const started = now();
    backend.step(count).then((result) => {
      busy = false;
      if (disposed || session !== token || !running) return;
      if (result.status !== 'stepped' || !result.snapshot) return;
      steps += result.steps;
      const s = result.snapshot;
      const position = Float64Array.from(s.position);
      const quaternion = Float64Array.from(s.quaternion);
      const joints = Float64Array.from(s.joints);
      post({ type: 'snapshot', token: session, generation: s.generation, time: s.time, position, quaternion, joints, steps, dropped, stepMs: now() - started }, [position.buffer, quaternion.buffer, joints.buffer]);
    }, (error) => {
      busy = false;
      if (disposed || session !== token) return;
      stopClock();
      post({ type: 'error', token: session, message: String(error?.message ?? error) });
    }).finally(schedule);
  }

  const snapshotMessage = (type, s) => ({
    type, token, generation: s.generation, time: s.time,
    position: Float64Array.from(s.position), quaternion: Float64Array.from(s.quaternion), joints: Float64Array.from(s.joints),
  });

  return {
    handle(message) {
      if (disposed || !message || typeof message.type !== 'string') return;
      const { type } = message;
      if (type === 'load') {
        token = message.token;
        const session = token;
        const started = now();
        Promise.resolve().then(() => loadBackend(message.baseUrl)).then((loaded) => {
          if (disposed) { void loaded.dispose(); return; }
          backend = loaded;
          if (session === token) post({ type: 'loaded', token: session, loadMs: now() - started });
        }, (error) => {
          if (!disposed && session === token) post({ type: 'error', token: session, message: String(error?.message ?? error) });
        });
        return;
      }
      if (type === 'dispose') {
        disposed = true;
        stopClock();
        const releasing = backend;
        backend = null;
        Promise.resolve(releasing?.dispose()).catch(() => {}).then(() => post({ type: 'disposed', token }));
        return;
      }
      if (type === 'seed') {
        // A seed opens a new session: anything in flight for the previous
        // token is revoked (the backend also bumps its own generation).
        token = message.token;
        stopClock();
        if (!backend) return;
        try {
          post(snapshotMessage('seeded', backend.seed(message.pose ?? {})));
        } catch (error) {
          post({ type: 'error', token, message: String(error?.message ?? error) });
        }
        return;
      }
      if (message.token !== token || !backend) return;
      if (type === 'command') {
        try { backend.setCommand({ twist: message.twist, head: message.head }); }
        catch (error) { post({ type: 'error', token, message: String(error?.message ?? error) }); }
      } else if (type === 'run') {
        if (running) return;
        backend.resume();
        running = true;
        origin = now();
        done = 0;
        schedule();
      } else if (type === 'pause') {
        if (!running) return;
        stopClock();
        backend.pause();
      }
    },
  };
}
