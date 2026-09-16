# Reusable A/B research protocol for stuck visual systems

Use this protocol when a mobile interactive scene or offline render has stopped improving and the team is changing knobs without learning.

## 1. State the observable failure

Write one sentence that a test can disprove.

- Mobile example: “During a repeatable 4.8 s scroll, the camera or rig visibly jumps even when scroll progress is continuous.”
- Blender example: “At 1:1, metal and painted plastic have indistinguishable highlight width under the locked key light.”

Do not begin with a tool or surface noun such as “optimize Three.js” or “improve roughness.” Name the failed behavior.

## 2. Run A: enumerate mechanisms before searching

For the failure, list at most six mechanism-level concepts and draw their dependencies. Include the adjacent domain most likely to reveal the hidden coupling.

For mobile scrollytelling, inspect:

1. input and display clocks;
2. state ownership and frame scheduling;
3. transfer, decode, parse, upload, and compile phases;
4. backing-store pixels, fragment work, and GPU memory;
5. pose/progress continuity;
6. physical display validation.

For Blender, inspect:

1. BSDF energy model;
2. roughness/normal spatial frequency;
3. light size, angle, and reflection structure;
4. path variance and adaptive sampling;
5. denoiser inputs and texture retention;
6. color transform and reference viewing conditions.

For each concept, record:

- dependency;
- current hypothesis;
- missing evidence;
- a source query;
- a local experiment that could falsify the hypothesis.

Stop enumeration when every proposed concept changes a decision. Breadth without a test is discarded.

## 3. Run B: research every retained concept

Retrieve primary sources first: standards, engine/framework documentation, vendor browser documentation, and peer-reviewed papers. Record the exact mechanism supported by each source and one testable project application. A source is evidence for a mechanism, not evidence that this project is fixed.

Check the population, stimulus and replication limits before transferring a perception result to a website. Name the transfer as an inference. When a URL is stale or returns a verification page, record that failure and retrieve the official replacement; a successful HTTP response alone does not establish that the source content was read.

Reject these weak forms:

- a list of generic optimization tips;
- a parameter recommendation with no dependency;
- an FPS claim without refresh-rate and device context;
- a render-quality claim without locked geometry, camera, and view transform.

## 4. Update the concept graph

Every B round must add, remove, or qualify at least one edge. Useful edge labels include:

- `requires`;
- `causes`;
- `confounds`;
- `measured-by`;
- `trades-off-with`;
- `validated-on`.

If research does not change the graph, the round did not reduce uncertainty.

## 5. Queue one-axis experiments

Each experiment needs:

- control and treatment;
- locked variables;
- cold or warm phase;
- objective measures;
- a subjective question;
- pass/fail rule;
- result status: `untested`, `running`, `tested-pass`, `tested-fail`, or `inconclusive`.

Before assigning an environment-bound cause, record capability and actual-use evidence separately. A sandboxed process may be unable to enumerate a host GPU even when the host driver and renderer are available. Use an authorized read-only host probe when the sandbox result conflicts with the machine configuration, then verify the application renderer/device string independently. Host GPU availability does not prove headless Chrome used it, and neither proves physical-phone behavior. Do not change drivers or user device preferences as part of a diagnostic.

### Mobile measures

Record p50/p95/p99/max frame interval, counts over 1.5× and 2× the measured refresh interval, longest consecutive miss streak, progress delta, pose delta conditional on progress delta, long-animation-frame attribution, backing-store pixels, renderer calls/triangles/programs/textures, first useful frame, decode/compile/upload phase times, and device/browser/display facts.

At 120 Hz, 8.33 ms is the total refresh interval. A headless or 60 Hz environment may prove regressions and continuity, but it cannot prove physical 120 Hz delivery. Report its measured refresh distribution instead of relabeling it.

For a spatial scene transition, also record fixed-world node matrices, camera position/orientation, projected anchors, contact separation, phase boundaries and forward/reverse identity. State opacity and geometry invariants before capturing images. Use dense traces between visual checkpoints so the test cannot miss a discontinuity hidden between endpoints.

### Blender measures

Lock robot mesh hash, camera, pose, resolution, seed, samples or noise threshold, and view transform. Save noisy combined, denoised combined, sample-count/render-time pass, and 1:1 crops. Compare material boundaries, highlight coherence, cavity polarity, contact, label retention, and reference color patches. Record render time separately from the visual verdict.

For export or baking experiments, also lock UV topology, texture resolution, color-space annotations, and material inputs. Distinguish faster iteration on an available host GPU from the final quality/runtime claim; the bake output still needs the same mesh and perceptual checks.

## 6. Separate cold, warm, and perceptual validation

- **Cold**: network/cache miss, decode/transcode, GLB parse, GPU upload, shader compile, PMREM, first useful frame.
- **Warm**: repeated scroll after assets and shaders are resident.
- **Perceptual**: randomized A/B judgment on the intended device or calibrated still display.

Never delete cold hitches during warmup and then claim the page is smooth. Never use a denoised preview alone to claim fine texture survives.

## 7. Three-round stopping rule

Run at least three A/B rounds:

1. map the pipeline and establish first principles;
2. find cross-domain couplings and measurement traps;
3. design controlled experiments and promotion gates.

Continue only if a result changes the graph or promotes/rejects an experiment. Stop when the remaining untested items are lower value than implementation work.

## 8. Promotion rules for this project

- Promote a mobile change only after it improves the same repeatable trace without creating a cold-start regression or visual discontinuity.
- Promote a quality tier only after physical-device evidence; capability hints choose the initial tier but do not prove it.
- Promote a Blender look change only after mesh verification and paired inspection against the reference at fit and 1:1.
- Keep research claims in `evidence.tsv`; keep project outcomes in `experiment-queue.tsv`. Do not merge the two.

The accompanying [concept graph](concept-graph.json), [evidence table](evidence.tsv), and [experiment queue](experiment-queue.tsv) are the working templates.
