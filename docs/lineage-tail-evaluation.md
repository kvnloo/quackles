# Repair 8: local admission and remaining timeline tails

Archive settlement runtime `670f81b76de4bedfd82b33a63d36e73e0de2d355`
was locally admitted under the owner's delegated option A. This does not mean
that historical LoAF failures disappeared or physical 120Hz is qualified.

## Matched chrome-headless-shell v2 cohorts

All runs use shell 153.0.8010.12, ANGLE NVIDIA OpenGL, mobile 390×844/DPR1,
4× CPU and pinned owned descendants. Thresholds, input tapes, measurement windows,
frame/callback counts and negative-control admission remain unchanged.

| Cohort / arm | N | p95 run median / IQR ms | Worst work ms | Forced | LoAF | Full passes |
|---|---:|---:|---:|---:|---:|---:|
| Original v2 scroll / before settlement fix | 10 | 1.305150 / .140575 | 7.659 | 2 | 2 | 8 |
| Original v2 scroll / admitted runtime | 10 | 1.251600 / .080738 | 4.559 | 0 | 0 | 10 |
| Original v2 scrub / before settlement fix | 10 | 1.398650 / .621388 | 4.334 | 0 | 0 | 10 |
| Original v2 scrub / admitted runtime | 10 | 1.439675 / .190388 | 5.451 | 0 | 3 | 8 |
| Deferred-JSON observer scrub / before settlement fix | 10 | 1.417050 / .220637 | 3.188 | 0 | 1 | 9 |
| Deferred-JSON observer scrub / admitted runtime | 10 | 1.429175 / .305713 | 3.775 | 0 | 0 | 10 |

Each series also has ten interleaved bad-control runs, all failing. Scroll
comparison repeatability passes. Original scrub comparison repeatability fails
on the baseline. Deferred-JSON scrub comparison repeatability passes, but its
baseline has one LoAF, so the whole runner still exits nonzero. No results were
dropped to manufacture an all-green conclusion.

## Attribution and one focused harness change

The original scrub trace attributes one 277.168ms FunctionCall to the harness's
PerformanceObserver callback, not the shipped timeline. Its thread CPU is
4.147ms; most elapsed time is not CPU execution. Two other candidate LoAF entries
have empty script lists. Historical archive LoAF entries similarly contain only
small enabled trace spans, but bracketing thread CPU is substantial. Empty
scripts do not prove idle or host-only delay; browser/runtime/throttling work can
be absent from the enabled categories.

The focused experiment retains native LoAF entries during observer delivery,
then serializes them after the unchanged end mark. It preserves every overlapping
entry, queued `takeRecords()` entry and complete script attribution. Unit tests
cover no hot-path serialization and overlap semantics. A real browser 120ms
negative-control callback is captured with its script attribution, with zero
serializations before completion. The experiment changes test instrumentation,
**not the renderer or the pass thresholds**.

The two observer cohorts are sequential; their different LoAF counts do not
establish a causal cure. The original failing receipts remain authoritative
history. Keep the broader tail gate open until repeated controlled observation
resolves the runtime/scheduling gap. No speculative production rendering change
is justified by the observer callback alone.

## Verification

`npm test`, explicit MJS ESLint, `node scripts/loaf-capture-contracts.mjs`, and
`CHROME=... node scripts/loaf-capture-browser.mjs` pass. A one-repeat native-scroll
pilot exercises the new collector independently; it is not N10 qualification.
The admitted public runtime remains byte-identical; only harness code and this
report change on the feature branch. The initial scroll attempt omitted its
asset mirror and produced HTTP errors: that invalid cohort is retained separately
and is excluded from all numbers above.
