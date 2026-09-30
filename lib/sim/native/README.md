# Native Microduck backend

Renderer-independent **walking-only** MuJoCo 3.11.0 + ONNX Runtime Web 1.27.0 WASM backend. No renderer, DOM, animation clock, input listener, audio, second rig, iframe, or synthetic motion is created. Production code is independently implemented from the documented numeric contract, existing repository constants and pinned Apache-licensed model/policy metadata; no Space `game.js` functions are vendored.

## Build/static assets

`npm run build` invokes `prebuild`, which prepares `public/sim/native/` before Next copies public files. For development or explicit preparation:

```sh
npm run prebuild
# Offline alternative using the verified recovery directory layout:
node scripts/prepare-native-sim.mjs --runtime-source /absolute/path/to/native-backend-audit
```

The default prebuild fetches **only exact pinned public runtime sidecars**, or reuses already-generated sidecars only after checking their byte lengths and SHA-256 hashes. No new npm dependencies are needed. An empty checkout needs network access for those four files, or the explicit offline preparation command above. A valid prepared directory permits subsequent offline builds. The source MJCF, walking policy and licenses are small vendored files in `assets/`. The nine binary collision STLs are derived from the existing canonical `public/robot/mjlab/microduck.glb`, never from HQ visual surfaces. Source, runtime, STL and derived XML hashes are in `asset-manifest.json`; preparation verifies all inputs **before writing**, and writes the generated `assets.json` inventory last.

**Never commit `public/sim/native/`:** it contains about 24 MB of JS/WASM runtime sidecars plus the generated collision/model/policy/license files. Only this generated directory is ignored. Serve `.mjs` as JavaScript and `.wasm` as `application/wasm`. The application must resolve its own asset-origin/base-path URL; the backend accepts an absolute HTTP(S) directory URL ending in `/`. Cross-origin hosting requires CORS for fetch and ESM imports. A secure context is required for Web Crypto/WASM (localhost is sufficient). No COOP/COEP is required; ORT always uses its WASM-only bundled entry, `numThreads=1`, `proxy=false`.

## Public API

Import `loadNativeBackend`, `JOINT_NAMES`, `DEFAULT_POSE`, `CONTROL_DT` from `lib/sim/native/index.mjs`. TypeScript declarations are in `index.d.mts`.

```js
const backend = await loadNativeBackend({
  baseUrl: resolvedAbsoluteNativeAssetDirectory,
  signal: entryAbortController.signal,
}); // starts paused, at STAND

backend.seed({ position, quaternion, joints });
backend.setCommand({ twist: [0.25, 0, 0] });
backend.resume();
const result = await backend.step(1); // one 20 ms control tick
if (result.status === 'stepped' && result.snapshot.generation === backend.generation) {
  // Parent applies result.snapshot.position/quaternion/joints to its EXISTING rig.
}
backend.pause();
const handoff = backend.snapshot();
await backend.dispose();
```

- **Coordinates:** MJCF Z-up, metres, unit **WXYZ** quaternion. `joints` are 14 absolute solved hinge angles in `JOINT_NAMES` order, radians. Parent owns conversion through its existing world/stage basis and scale. Use `snapshot.joints` for rendering, **not** `controls` (desired actuator position targets). The cosmetic jaw is not a policy joint.
- **`seed(pose?)`:** validates and copies inputs; defaults to root `[0,0,0.12]`, identity orientation, existing `DEFAULT_POSE`, zero generalized velocity. Pauses, invalidates old generation, resets MuJoCo time/solver state and clears previous raw action, command targets and head EMA. Optional `velocity` is the validated model's 20-element qvel ordering. `seed(snapshot)` preserves the physical pose/velocity but intentionally resets policy histories/time: this is a handoff seed, **not a bit-exact integrator checkpoint**.
- **`setCommand({twist?,head?,body?})`:** partial atomic update, copy-owned, finite Float32-compatible values. Twist `[vx,vy,wz]`; head `[neck_pitch,head_pitch,head_yaw,head_roll]`; body `[x,y,z,roll,pitch,yaw]`. Head targets have EMA alpha 0.2 per accepted control tick. Ordinary walking uses `vy=0`, body zeros. Parent is responsible for UI limits (existing forward/back limits 0.25/-0.2 m/s, yaw ±1 rad/s). Head/body inputs are policy commands, **not extra joint offsets**.
- **`step(count=1)`:** no timer and no queue; one in-flight inference/job. At most **three control ticks per call**, each exactly **4 × 0.005 s** MuJoCo steps. Excess catch-up is dropped. Concurrent calls return `{status:'busy',steps:0,snapshot:null}` immediately. Count must be a nonnegative safe integer. Parent schedules at `CONTROL_DT=0.02`, rather than assuming one tick per render frame.
- **`pause()` / `resume()`:** pause invalidates in-flight results, freezes accepted physics and retains accepted histories. Resume alone does not reset them. A late success or rejection after pause, seed or dispose becomes `{status:'stale',steps,snapshot:null}`; it cannot change controls, history or physics. Reentry may return busy until old inference settles. Check snapshot generation again before an application-side pose write, since the caller can itself change generation after a step promise settles.
- **Errors:** malformed commands/seeds are rejected before mutation. Current inference errors, nonfinite actions or nonfinite physics pause the backend and reject the step. A catch-up job may already have accepted earlier ticks before a later failure; obtain a fresh valid snapshot or reseed. No erroneous step yields a renderable snapshot.
- **`snapshot()`:** fresh, validated, caller-owned typed arrays. Includes actual pose, qpos/qvel, named controls, raw previous action, requested command, committed head EMA, time and generation. Never exposes MuJoCo or ORT memory views. MuJoCo heap views are reread on each access.
- **`dispose()`:** marks disposed/increments generation synchronously, returns the same disposal promise on repeated calls, waits for in-flight ORT to settle, then releases the session and deletes data/model/VFS even on cleanup errors. Other methods except `step()` reject after disposal; `step()` returns `disposed`. ORT does not provide cancellation of an already-running inference. Its compiled module-level WASM runtime remains cached; session/Embind cleanup is not a promise to unload the module from browser memory.
- **Initialization signal:** cancels fetch and checks after asynchronous runtime/session creation; resources created before a failed/aborted load are released. The signal governs initialization only. Parent uses pause/dispose once the backend is returned.

The lower-level `backend.mjs`, `physics.mjs` and `policy.mjs` exports are implementation/test seams. Product integration should use the pinned loader, not supply arbitrary XML, policy or IO adapters.

## Numeric/model contract

The loader rejects stale/renamed MJCF bytes. The compatible source is `microduck_rl@1a9063fbd3d9371a64f8a0abff128f0bd8027053`, **not current same-named `robot_allcollisions.xml`**. The derivative removes visual geoms/unused meshes, retains every real inertial/collision geom and inherited actuator parameters, and adds only a plane and timestep 0.005. It compiles to nq=21, nv=20, nu=14, nbody=16 (world plus 15 bodies). Joint/actuator ids and addresses are resolved and checked by name, including hinge/freejoint types, actuator joint transmission, unique addresses, trunk ownership and 3-axis gyro type.

Observation float32 `[1,61]`, **without host normalization/clipping**:

| Slots | Values |
|---|---|
| 0–2 | `imu_ang_vel` gyro |
| 3–5 | inverse trunk-world quaternion applied to world unit gravity `[0,0,-1]` |
| 6–19 | named qpos minus existing full-precision default pose constants |
| 20–33 | named qvel, unscaled |
| 34–47 | previous **raw network action**, initially zero |
| 48–50 | twist command |
| 51–54 | smoothed head command |
| 55–60 | body command |

ONNX `obs -> actions`, float32 `[1,61] -> [1,14]`, contains its own normalizer. Controls are `DEFAULT_POSE + action * 1.0`, not torque, and history stores raw action. Native MJCF limits/damping/force constraints are retained. This backend does not claim support for other policies, ball/arena environments, recovery or roller variants.

## Verification

```sh
node --test scripts/native-sim-contracts.mjs
node scripts/native-sim-smoke.mjs
# Optional actual headless Chromium static-server test:
NATIVE_SIM_EVIDENCE_DIR=/absolute/scratch/evidence \
CHROMIUM_PATH=/usr/bin/chromium \
node scripts/native-sim-smoke.mjs --browser
```

Set `NATIVE_SIM_RUNTIME_SOURCE` for offline audit resources, otherwise the smoke uses verified cache/pinned downloads. The smoke executes production modules, checks every generated byte hash, compiles the real model, tests permuted actuator order against actual physics, rejects invalid transmissions/timestep, runs **300 real ORT inferences / 1200 physics steps** across zero/forward commands, asserts finite state and command-dependent displacement, and checks actual Embind `isDeleted()` and awaited ORT `release()`. The browser variant owns a loopback server on OS port 0 and an isolated headless profile, requires no cross-origin isolation, exercises real static ESM/WASM/ONNX loading, pin rejection, abort, 150 real control ticks, pause/seed/dispose, and closes the browser/server/profile. It never opens a desktop GUI.

Contract tests use deferred IO boundaries solely for deterministic lifecycle/error races; those are not an alternative runtime or a gait implementation. Final visual integration, sole-pose-writer ownership, input UX, existing surface/material identity and deployed CSP/base-path acceptance remain the parent's responsibilities.
