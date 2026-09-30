# Third-party provenance and modifications

All paths below refer to `lib/sim/native/`. `asset-manifest.json` pins byte lengths and SHA-256 hashes. `scripts/prepare-native-sim.mjs` stages the notices alongside runtime assets under `public/sim/native/licenses/`.

## Microduck robot model — Apache-2.0

- Copyright 2026 Pollen Robotics.
- Repository: https://github.com/pollen-robotics/microduck_rl
- Commit: `1a9063fbd3d9371a64f8a0abff128f0bd8027053`.
- Original file: `src/mjlab_microduck/robot/microduck/robot_allcollisions.xml`.
- Exact upstream bytes retained as `assets/robot_allcollisions.xml`; license retained as `assets/LICENSE.microduck`.
- **Modified generated derivative:** `collision.xml` removes comments, visual geoms and unused mesh declarations, adds a floor plane and sets timestep 0.005. Robot hierarchy, joint definitions, inertials, physical collision geoms and inherited actuator dynamics are retained. The original source remains unmodified and is also staged.

## Walking policy — Apache-2.0

- Pollen Robotics: https://huggingface.co/pollen-robotics/microduck-policies
- Commit: `1b56c396825c052a4e26e95cf2b8d8298af9e9b4`, `alpha_walking.onnx`.
- Exact bytes retained as `assets/alpha_walking.onnx`; no weight/graph modification.
- Upstream Apache-2.0 declaration retained verbatim as `assets/POLICY_CARD.md`; the full Apache-2.0 text is included in `assets/LICENSE.microduck` and `assets/LICENSE.mujoco`.

## MuJoCo — Apache-2.0

- https://github.com/google-deepmind/mujoco/tree/3.11.0
- Exact public package `@mujoco/mujoco@3.11.0`, single-threaded `mujoco.js` and `mujoco.wasm`.
- Root upstream license retained as `assets/LICENSE.mujoco`.
- JavaScript is staged under the `.mjs` extension without changing its bytes, to support direct ESM loading in both Node and browsers. Runtime bytes are not committed to Git.

## ONNX Runtime — MIT and included third-party licenses

- https://github.com/microsoft/onnxruntime/tree/v1.27.0
- Exact public package `onnxruntime-web@1.27.0`, `dist/ort.wasm.bundle.min.mjs` and `dist/ort-wasm-simd-threaded.wasm`.
- License retained as `assets/LICENSE.onnxruntime`; full third-party notices retained as `assets/ThirdPartyNotices.onnxruntime.txt`.
- Unmodified runtime bytes are staged, never committed; the WASM-only bundle runs with one thread and no proxy worker.

## Canonical geometry and existing constants

The collision STLs are generated only from the repository's already-present canonical `public/robot/mjlab/microduck.glb` (SHA-256 `ad0b8d1c886a857fd09d337be11e731f4ac72bf099b0af63081031f97ed6eadb`). No new visual rig, HQ/private master or alternate source asset is distributed by this backend. Existing repository/vendor notices remain applicable; those existing files and licenses are not changed. The backend imports existing `vendor/microduck-simulator/constants.js` and copies its numeric arrays for ownership isolation.

The Hugging Face simulator Space at `023172c8a7d629b5258d90364c13bafe013abbfa` was a numeric-contract/provenance reference only. That Space JavaScript has no explicit redistribution license established here. **No whole `game.js`, verbatim game function, render/UI/audio code or game fixture is included.** New backend/math/GLB-to-STL preparation code is independently implemented. The separately licensed robot/policy/runtime pins above, not a presumed license for the Space game, authorize their redistribution.
