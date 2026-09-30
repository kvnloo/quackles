import pins from './asset-manifest.json' with { type: 'json' };
import { createPhysics } from './physics.mjs';
import { createPolicy } from './policy.mjs';
import { createBackend } from './backend.mjs';
export { JOINT_NAMES, DEFAULT_POSE, CONTROL_DT } from './contract.mjs';

// Call only on explicit SIM entry. baseUrl is an absolute, trailing-slash URL
// resolved by the application (including its asset origin/base path).
export async function loadNativeBackend({ baseUrl, signal } = {}) {
  signal?.throwIfAborted();
  const base = new URL(baseUrl);
  if (!['https:', 'http:'].includes(base.protocol) || !base.pathname.endsWith('/') || base.search || base.hash) throw new TypeError('baseUrl must be an absolute HTTP(S) directory URL');
  const cancel = new AbortController();
  const loading = AbortSignal.any([cancel.signal, AbortSignal.timeout(120_000), ...(signal ? [signal] : [])]);
  let physics, policy;
  try {
    const files = [
      ...pins.files.filter(file => file.path.startsWith('runtime/') || file.path === 'alpha_walking.onnx'),
      pins.prepared_model,
      ...pins.collision_meshes.map(file => ({ ...file, path: `assets/${file.file}` })),
    ];
    const assets = new Map(await Promise.all(files.map(async file => {
      const response = await fetch(new URL(file.path, base), { signal: loading });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${file.path}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
      if (bytes.length !== file.bytes || hash !== file.sha256) throw new Error(`Pin mismatch: ${file.path}`);
      return [file.path, bytes];
    })));
    loading.throwIfAborted();
    // Plain ESM sidecars: no ORT WebGPU entry, worker/proxy, or bundler chunk
    // filename inference. Stage these immutable pinned bytes before building.
    const mujocoUrl = new URL('runtime/mujoco.mjs', base).href;
    const ortUrl = new URL('runtime/ort.wasm.bundle.min.mjs', base).href;
    const [{ default: MuJoCo }, ort] = await Promise.all([
      import(/* webpackIgnore: true */ /* @vite-ignore */ mujocoUrl),
      import(/* webpackIgnore: true */ /* @vite-ignore */ ortUrl),
    ]);
    loading.throwIfAborted();
    const mujoco = await MuJoCo({ wasmBinary: assets.get('runtime/mujoco.wasm') });
    loading.throwIfAborted();
    physics = createPhysics({ mujoco, xml: new TextDecoder().decode(assets.get(pins.prepared_model.path)), meshes: new Map(pins.collision_meshes.map(file => [`assets/${file.file}`, assets.get(`assets/${file.file}`)])) });
    policy = await createPolicy({ ort, bytes: assets.get('alpha_walking.onnx'), wasmBinary: assets.get('runtime/ort-wasm-simd-threaded.wasm'), signal: loading });
    loading.throwIfAborted();
    return createBackend({ physics, policy });
  } catch (error) {
    try { await policy?.dispose(); } finally { physics?.dispose(); }
    throw error;
  } finally { cancel.abort(); }
}
