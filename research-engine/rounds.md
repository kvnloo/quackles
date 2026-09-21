# A/B research log

This log records research iterations. An **A round** enumerates mechanisms, dependencies, evidence gaps, and queries. A **B round** retrieves sources and converts evidence into falsifiable applications. Source evidence is not local validation.

## Round 1A — map the pipelines

Bounded concepts:

1. Browser frame pipeline: input sampling → scroll state → animation state → style/layout → WebGL render → compositor → display scanout.
2. Asset pipeline: transfer → parse/decode/transcode → CPU object creation → GPU upload → shader compilation → first useful frame.
3. Scroll semantics: scroll-triggered events versus scroll-progress timelines; one state variable versus independent animations.
4. Blender path: BSDF parameters → lights/environment → path sampling → denoising → view transform.
5. Quality evidence: source guidance, local telemetry, and human visual review are different evidence classes.

Dependencies and gaps:

- A 120 Hz target supplies 8.33 ms per refresh, but headless rAF does not prove a physical 120 Hz presentation path.
- Mean FPS hides variance, consecutive misses, and state discontinuities.
- GLB byte size does not reveal decode, upload, shader, or VRAM cost.
- Sample count alone does not reveal Cycles convergence or denoiser detail loss.
- Material realism depends on visible reflection structure; parameter values cannot be judged without controlled lighting.

Queries retrieved:

- W3C scroll-driven animation and script animation timing.
- Browser rendering budgets and Long Animation Frames.
- Khronos KTX2/glTF and WebGL texture behavior.
- Blender Principled BSDF, sampling, light linking, and denoising.

## Round 1B — establish first principles

Findings:

- Scroll-driven animations are progress timelines, distinct from time-driven triggers. The specification is designed to allow asynchronous sampling without script on every scroll update. Application: reserve the JS/WebGL loop for the 3D rig; move DOM-only transforms to scroll timelines when browser support and fallback cost justify it.
- `requestAnimationFrame` is a one-shot request aligned to display refresh. Application: one authority should sample progress and derive camera, pose, lighting, and copy; a second independent rAF is a scheduling smell.
- KTX2 is designed for compact transfer and transcoding to supported GPU block formats; WebGL guidance says GPU-compressed textures reduce GPU memory and sampling bandwidth. Application: use KTX2 only if texture inspection shows meaningful texture cost; do not add a transcoder to an effectively textureless GLB.
- Principled roughness controls reflection width; metallic changes the energy model. Application: material A/B tests must keep lighting fixed and compare coherent highlight shape, not base color alone.
- Adaptive sampling uses an error threshold and denoising can preserve more detail when supplied albedo and normal passes. Application: preserve noisy and denoised outputs plus sample-count/render-time evidence.

Graph update after Round 1B:

- Added `single-frame-authority → temporal-continuity` and `asset-decode-upload → cold-start-hitch` edges.
- Added `lighting-reflection-structure → material-legibility`; this prevents treating shader sliders as independent quality controls.

## Round 2A — look for cross-domain mechanisms

Bounded adjacent concepts:

1. Sampling phase mismatch: touch/input frequency, rAF/display frequency, and render completion are separate clocks.
2. Spatial frequency: high-frequency roughness/bump and high-DPR fragment work can both spend cost where perception gains are small.
3. Warm versus cold state: shader/PMREM/texture upload hitches correspond to Cycles warm cache and denoiser behavior only loosely; both require explicit phase separation.
4. Temporal continuity: a stable trajectory depends on consistent state sampling, not only fast isolated frames.
5. Perceptual evaluation: objective metrics narrow the search, while paired visual judgments decide whether the intended material/story beat survives.

Evidence gaps and queries:

- Can asynchronous input and output produce visible jitter even when each component is individually fast?
- What WebGL operations cause main-thread/GPU synchronization?
- What are valid resolution and DPR tradeoffs on mobile?
- How should image decode be separated from presentation?
- How does denoising lose fine texture, and what auxiliary inputs preserve it?

## Round 2B — connect clocks, pixels, and perception

Findings:

- Antoine et al. model spatial jitter caused by mismatched input and display frequencies; their touch study found prediction 4–6 ms before refresh reduced jitter for 125 Hz input. Application: do not add bespoke prediction yet; first derive all visible state from one sampled progress value and measure pose delta conditional on progress delta.
- WebGL synchronous queries and compile-status checks can stall; high DPR expands fragment and memory work quadratically; smaller back buffers are an explicit quality/performance trade. Application: A/B DPR caps and MSAA, log backing-store pixels, and avoid telemetry that calls blocking GL queries every frame.
- `HTMLImageElement.decode()` separates decode completion from DOM presentation. Application: decode the next poster/state outside active scroll, then swap on a frame boundary.
- Long Animation Frames attributes script, render, style, and layout for frames ≥50 ms. Application: collect LoAF as root-cause evidence, but retain rAF interval telemetry because 50 ms is six missed 120 Hz intervals.
- Blender denoising with albedo and normal passes better preserves edges and fine detail. Application: use auxiliary passes for final denoise comparisons and inspect pigment lettering, pores, and scratches at 1:1.

Graph update after Round 2B:

- Added `clock-phase-mismatch → spatial-jitter → temporal-continuity`.
- Added `DPR → fragment-work` and `DPR → backing-store-memory`; quality tiering now depends on both.
- Added `denoiser-aux-passes → texture-preservation`; sample count and denoising are separate experiment axes.

## Round 3A — design falsifiable experiments

Confounders to control:

- Mobile: identical viewport, browser build, power/thermal state, asset cache condition, input trace, and page revision. Separate physical device from SwiftShader/headless results.
- Blender: identical mesh hash, camera, pose, output size, random seed, view transform, and reference crop. Change one of material, light, sampling, or denoising at a time.
- Human review: randomize A/B order, inspect both fit-to-screen and 1:1 crops, and state the question before viewing.

Queries retrieved:

- R3F demand rendering and performance scaling.
- Three.js renderer resource telemetry and lifecycle.
- WebGL per-pixel VRAM budgeting and compressed texture guidance.
- Device Memory and DPR capability signals.
- Blender light groups/linking and color management.

## Round 3B — turn evidence into gates

Findings and gates:

- R3F supports demand rendering when the scene is static. Application: test a hybrid state machine: render continuously only while scroll/theme/pose is active, then stop; success requires no first-frame stall on resume.
- Renderer statistics can expose geometry, texture, program, and draw-call counts. Application: capture once per phase, not every frame, to avoid perturbing the loop.
- Device memory and DPR are capability hints, not performance measurements. Application: choose a conservative initial tier, then promote or demote from measured frame behavior with hysteresis.
- Light linking gives artistic control at potential sampling cost. Application: isolate the eye highlight to the lens, then compare noise/render time and spill against the unlinked control.
- AgX preserves wide dynamic range and desaturates high exposure. Application: lock the view transform for A/B; exposure changes are lighting/composition decisions, not substitutes for material calibration.

Graph update after Round 3B:

- Added `capability-hints → initial-quality-tier → measured-adaptation`; hints never directly prove smoothness.
- Added `hybrid-frameloop → idle-power` and `hybrid-frameloop → resume-hitch` to force both benefit and failure mode into the test.
- Added `light-linking → optical-isolation` and `light-linking → sampling-cost`.

## Round 4A — revise from measured baseline results

Recorded outcomes before revising the graph:

- Demand rendering stopped at idle with zero idle renders (`M03`, pass).
- `compileAsync` readiness was followed by a roughly 6.85 s first visible reveal and the stall recurred after resize (`M06`, fail).
- KTX2 has no current payload to optimize because the GLB contains no embedded images or materials (`M08`, fail; reopen if baked textures are introduced).
- The trace excludes large probe CPU cost and reports a compositor dropped-frame marker, but it does not locate a GPU wait (`M07`, inconclusive).

Revised frontier:

1. Separate software raster from hardware raster (`M10`).
2. Separate shader compilation from a representative presented-ready gate (`M11`).
3. Separate scene raster/draw complexity from compositor/presentation with a full-scene versus trivial-proxy diagnostic (`M12`).
4. Keep physical 120 Hz validation external to the current SwiftShader environment (`M04`).

## Round 4B — retrieve evidence for the revised frontier

- Chromium documents SwiftShader as a CPU implementation of the graphics APIs that can exercise GPU code paths without hardware GPU execution. Result: SwiftShader measurements remain useful diagnostics but cannot establish hardware throughput.
- Three documents `compileAsync` as material compilation intended to reduce first-use shader stutter. Its contract does not promise a full-size visible frame has been composited and presented. Result: a useful ready gate must include presentation evidence.
- Three documents `InstancedMesh` for objects that share geometry and material but use different world transforms, with reduced draw calls as the intended benefit. Result: `M14` is bounded to repeated rigid part groups, and must preserve per-part matrices plus story-beat image parity; the documentation does not prove a cadence win for this scene.
- The trace has no over-50 ms event that attributes the wait. Result: keep `M07` inconclusive and do not infer a specific GPU-wait cause.

Graph update after Round 4B:

- Added `software-raster → scene-raster-complexity` and a separate `hardware-raster` control environment.
- Added `shader-compile → presented-ready` with relation `is-insufficient-for`.
- Added `presented-ready → first-visible-frame` and `scene-raster-complexity → first-visible-frame`.
- Added `rigid-part-instancing → draw-call-count`; visible cadence remains an experiment outcome rather than a sourced claim.

## Baseline project observations before the parallel website/performance pass

These are code/file observations from the pre-worker baseline, not performance results. They must not be read as the current implementation after the parallel website and performance changes land:

- Canvas uses `frameloop="always"`, `dpr={[1, 2]}`, and antialiasing.
- Lenis is driven through an R3F `addEffect`, while a fallback rAF remains scheduled and branches every frame.
- The main GLB is about 1.28 MB. Poster PNGs are about 2.5–2.8 MB each; JPEG variants are about 0.29–0.44 MB each.
- The current test harness uses headless Chrome with SwiftShader. It is useful for deterministic continuity regressions but cannot validate physical 120 Hz presentation.
- The refined Blender preview improved stone volume and hardware legibility. The known remaining limits are lens depth, projected-art seams, and source-STL mechanism detail.

## Current measured candidate after the parallel pass

These observations describe build `Gwxpoh0bWt7pKmIHtYbfk` and its saved artifacts, not the later camera-calibration source work that had not yet been rebuilt when they were recorded:

- Demand rendering still stops cleanly at idle: zero idle WebGL frames and zero scroll React commits in the timed passes.
- The canvas uses an actual DPR of 1.5 with antialiasing retained. No DPR A/B was run; 1.5 is a fidelity choice, not a measured optimum.
- Rigid same-material batching plus a standard-material change reduced reported draw calls from 70 to 35 while submitted triangles remained 198,412. Because both changes co-landed under a different concurrent load and there is no independent image-parity/max-deviation artifact, `M14` remains inconclusive for cadence and fidelity.
- Visible SwiftShader performance remains unacceptable as a user result: p95 was 200–316.7 ms across the saved candidate passes. The run still cannot validate a physical 120 Hz phone.
- A controlled 120 ms rAF busy loop produced a LoAF observation. Empty LoAF entries in the application trace therefore do not mean the API is unsupported, but they still do not attribute the visible presentation/raster delay.
- The neutral sole audit improved from the rejected toe-up baseline to roughly 5° tilt with both feet grounded. The visible handoff and type-safe zones remained separate visual work after this performance capture.

## Round 5A — bound the Blender-to-browser material gap

The calibrated camera/pose pass fixed subject continuity, leaving pigment and surface detail as the largest visible handoff gap. The bounded mechanisms are:

1. procedural Blender nodes and camera-projected artwork;
2. conversion to mesh-space UVs that follow rigid articulation;
3. a lighting-independent color bake and optional packed metallic/roughness data;
4. glTF/Three color-space semantics;
5. atlas texel density, mip margins, and texture residency;
6. full per-theme maps versus runtime ink-mask layering;
7. KTX2 transfer/residency benefit versus cold transcode cost.

The first local question is deliberately smaller than a whole robot atlas: can one 512-square head-shell base-color tile keep the highest-salience print registered through head yaw/pitch and improve the calibrated handoff without adding a draw call or cold regression?

## Round 5B — retrieve material-transfer constraints

- Blender documents that Cycles baking needs mesh UVs and an image target; Diffuse with Color alone captures surface color without direct/indirect lighting. Tangent normals can follow animated geometry, and bake margins protect UV seams under filtering.
- Blender's glTF exporter recognizes Principled base-color images and glTF's linear green-roughness/blue-metallic packing. It does not promise to convert arbitrary procedural networks into portable textures, so baking is an explicit phase.
- glTF defines base color as sRGB, metallic/roughness and normal data as linear, and binds textures to mesh texture coordinates. Three likewise requires color-space annotation for color textures.
- Blender's island-scale tools support consistent texel density. Screen-space review still decides where extra area is warranted.
- KTX2 can reduce transfer and GPU residency, while Three adds capability detection and a WASM transcode phase. Compression follows the uncompressed visual proof.
- No primary source supports arbitrary independent theme-ink layering in core glTF. That branch is recorded as a failed search and requires a custom runtime shader experiment.

Graph update after Round 5B:

- Added `procedural-material-graph → UV-material-bake → glTF-metal-rough-PBR`.
- Added `mesh-space-UV → articulated-texture-registration → handoff-material-parity`.
- Added `color-space-parity` and `texel-density` as independent handoff dependencies.
- Added `texture-atlas/theme-ink-mask/KTX2 → texture-residency`, with theme mask compositing explicitly outside the proven core-glTF path.

## Round 6A: replace the rejected fade with spatial continuity

Input status was recorded before opening this A round. M16 is running because the user rejected whole-scene fading and selected camera angle change, duck jump, landing-triggered explode, and departure of the actual set with depth. The Blender export and browser implementation are work in progress. No checkpoint or cadence pass is implied.

The retained concept families are:

1. one spatial state authority and explicit phase ownership;
2. real scene-node depth, arc-length camera translation and camera orientation;
3. relative-motion parallax, occlusion, object identity and contact timing;
4. UV-baked material transfer, runtime lighting and contact-shadow lifetime;
5. reduced interaction motion;
6. atlas allocation, per-object textures and cold/warm asset cost.

Queries target the mechanism behind each choice. Does arc-length sampling guarantee projected smoothness? Which depth cues require real occluding geometry? Does static shadow caching remain valid for a jumping caster? Which parts of Blender's light rig survive export? How much texture cost buys readable pigment during an oblique camera move? The answer to each query changes a validation gate.

## Round 6B: constrain the scene and its evidence

- W32-W34 distinguish normalized curve distance from the raw curve parameter and provide rotation interpolation. Camera translation and orientation share progress; projected motion still needs measurement.
- W35 supplies an official example of shared scroll progress and different object depths. Its current path is `examples/scrollcontrols-with-minimap/src/App.tsx`. The earlier `demos/.../App.jsx` link was stale. The example uses image planes, so it does not validate a flat substitute for this user's real set.
- W36-W37 support parallax and dynamic occlusion as depth cues. The local application is a hypothesis that distinct near/far mesh layers make the camera departure readable.
- W38 concerns four-month-old infants, so its object-identity result is explicitly adjacent evidence. Keeping the same robot and reversing the same trajectory are local requirements, not a proven adult preference.
- W39 is a registered replication. Contact delay influenced launching judgments, but several historical predictions differed. No universal delay threshold was adopted. The user-selected landing-to-explode boundary has no additional dwell phase.
- W40 confines a one-frame contact shadow to static objects. The jumping feet need a shadow/contact cue that agrees with their changing separation.
- W27-W29 and W42-W43 connect UV surface baking, real set nodes and PBR channel semantics. The runtime must recreate the lighting intent because the exporter does not promise Blender World or area-light transfer.
- W41 adds a static readable reduced-motion alternative. M17 compares atlas and per-object texture cost only after the geometric scene proves the intended depth.

Graph changes add `scroll-progress → spatial-scene-authority → phase-ownership`, `camera-arc-length → relative-motion-parallax`, `set-asset-graph → dynamic-occlusion`, `phase-ownership → contact-triggered-explode`, and the material, shadow, accessibility and asset-budget dependencies. Source support is distinguished from the design inferences in node kinds and this log.

M16 now specifies eight checkpoints at 360 and 430 CSS pixels, dense forward/reverse traces, opacity 1, fixed set world matrices, continuous projected paths, intact pre-touchdown geometry, contact-owned explode onset, unchanged robot geometry and measured asset budgets. M17 compares one 1024-square PBR atlas with per-object textures on those same real set meshes. Both remain unpromoted until local evidence is recorded.

The source retrieval was repeated after the PC restart. A registry verification page and documentation-navigation responses were replaced with official GitHub sources. Available disk capacity permitted this record to be saved. The final-trio visual review is separate in `work/research-engine/quality-trio-review.md`; it reports specific remaining material and lighting gaps rather than exact-match claims.


## Round 7A — geometry identity constrains the codec search

Recorded retrospectively after this bounded experiment, rather than presented as a preregistered test. The remaining geometry-transfer cost links source identity → permissible byte-preserving codecs → float entropy → compressed transfer → browser decode. Existing quantization advice does not satisfy the user's unchanged-mesh requirement. Read the official EXT meshopt specification and installed encoder documentation; compare identical channel and geometry bytes, including the final HTTP payload rather than intermediate GLB size.

## Round 7B — reject the measured payload regression

Encoded all 75 attribute/index views with EXT-compatible codec v0 and NONE filters. Decoding reproduced all 9,209,280 geometry bytes exactly; no quantization, index reorder, or simplification was used. Meshopt shrank the raw GLB from 11,771,588 to 9,270,488 bytes, but the final gzip grew from 7,492,826 to 7,991,460 bytes. Reject the treatment and its extra runtime decoder. The adopted transport is byte-identical ordinary gzip with a raw fallback. This is a local negative result, not a general claim against meshopt. Portable receipt: `receipts/robot-meshopt-receipt.json`; gzip control: `receipts/robot-transport.json`.
