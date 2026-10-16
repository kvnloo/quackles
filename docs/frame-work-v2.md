# Frame-work harness v2

## Admission contract (explicit method replacement)

The former `SCROLL_GATE=1` assertion on headless rAF interval p95 is retired.
It mixed display scheduling, software raster and shared-host contention with
application work. Its historical receipts remain unchanged. This is an explicitly
authorized method change, not evidence that the old gate passed.

At mobile 390×844, DPR 1 and **4× CDP CPU throttling**, each accepted run requires:

- Main-thread rendering **work p95 ≤4.0 ms; maximum ≤8.3 ms**.
- Zero synchronous style/layout events nested inside script execution.
- Zero Long Animation Frames overlapping the measured interaction.
- No page/HTTP errors and the full 5760 px scroll distance.
- At least 240 traced main-thread frames and rAF callbacks; fewer samples are an
  invalid run, not a claim about physical refresh rate.

An experiment requires ≥10 runs per variant, interleaved AB/BA (negative control
included), with run-level medians, quartiles and IQR. Predeclared repeatability:
p95 IQR ≤0.5 ms **and** ≤25% of its median. The deliberately bad control must fail
every repeat and expose forced layout. A failure of repeatability means **runner
validation is blocked**, not that the page is admitted or conclusively rejected
on timing. Forced-layout attribution is still diagnostic evidence.

## What is counted

`fw:start` / `fw:end` User Timing marks select the interaction and identify the
page's renderer main PID/TID. `ProxyMain::BeginMainFrame` complete-event starts
partition frames; missing marks or boundaries fail closed. Within each frame,
union—not naive summation—of complete main-thread event intervals counts:

- FireAnimationFrame (all callbacks, including the lightweight sampler);
- UpdateLayoutTree / RecalculateStyles, Layout;
- PrePaint, Paint, Layerize;
- Commit / ProxyMain::BeginMainFrame::commit;
- Decode Image, ImageDecodeTask, Decode LazyPixelRef, when on the main thread.

Nested events count once. Other threads are excluded. Trace thread-CPU durations
are also reported, but **the gate uses conservative elapsed rendering spans**;
preemption within a span can still inflate them. It does not replace an 8.3 ms
budget with a callback-only number or divide measured work by the throttle rate.
Raw trace and per-frame event attribution are retained for audit. Chromium trace
names are version-sensitive; upgrade tests and revalidate controls after upgrades.

A style/layout span contained inside FunctionCall, FireAnimationFrame,
EvaluateScript or RunMicrotasks is classified as forced synchronous work. This
includes a single forced flush, not just repeated thrashing. LoAF is supplemental:
its ~50 ms threshold cannot certify 120 Hz. Raster/GPU work is not included in
main-thread work; the half-frame p95 budget reserves headroom, not GPU proof.

## Input and render path

CDP `Input.synthesizeScrollGesture` sends native mouse-source scrolling,
5760 px at 1440 px/s, inside the selected scroll region. The rAF sampler **does
not write scrollTop**: an initial pilot showed that such a harness write itself
forced layout after asynchronous image loads. The pilot is preserved, not used
for acceptance. LoAF spans are filtered to the marked window. rAF intervals are
**INFORMATIONAL ONLY**. This is headless mobile emulation, not touch-to-photon,
120 Hz presentation, real-phone thermals, or deployed-CDN qualification.

Launch requests `--enable-gpu-rasterization --use-angle=gl` (ANGLE override via
`ANGLE`). `SystemInfo.getInfo` records the actual device, renderer, rasterization
and compositing status. A requested flag is never labelled hardware acceleration
without that receipt. This host exposed NVIDIA RTX 3080 Ti / ANGLE OpenGL, enabled
GPU compositing and forced-on GPU rasterization. No `--disable-gpu` is used.

Each run records `/proc/loadavg` before/after. `frame-work-pin.py` samples per-core
CPU utilization over two seconds, selects the four least-busy distinct physical
cores within the allowed affinity, and pins only itself and owned descendants.
`pin.json` preserves that selection. Affinity is verified by the Node runner.
Pinning is cooperative, **not exclusive CPU reservation**; other jobs, GPU load,
frequency changes and SMT siblings can still cause variance. Never kill unrelated
jobs or loosen repeatability to make a busy host pass.

## Reproduction

Build immutable exports outside the source tree (otherwise ESLint scans built
bundles). Supply the real local asset checkout; do not substitute fake images.
Use an unused evidence directory for each invocation.

```json
[
  {"name":"baseline","directory":"/absolute/baseline-export"},
  {"name":"candidate","directory":"/absolute/candidate-export"},
  {"name":"bad","directory":"/absolute/baseline-export","bad":true}
]
```

```sh
npm run test:frame-work
python3 scripts/test_frame_work_pin.py
LINEAGE_ASSETS="$ASSET_CHECKOUT" ARTIFACTS="$EVIDENCE" \
  python3 scripts/frame-work-pin.py "$VARIANT_CONFIG"
```

Defaults: `route=/lineage/`, `selector=#lineage-viewport`,
`ready=[data-ready="true"]`. Override these per variant for another route's
scroll container; the container must have at least 5760 px of scroll travel.
`REPEATS` defaults to 10; lower counts are diagnostic and cannot validate.
`CHROME` selects the executable. New contexts keep browser cache state comparable;
initial fonts/current images settle before measurement, newly revealed archive
images load normally during scrolling. These are not predecoded whole-archive
benchmarks.

The bad variant appends a test-only element and alternates width/offsetWidth reads
20 times per rAF. It never changes shipped source. Unit fixtures prove overlap
union, thread isolation, nested forced-layout detection, threshold boundaries and
fail-closed missing telemetry. Real bad-control traces verify the browser path.
`summary.json` is computed by reading each persisted run back; raw files, GPU
metadata, HTML digest and all run outcomes remain available.

## Current qualification

The implementation and negative-control detection are exercised. On this busy
host, baseline repeatability has **not** met the declared criterion in the first
two 10-repeat A/B experiments; neither experiment authorizes lineage admission.
Staged overscan and staged-plus-cached-geometry/size-containment changes were
preserved as patches and reverted. Exact experiment numbers and the final pin
rerun live in the private program lane receipts, not in a timeless performance
claim in this document. A controlled runner and a no-forced-layout architecture
experiment remain necessary if the final repeated baseline is also unstable.
