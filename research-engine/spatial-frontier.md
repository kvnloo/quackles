# Spatial continuity frontier

The current requested sequence is camera angle change, duck jump, landing-triggered explode, then the actual set leaving the view with depth and occlusion. Whole-scene opacity fades were rejected. This is the design contract for M16, not a report that the implementation passes.

## A: retained mechanisms and dependencies

| Concept | Dependency and missing evidence | Local decision |
|---|---|---|
| Shared spatial state | Scroll progress must drive camera position, orientation, robot pose, contact and explode together. Independent damped states may drift. | Assign phase boundaries to one progress sample and inspect forward/reverse traces. |
| Physical set and camera path | Distinct mesh depths, camera projection and actual occluding edges determine set departure. Arc-length sampling controls world distance but does not guarantee constant projected speed. | Keep set world matrices fixed and move the camera and robot through the authored world. |
| Perceived identity and causality | A continuous silhouette/paint trajectory and visible contact support the intended story. The perception studies use different populations and stimuli. | Keep the same robot and start explode at touchdown; verify visually rather than import a timing threshold. |
| Portable materials and light | Mesh UVs, baked surface channels, texture color spaces and runtime lighting jointly determine parity. glTF export does not promise the Blender World or area-light rig. | Export actual meshes and PBR maps; recreate lighting and contact cues explicitly. |
| Motion accessibility | The camera journey, jump and parallax are nonessential to reading the product details. | Provide a static readable reduced-motion route. |
| Asset and frame cost | Real set depth adds geometry; maps add decoded/mip residency, upload work and texture bindings. | Compare a shared atlas with per-object maps after geometric continuity is established. |

## B: source-supported constraints

- W01 defines scroll progress separately from a time-triggered animation. One runtime authority is our design inference from that contract. The official [scroll-controls example](https://github.com/pmndrs/examples/blob/main/examples/scrollcontrols-with-minimap/src/App.tsx), W35, derives several image effects from one scroll tree and places images at different depths. Its image cards are not evidence that flat cards satisfy this scene.
- [Curve](https://threejs.org/docs/pages/Curve.html), [CatmullRomCurve3](https://threejs.org/docs/pages/CatmullRomCurve3.html), and [Quaternion](https://threejs.org/docs/pages/Quaternion.html), W32-W34, provide arc-length sampling, a spatial curve and spherical rotation interpolation. Projected anchors still need a separate continuity check.
- The [dynamic-occlusion study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4521857/) and [earlier motion-parallax study](https://pubmed.ncbi.nlm.nih.gov/3226867/), W36-W37, motivate distinct depths and occluding edges. Neither specifies a website camera path.
- The [identity study](https://pmc.ncbi.nlm.nih.gov/articles/PMC4085165/), W38, studied 72 four-month-old infants. Its application to adult website viewers is only an adjacent-domain hypothesis.
- The [causal-perception replication](https://pmc.ncbi.nlm.nih.gov/articles/PMC12434928/), W39, found sensitivity to contact delays, while several classical predictions did not replicate. Do not assert a universal delay cutoff. The immediate landing-to-explode requirement comes from the user and can be tested directly.
- [ContactShadows](https://drei.docs.pmnd.rs/staging/contact-shadows), W40, recommends `frames={1}` for static objects. A moving foot needs a contact cue that updates or a separately tested analytic approximation.
- [Blender baking](https://docs.blender.org/manual/en/5.0/render/cycles/baking.html), [glTF export](https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html), and the [glTF specification source](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc), W27-W29 and W42-W43, support UV-bound surface maps and portable mesh nodes. Keep changing illumination separate from the baked surface response.
- [W3C interaction-animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), W41, supports disabling nonessential motion while preserving the content.

## M16: eight-checkpoint proof

Capture white, cobalt and dark at 360 and 430 CSS pixels. Record the exact viewport height, DPR, browser, revision and renderer. Save both checkpoint images and a densely sampled forward/reverse trace.

| Checkpoint | Visible requirement |
|---|---|
| 1. Hero | Same robot and real set, grounded feet, readable composition. |
| 2. Angle change | Camera changes the visible faces and relative depth while the set remains fixed in world space. |
| 3. Crouch | Anticipation remains anchored to the support surface. |
| 4. Takeoff | Feet leave the support continuously; explode remains zero. |
| 5. Apex | Robot is intact and airborne; the set retains geometric depth. |
| 6. Touchdown | Feet meet the intended support and visible contact cue; the explode phase shares this boundary. |
| 7. Explode and set exit | Parts separate after contact as actual set geometry leaves view. Near and far layers have different projected motion. |
| 8. Final specs | The product and specification copy remain readable after the set has left the view. |

Required assertions:

1. Canvas and scene-level opacity remain 1 throughout the sequence. Inspect relevant ancestors and scene material overrides. Authored glass transmission is not a scene transition.
2. Fixed set nodes retain their world matrices within floating-point tolerance. The camera and robot may move; the set may not silently scale into a card or disappear through a visibility toggle.
3. Projected robot, podium, bench and banner anchors follow continuous paths. Log the maximum per-progress screen displacement and inspect intermediate samples, especially near clipping planes. Flag unexplained jumps rather than hide them with easing.
4. The support and shadow/contact cue agree at rest, crouch and touchdown. The airborne gap is intentional. No frozen airborne shadow may imply continued foot contact.
5. `explode` is exactly zero before touchdown. Its phase begins at the same boundary and grows for immediately subsequent progress samples. There is no separate dwell interval between landing and explode. Camera departure and light changes must not imply that the explode happened before contact.
6. Seeking to any progress from either direction yields the same part transforms, material identities, set visibility and camera state within stated tolerance. Resizing also preserves the current phase.
7. Robot source geometry is unchanged. Compare source mesh hashes and exported geometry separately because UV seams can split export vertices without changing the surface. The export must contain actual set mesh volumes and distinct depth bounds.
8. Record encoded bytes, physical texture dimensions, mip-inclusive residency estimates, draws, triangles, shader programs, cold first-visible time and warm cadence. Each is evidence for this build and renderer only. Preserve the outstanding physical-phone 120 Hz test.
9. Reduced motion displays the same product information without the traveling camera, jump or parallax sequence. Keyboard and touch access to content remain usable.

M16 is an integration proof, so a failure locates the next one-axis experiment. It does not claim which individual design change caused a preference or frame-rate improvement.

## M17: next asset proof

Compare the same real set with one 1024-square atlas against per-object maps. Use the same material channel set, lighting, camera path and visible texel target. A single 1024-square RGBA8 map costs 4 MiB at its base level and about 5.33 MiB with a full mip chain. Three such maps are about 16 MiB with mips. These are uncompressed arithmetic bounds, not measured GPU residency. Compression, channel storage and driver behavior change the actual cost.

Prefer one atlas only if it preserves phone-size banner print, maker lettering, concrete pores and oblique seams while reducing measured texture/material overhead. Allocate atlas area by visible need and protect UV island margins. A per-object texture may be justified when an atlas erases salient lettering; record the cost instead of inventing a universal one-atlas rule.

Check side faces and occlusion during angle change. Texture detail on a single full-scene plane fails this experiment regardless of how close the hero still looks. Compress with KTX2 only after an uncompressed baseline passes and include cold transcode/upload measurements.

## Retrieval record

Sources were reread on 2026-09-16 through agent-reach routes. Jina returned documentation navigation for Curve and Quaternion, so the official docs and GitHub implementation were checked. The Khronos registry returned a verification page, so its official GitHub specification was read. The saved OSS path `demos/scrollcontrols-with-minimap/src/App.jsx` returned 404; the current source is `examples/scrollcontrols-with-minimap/src/App.tsx`. These retrieval corrections do not count as experiment results.
