import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const runtimeSource = process.env.NATIVE_SIM_RUNTIME_SOURCE;
const buildPreparation = spawnSync('npm', ['run', 'prebuild', '--', '--help'], { cwd: root, encoding: 'utf8' });
assert.equal(buildPreparation.status, 0, `npm build must have a usable native asset preparation lifecycle:\n${buildPreparation.stderr}`);
const prepared = spawnSync(process.execPath, ['scripts/prepare-native-sim.mjs', ...(runtimeSource ? ['--runtime-source', runtimeSource] : ['--download'])], { cwd: root, encoding: 'utf8' });
assert.equal(prepared.status, 0, `actual static asset preparation must succeed:
${prepared.stderr}`);
const cached = spawnSync(process.execPath, ['--input-type=module', '-e', `globalThis.fetch = async () => { throw new Error('Network disabled by cache test'); }; process.argv = [process.execPath, 'scripts/prepare-native-sim.mjs', '--download']; await import('./scripts/prepare-native-sim.mjs');`], { cwd: root, encoding: 'utf8' });
assert.equal(cached.status, 0, `verified existing runtime sidecars must permit offline rebuilds:\n${cached.stderr}`);

const manifest = JSON.parse(await readFile(new URL('../public/sim/native/assets.json', import.meta.url)));
assert.equal(manifest.schema, 1);
assert.equal(manifest.meshes.length, 9);
for (const file of manifest.files) {
  const bytes = await readFile(new URL(`../public/sim/native/${file.path}`, import.meta.url));
  assert.equal(bytes.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
console.log(JSON.stringify({ stage: 'preparation', files: manifest.files.length, meshes: manifest.meshes.length, verified: true }));

const physicsModule = await import('../lib/sim/native/physics.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
assert.equal(typeof physicsModule.createPhysics, 'function', 'real native physics adapter exists');
const { default: MuJoCo } = await import('../public/sim/native/runtime/mujoco.mjs');
const module = await MuJoCo({ wasmBinary: new Uint8Array(await readFile(new URL('../public/sim/native/runtime/mujoco.wasm', import.meta.url))) });
const ownedHandles = [];
const track = (kind, value) => { ownedHandles.push({ kind, value }); return value; };
const mujoco = new Proxy(module, { get(target, key) {
  if (key === 'MjVFS' || key === 'MjData') return new Proxy(target[key], { construct(Type, args) { return track(key, Reflect.construct(Type, args)); } });
  if (key === 'MjModel') return new Proxy(target[key], { get(Type, method) { return method === 'from_xml_string' ? (...args) => track('MjModel', Type[method](...args)) : Type[method]; } });
  return target[key];
} });
const xml = await readFile(new URL('../public/sim/native/collision.xml', import.meta.url), 'utf8');
const meshes = new Map(await Promise.all(manifest.meshes.map(async path => [path, new Uint8Array(await readFile(new URL(`../public/sim/native/${path}`, import.meta.url)))])));
const physics = physicsModule.createPhysics({ mujoco, xml, meshes });
const { DEFAULT_POSE, actionTargets } = await import('../lib/sim/native/contract.mjs');
assert.equal(physics.mapping.joints.length, 14);
assert.equal(new Set(physics.mapping.joints.map(j => j.actuator)).size, 14);
assert.deepEqual(physics.dimensions, { nq: 21, nv: 20, nu: 14, nbody: 16 });
physics.seed({ position: [0, 0, 0.12], quaternion: [1, 0, 0, 0], joints: DEFAULT_POSE, velocity: new Float64Array(20) });
assert.deepEqual(Array.from(physics.read().positions), DEFAULT_POSE);
physics.control(actionTargets(new Float32Array(14)));
for (let i = 0; i < 4; i++) physics.step();
physics.forward();
assert.ok(Math.abs(physics.snapshot().time - 0.02) < 1e-12);
assert.ok(physics.snapshot().qpos.every(Number.isFinite));
const escaped = physics.snapshot();
escaped.qpos.fill(666);
assert.notEqual(physics.snapshot().qpos[0], 666);
assert.throws(() => physicsModule.createPhysics({ mujoco, xml: xml.replace('timestep="0.005"', 'timestep="0.002"'), meshes }), /timestep/);
assert.throws(() => physicsModule.createPhysics({ mujoco, xml: xml.replace('name="left_hip_yaw" joint="left_hip_yaw"', 'name="left_hip_yaw" joint="left_knee"'), meshes }), /transmission/);
// Swapping actuator order must not change named controls or resulting physics.
const shuffledXml = xml.replace(/<actuator>([\s\S]*?)<\/actuator>/, (_match, body) => `<actuator>${body.match(/<position\b[^>]*\/>/g).reverse().join('\n')}</actuator>`);
const shuffled = physicsModule.createPhysics({ mujoco, xml: shuffledXml, meshes });
const comparison = physicsModule.createPhysics({ mujoco, xml, meshes });
try {
  const pose = { position: [0, 0, 0.12], quaternion: [1, 0, 0, 0], joints: DEFAULT_POSE, velocity: new Float64Array(20) };
  const controls = actionTargets(Float32Array.from({ length: 14 }, (_, i) => i * 0.01));
  for (const engine of [shuffled, comparison]) {
    engine.seed(pose); engine.control(controls);
    for (let i = 0; i < 4; i++) engine.step();
  }
  assert.ok(shuffled.mapping.joints.some((j, i) => j.actuator !== i));
  assert.ok(shuffled.snapshot().qpos.every((x, i) => Math.abs(x - comparison.snapshot().qpos[i]) < 1e-12));
} finally { shuffled.dispose(); comparison.dispose(); }
physics.dispose();
physics.dispose();
assert.throws(() => physics.snapshot(), /disposed/);
console.log(JSON.stringify({ stage: 'physics', version: mujoco.mj_versionString(), mappings: 14, simulationSeconds: escaped.time, cleanup: true }));

const policyModule = await import('../lib/sim/native/policy.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
assert.equal(typeof policyModule.createPolicy, 'function', 'real ORT WASM adapter exists');
const ortNative = await import('../public/sim/native/runtime/ort.wasm.bundle.min.mjs');
let sessionReleases = 0;
const ort = { ...ortNative, InferenceSession: { async create(...args) {
  const session = await ortNative.InferenceSession.create(...args);
  const release = session.release.bind(session);
  session.release = async () => { await release(); sessionReleases++; };
  return session;
} } };
const policy = await policyModule.createPolicy({ ort, bytes: new Uint8Array(await readFile(new URL('../public/sim/native/alpha_walking.onnx', import.meta.url))), wasmBinary: new Uint8Array(await readFile(new URL('../public/sim/native/runtime/ort-wasm-simd-threaded.wasm', import.meta.url))) });
assert.equal(ort.env.wasm.numThreads, 1);
assert.equal(ort.env.wasm.proxy, false);
assert.deepEqual(policy.metadata.input.shape, [1, 61]);
assert.deepEqual(policy.metadata.output.shape, [1, 14]);
const { createBackend } = await import('../lib/sim/native/backend.mjs');
const sim = createBackend({ physics: physicsModule.createPhysics({ mujoco, xml, meshes }), policy });
const runs = [];
try {
  for (const vx of [0, 0.25]) {
    sim.seed();
    sim.setCommand({ twist: [vx, 0, 0] });
    sim.resume();
    let first;
    for (let i = 0; i < 150; i++) {
      const result = await sim.step();
      assert.equal(result.status, 'stepped');
      for (const key of ['qpos', 'velocity', 'controls', 'previousAction']) assert.ok(result.snapshot[key].every(Number.isFinite), key);
      if (!first) first = Array.from(result.snapshot.previousAction);
    }
    const final = sim.snapshot();
    assert.ok(Math.abs(final.time - 3) < 1e-10);
    sim.pause();
    assert.equal((await sim.step()).status, 'paused');
    assert.equal(sim.snapshot().time, final.time);
    runs.push({ vx, seconds: final.time, root: Array.from(final.position), firstAction: first });
  }
  const actionDelta = Math.max(...runs[0].firstAction.map((x, i) => Math.abs(x - runs[1].firstAction[i])));
  const displacementDelta = runs[1].root[0] - runs[0].root[0];
  assert.ok(actionDelta > 1e-4, 'policy responds to real command');
  assert.ok(Math.abs(displacementDelta) > 0.05, 'physics responds to policy command');
  console.log(JSON.stringify({ stage: 'policy-physics', ort: ort.env.versions.web, provider: 'wasm', threads: ort.env.wasm.numThreads, policyInferences: 300, physicsSteps: 1200, actionDelta, displacementDelta, runs }));
} finally { await sim.dispose(); }
assert.equal(policy.disposed, true);
assert.equal((await sim.step()).status, 'disposed');
assert.equal(sessionReleases, 1, 'actual ORT session.release completed');
assert.ok(ownedHandles.every(({ value }) => value.isDeleted()), 'every actual Embind handle deleted, including failed initialization');
console.log(JSON.stringify({ stage: 'cleanup', resourcesReleased: true, deletedEmbindHandles: ownedHandles.length, sessionReleases }));

const native = await import('../lib/sim/native/index.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});
assert.equal(typeof native.loadNativeBackend, 'function', 'static browser loader exists');

if (process.argv.includes('--browser')) {
  const { createServer } = await import('node:http');
  const { resolve, extname, sep } = await import('node:path');
  const { mkdir, rm } = await import('node:fs/promises');
  const { default: puppeteer } = await import('puppeteer-core');
  assert.ok(process.env.NATIVE_SIM_EVIDENCE_DIR, 'browser scratch requires NATIVE_SIM_EVIDENCE_DIR');
  const profile = resolve(process.env.NATIVE_SIM_EVIDENCE_DIR, 'chromium-profile');
  await mkdir(profile, { recursive: true });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Native backend headless smoke</title>'); return; }
      const path = decodeURIComponent(url.pathname);
      const tampered = path.startsWith('/tampered/');
      const clean = tampered ? path.slice('/tampered'.length) : path;
      const diskPath = resolve(root, clean.startsWith('/sim/') ? `public${clean}` : `.${clean}`);
      if (!diskPath.startsWith(resolve(root) + sep)) { response.writeHead(403).end(); return; }
      let bytes = await readFile(diskPath);
      if (tampered && clean.endsWith('/collision.xml')) bytes = Buffer.from(bytes.toString().replace('timestep="0.005"', 'timestep="0.002"'));
      response.setHeader('Content-Type', { '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.xml': 'application/xml' }[extname(diskPath)] ?? 'application/octet-stream');
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  let browser;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(origin)).status, 200);
    browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium', userDataDir: profile, env: { ...process.env, DISPLAY: '', WAYLAND_DISPLAY: '' }, args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'], protocolTimeout: 120000 });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin, { waitUntil: 'load' });
    const result = await page.evaluate(async origin => {
      const { loadNativeBackend } = await import(`${origin}/lib/sim/native/index.mjs`);
      const failures = [];
      const controller = new AbortController(); controller.abort();
      try { await loadNativeBackend({ baseUrl: `${origin}/sim/native/`, signal: controller.signal }); } catch (error) { failures.push(error.name); }
      try { await loadNativeBackend({ baseUrl: `${origin}/tampered/sim/native/` }); } catch (error) { failures.push(error.message); }
      const sim = await loadNativeBackend({ baseUrl: `${origin}/sim/native/` });
      const zero = sim.snapshot();
      sim.setCommand({ twist: [0.25, 0, 0] });
      sim.resume();
      let final;
      try {
        for (let i = 0; i < 150; i++) {
          const step = await sim.step();
          if (step.status !== 'stepped' || !step.snapshot.qpos.every(Number.isFinite) || !step.snapshot.previousAction.every(Number.isFinite)) throw new Error('Nonfinite browser physics');
          final = step.snapshot;
        }
        sim.pause();
        if ((await sim.step()).status !== 'paused') throw new Error('Browser pause failed');
        sim.seed(final);
        if (sim.snapshot().position[0] !== final.position[0] || sim.snapshot().previousAction.some(x => x !== 0)) throw new Error('Browser reentry failed');
      } finally { await sim.dispose(); }
      return { crossOriginIsolated, failures, seconds: final.time, displacement: final.position[0] - zero.position[0], disposed: sim.status === 'disposed' };
    }, origin);
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(result.crossOriginIsolated, false);
    assert.equal(result.failures[0], 'AbortError');
    assert.match(result.failures[1], /Pin mismatch/);
    assert.ok(result.displacement > 0.05);
    assert.equal(result.disposed, true);
    console.log(JSON.stringify({ stage: 'headless-browser-static', ...result }));
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    await rm(profile, { recursive: true, force: true });
  }
}
