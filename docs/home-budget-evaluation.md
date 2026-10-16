# Repair 7 home evaluation (local-only; not admitted)

## Scope

The overnight D-D6 decision permits experiments, not blanket adoption. `perf/motion-decode-eval` forward-ports the existing motion-decode line to the site integration. `perf/home-frame-budget` owns the independent I18 upload-budget experiment. Neither changes camera/art/zoom limits or publishes anything.

## Motion-decode hypothesis

The moving decode queue can evict resident tiles even though it admits only one decoder. That trades useful residency for moving work and creates re-decodes. The new executable contract fills a two-tile cache, allows a third moving decode, and requires existing tiles to remain resident until settlement. RED: one eviction. GREEN: zero moving evictions and one settled eviction, with normal progress retained.

The guard uses spare decoded capacity only during motion. This is an experiment, **not a successful D-D6 fix**: the matched local replay reduced re-decodes and long frames but lost the HQ p90 advantage. Do not merge it as a win.

## I18 hypothesis

The existing renderer drains detail until frameStart+6ms, underlay until +9ms and floor until +11ms. Each drain permits at least one upload even past its deadline. Separate drain allowances therefore do not form one frame budget.

The independent branch uses one shared +4ms deadline and at most one guaranteed upload across all surfaces after that deadline. Empty surfaces do not consume the progress allowance. Tests cover the common deadline, one-upload overrun and non-starvation. No resolution or cache budget is lowered. This bounds scheduling, not an individual browser upload's execution time.

## I16 measurement disagreement remains open

The existing verifier's `gp_metrics` derives I16 from **only the detail canvas's bounding rectangle and visibility** (`analyze.py`, lines 522–531). Its sampler does not capture the floor or underlay at all. The product intentionally retains a painted whole-image floor and underlay; the separate GP harness samples those layers and reports zero plate-edge/blank frames in the same builds, but uses a different input tape. Thus neither result proves the other wrong for an identical journey.

Do not stretch the detail canvas or change the old assertion to manufacture a pass. The next diagnostic must sample actual per-layer painted coverage on the **same** verifier journey, retaining the old I16 beside a versioned floor-aware result. I16 is not fixed or closed here.

## Evidence interpretation

Historical 1221.5→390.2ms HQ p90 was a single SwiftShader run. Repair 7 repeats both arms with chrome-headless-shell153.0.8010.12 and actual ANGLE/OpenGL hardware identity. Historical and new numbers are separate cohorts. Existing verifier I16–I19 retains its original 412×915/DPR2.625/CPU4/fast4g contract. The home frame-work experiment uses the unchanged v2 union analyzer with a separately named pinch/pan/wheel/theme input tape at390×844/DPR1/CPU4, not the lineage scroll-distance gate. No physical120Hz claim is possible.

Raw replay, verifier and home trace evidence is retained in the private performance lane under `repair7-*`. Final numbers and exact source identities are in that lane's READY and report. Any held candidate remains isolated; integration is not an experiment branch.

## Repair 8: same-journey I16 diagnosis

The three original input journeys now capture both legacy rows and a versioned
`coverageV2` snapshot **in the same measurement task**. The old `gp_metrics`
implementation, input tapes, network model and assertions are unchanged. The
additional sensor retains actual painted source rectangles for detail, underlay
and floor, CSS visibility/opacity, and the transformed base geometry. An offline
exact rectangle-union calculation detects interior holes as well as edge gaps;
it does not assume a canvas bounding box is opaque. Opacity below .99 is
conservatively excluded. It measures plate exposure, not sharpness or HQ latency.

On the admitted timeline integration (home renderer unchanged), one replay per
journey gave:

| Journey | Legacy I16 flags / eligible rows | Painted detail gap rows | Painted union gap rows |
|---|---:|---:|---:|
| quick-pans | 0 / 426 | 8 | 0 |
| touch-feel | 171 / 1070 | 187 | 0 |
| touch-pinch | 8 / 213 | 18 | 0 |

Thus all 179 legacy flags in this cohort were covered by opaque painted lower
layers. The sampler also finds detail holes that its bounding box misses.
Separate readback diagnostics copied the real composited layer pixels into an
inspection canvas: three flagged natural frames each had **0 transparent pixels
out of 252560 interior pixels**. An explicitly synthetic negative control hides
floor/underlay with CSS: the same journey's three readbacks exposed
128432/146160/146160 transparent pixels, and the new sensor detected all three.
PNG inspection agrees. Readback runs are **not timing evidence**.

Legacy I17 p90 remains 22.3 / 1635.2 / 48.5 ms; I18 counts 0 / 1 / 0; quick-pan I19
maximum release ratio .96 and moving-tail p90 5ms. These are one-run observations,
not an all-home nonregression qualification. Added instrumentation means they
must not be compared causally with historical uninstrumented timing runs.

The requested subsequent I16 renderer fix has no reproduced plate-exposure
failure on these journeys. Do not invent one or enlarge the detail rectangle to
silence legacy flags. This change repairs the diagnostic, not production rendering.
The earlier shared-budget and motion experiments remain held; no home merge is
justified. Physical-phone edge quality and I17/I18 remain separate open work.

Commands (all paths supplied by the caller):

```sh
npm run test:home-coverage
QV_TOOL=/path/to/verifier QV_RUNS=/path/to/new-evidence \
  node scripts/home-coverage-browser.mjs baseline /path/to/export \
  quick-pans,touch-feel,touch-pinch
node scripts/home-coverage-analyze.mjs /path/to/new-evidence/baseline/r1
# Run touch-feel separately with QV_COVERAGE_PIXELS=1, once naturally and
# once with QV_COVERAGE_FAULT=1, named natural and fault respectively.
node scripts/home-coverage-readback-contracts.mjs /path/to/pixel-evidence
```

`TMPDIR` is required for generated adapters. Prior evidence directories are never
overwritten. The browser binary/ANGLE preload must match both arms; this cohort
uses headless-shell 153.0.8010.12 with ANGLE NVIDIA OpenGL, not a physical phone.
The pure coverage contracts were observed RED (missing implementation) then GREEN;
the real missing-layer negative control supplies the behavioral red case.
