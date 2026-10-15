# Quackles Lab

A reproducible branch tournament harness for [#53](https://github.com/kvnloo/quackles/issues/53). It produces evidence. It is not a production architecture change, and it does not promote branches. `nightly` stays the product control. #41 and #50 still decide product questions, and #43 still decides source-family correctness.

This is **PR 1**: the registry, one deterministic tape, the receipt schema, aggregation and a baseline smoke run. The branch matrix (PR 2) and the OpenSeadragon control (PR 3) are not here.

## Gigapixel objective lock (fail-closed)

The existing GP scheduling tournament has its own machine-verified objective in [locks/gigapixel-performance.json](locks/gigapixel-performance.json) and an OMP handoff in [locks/OMP_HANDOFF.md](locks/OMP_HANDOFF.md).

Every GP run MUST supply an explicit `--target-lock` and an explicit `--refs preview/gigapixel-single,preview/gp-...` pair. Before building, the runner checks the full pinned branch SHAs and `quackles-assets` revision. It then checks **every trial** for the real `gigapixel-single` preview, White `p0000000/gp` tile request paths, and 25,820×38,730 source dimensions. Wrong or absent evidence becomes `NOT RUN`; there is no automatic fallback to `main`, `nightly`, or a 201MP lab candidate.

The harness now requires explicit `--refs` even outside GP mode. `main` is an infrastructure branch, not a valid #53 product control. The lock's `preview/scenes-gigapixel` and Blue 201MP work live in separate source/visual lanes rather than this same-master scheduling comparison.

**Regression replay:** `npm run test:lab` includes `target-lock.test.mjs`. It rejects the original assistant-to-OMP handoff, the superficially corrected handoff with no executable guard, main-only and W2-only runs, wrong Chrome preview, and wrong/absent asset requests; it passes only the repaired locked handoff/fixture. These are unit/contract results; no new physical-phone latency result is claimed.

## One-command repro

You need a clone of `kvnloo/quackles` with the remote refs fetched. You also need a sibling checkout of `kvnloo/quackles-assets`, about 5.3 GB with no LFS. Pin it to the SHA in the run you want to reproduce.

```bash
git fetch origin '+refs/heads/*:refs/remotes/origin/*'
git -C ../quackles-assets checkout 4c2c52a3941b260f8c16c4b3cfef06029a97430f
npm ci
npm run lab:run -- --refs nightly,cd62cd66ecdd364a4d7508620113179645f2f131,2d22784d3877e3838fe9eae280e34ba0bb51d13a --trials 5
npm run lab:aggregate -- results/<run-id> --out experiments/results/<run-id>
```

Options:

- `--refs`: remote branch names or commit SHAs. Each one is resolved to a full SHA before anything runs.
- `--trials`: the number of trials per cell. Default 5.
- `--profiles`: `desktop`, `mobile-emulated`, `physical`, or a comma-separated combination. `physical` requires an attached browser and preserves its viewport/DPR. Default `desktop`.
- `--tape`: the tape file. Default `scripts/lab/tapes/smoke-inspect.json`.
- `--prepare-only`: build the exact refs and write `builds.json`, without launching a browser.
- `--prepared-builds FILE`: replay against prebuilt loopback servers from a manifest with matching clean asset revision, full source SHAs, successful build status, and ports. The caller must serve the corresponding pinned outputs.
- `--serve-only`: keep the selected build servers running, without browser replay.
- `--android`: capture ADB battery, thermal, native foreground-window, keyguard, and awake-screen metadata outside each measured pass. Requires working ADB and `--cdp`.
- `--modes A,C,E`: separate cold, budget-limited warm replay, and explicitly offline-prewarmed cells. Mode letters are cache policies, not candidate arm names.

Environment variables:

- `ASSETS_DIR`: the assets checkout.
- `LAB_DIR`: where worktrees and builds go. Default `~/.cache/quackles-lab`. It sits outside the checkout so `npm test` never lints the worktrees.
- `RESULTS_DIR`: where receipts go.
- `RUN_ID`, `REMOTE` and `CHROME` can also be set.
- `GPU=1` asks Chromium for the host GPU. The default is SwiftShader.

Other commands:

- `npm run lab:inventory` regenerates [`branches.json`](branches.json).
- `npm run test:lab` runs the pure unit tests for tapes, receipts and aggregation.

## What a run does

1. **Isolates.** Each SHA gets a detached `git worktree` in `LAB_DIR`. The measured refs are never checked out in place, merged, cherry-picked or rewritten. If a ref has the same `package-lock.json` as the harness checkout, it shares `node_modules`. Otherwise it gets a clean `npm ci`.
2. **Builds** each ref with `npm run build`, using `NEXT_PUBLIC_ASSET_ORIGIN=""` (same-origin assets) and a build SHA/time pinned to the commit. If a build fails, its cells are **NOT RUN**, never losses.
3. **Serves** `out/` with the existing [`scripts/static-server.mjs`](../scripts/static-server.mjs). The pinned assets checkout is linked in as `out/quackles-assets`.
4. **Fences locally launched Chromium.** It runs with `--host-resolver-rules=MAP * ~NOTFOUND` (loopback excluded). External requests fail the `no-external-network` gate. An attached browser is not reconfigured with this fence; its external requests are detected, not blocked.
5. **Replays the tape.** Each trial opens a fresh browser context where supported. Attached Android falls back to its default context, clears browser cache and the selected lab origin's storage, and opens an owned page. Contender order is seeded or balanced across trials. The collector reads the app's existing debug hooks: `__QUACKLES_SEQUENCE__`, `__QUACKLES_INSPECTION__` and `quackles:detail-painted`. It uses no per-frame GPU readback, overlays or app changes.
6. **Writes receipts** to `results/<run-id>/<branch>-<scenario>-<mode>-<profile>-t<k>.json`, plus `traces/`, `screens/` and `run.json`. These stay untracked by default. Published experiments select evidence under `experiments/results/`; do not commit personal browser/device data or pairing credentials.

### The tape (`smoke-inspect`)

The tape lives in [`scripts/lab/tapes/smoke-inspect.json`](../scripts/lab/tapes/smoke-inspect.json). Its hash is recorded in every receipt.

It starts with a cold load, waits for the first app-reported paint and idles for 3 s. It then sets these viewports through `setTarget`:

- 1× → 4× → 8× (`measure: "sharp"`).
- A rapid pan reversal while refinement work is stale.
- Back to 1×.

Finally it sends six trusted CDP wheel events in and six out at a fixed anchor.

Positions are fractions of the `.poster-frame` box. A build with a lower `maxZoom` clamps the 8× steps. The receipt then records a limitation, because its viewports are not the same as those of an 8× build.

### Receipts

The fields follow the issue. Receipts are checked by `checkReceipt` in [`scripts/lab/lib.mjs`](../scripts/lab/lib.mjs):

- `sha` must be a full 40-hex SHA.
- Every `null` metric needs a reason in `metricNotes`. Zeros are never faked.
- Unknown metric keys are rejected, so no composite "score" can be added.

Status values:

- **PASS**: the smoke correctness gates held. It says nothing about feel and is not a ranking.
- **FAIL**: a gate failed, for example page/app errors, external network, HTTP errors, mixed source families or blank polls.
- **NOT RUN**: the build failed, the app never painted, assets were missing at the pinned assets SHA, or the harness hit an error.

What each metric measures:

| metric | measured as | not |
|---|---|---|
| `rafP50/95/99Ms`, `maxFrameMs`, `framesOver33/50Ms` | rAF callback intervals during the tape | GPU completion |
| `firstCorrectVisualMs` | `null` in PR 1 (no pixel check yet). `extra.firstPaintReportedMs` is navigation → first app-reported paint | a correct-visual proof |
| `timeToSharpMs` | `setTarget(8)` → the build's own `detailWidth` ≥ min(frame device px × zoom, fixture width), camera at rest, 50 ms poll | pixel-verified sharpness. `detailWidth` semantics can differ between builds |
| `inputToCameraMs` | injected wheel/touch `event.timeStamp` → first rAF with a changed camera transform (median); touch observations end at the next touch event | physical-finger/native-OS delivery or photon latency |
| `requests`, `transferredBytes`, `abortCount` | Playwright request events. Bytes are loopback body + headers | CDN wire bytes |
| `staleWorkCount` | app-reported `cache.staleDiscard + stalePaints` | |
| `blankFrames` | 50 ms polls with no visible plate/base/detail layer | every frame |
| `decodedPeakBytes` | app-reported `cache.decodedBytes` peak | |
| `gpuResidentBytesEstimate` | **estimate**: canvas backing stores w × h × 4 | measured GPU memory |
| `staleVisibleFrames`, `sourcePops` | `null` until pixel/generation instrumentation exists (PR 2+). Request-level family mixing is gated by `single-source-family` | |

Physical runs disable Playwright's focus emulation, record native page focus/visibility transitions, and retain long foreground rAF stalls in the tail metrics. Hidden or unfocused intervals invalidate the pass; they are not trimmed out. With `--android`, absent/changed thermal status or missing native Chrome foreground/unlocked/awake confirmation before or after measurement also makes the pass **NOT RUN**. Native ADB metadata is filtered before writing receipts.

Mode C replays the same document after preparation; decoded caches remain budget-limited, so it is not a decode-free control. Mode E explicitly disables the page's network through CDP after preparation. Any measured network attempt invalidates offline coverage, even if the remaining cached drawing looks smooth. Neither invalid offline timings nor failed correctness trials enter paired performance comparisons.

The fixture identity comes from the pinned assets checkout. The receipt records:

- the observed source family, for example `blue/p0000000`;
- the master `sha256` from `metadata.json`;
- the dimensions, tile size and codecs from `source.dzi`;
- the assets SHA.

## Registry

[`branches.json`](branches.json) is generated by `npm run lab:inventory`. It holds every remote ref with:

- its resolved SHA, parents and merge-base with `nightly`;
- ahead/behind counts and changed-path areas;
- credit: git authors and `Co-authored-by` trailers of the commits it adds over `nightly`;
- the reusable harnesses it has, and any that hard-code private `/mnt/zer0models` paths;
- its RFC evidence docs, preview id, lane/hypothesis from #53, and flags (`not-comparable`, `separate-suite`, `harness-needs-private-paths`, `sameShaAs`).

Build and run status stay `not-verified` until a receipt exists. Branch names are hypotheses, not proof of behavior.

### Control candidates (not owner-accepted)

The owner's commit audit on #50 names two historical controls. Neither has been accepted by the owner with screenshot or device evidence here. The lab treats them as **candidates**:

| id | commit | lab status |
|---|---|---|
| Q0 | `17132d90` (Sep 15 quiet native-scroll film) | Not on the `nightly` first-parent line. Predates the sequence/inspection hooks the tape needs. Not run. |
| Q1 | `2d22784d` (Sep 21, reversible inspection + Blue ~200MP DZI) | **NOT RUN.** It requests DZI levels (`blue/p0000000/12/*`) that no revision of `quackles-assets` has. Its 404s are missing assets, not a loss. |
| Q1-nightly-promotion | `cd62cd66` (Sep 21, "Promote merged PR #39 state to nightly") | Q1 + `5f11714` (maps DZI variants to committed levels). It runs against assets `4c2c52a3`. `maxZoom` is 4, so the tape's 8× steps are clamped and `timeToSharpMs` is `null` (no zoom change to measure). |

#52 (`fix/direct-touch-p0-resume-20261008`) is **closed and unmerged**. It is counted as an input-lane candidate, not as landed behavior.

## Results

- [`results/`](results/) holds the committed summaries of baseline runs. Read each one's **Pins** section before comparing anything.
- **Baseline smoke** [`20261012-baseline-db694b3`](results/20261012-baseline-db694b3/summary.md): harness `db694b3`, assets `4c2c52a3`, Chromium 141 headless, SwiftShader, 4-vCPU cloud host, 5 cold trials per cell with rotated order. What it shows about the harness:
  - `nightly` (`71c9813a`) and `cd62cd66` PASS every smoke gate on both profiles. There was no external network, no 404, a single source family (`blue/p0000000`, master `sha256:f8741314…`) and no blank polls.
  - `2d22784d` (Q1) is **NOT RUN** in 10/10 trials because of missing assets.
  - On `nightly` mobile-emulated (4× CPU), the build's detail never reached the 8× need before the next tape step in 5/5 trials, so `timeToSharpMs` is `null`.
  - The `cd62cd66` cells are not same-viewport comparable with `nightly`, because maxZoom 4 clamps the 8× steps.
- These runs are a **harness smoke**: headless Chromium on a shared cloud host with SwiftShader. They show that the collector and controls agree. They are not performance evidence, not a feel verdict, and not a ranking. No physical-device or emulated-mobile conclusion follows from them.

## Hardware replay (#53 Wave 2B)

The same runner can drive a **real** browser over CDP. Nothing is emulated in the `physical` profile: the device's own viewport, DPR and GPU are used. Receipts record the attached endpoint, the device note, the GPU renderer string and the DPR. They also carry two limitations:
- the loopback network fence is not applied, so external requests are detected by the `no-external-network` gate rather than blocked;
- an attached browser that cannot open fresh contexts has its cache and storage cleared per trial.

Desktop Chrome on a real GPU:

```bash
google-chrome --remote-debugging-port=9222 --user-data-dir=/tmp/lab-gpu-profile about:blank   # check chrome://gpu first
node scripts/lab/run.mjs --cdp http://127.0.0.1:9222 --profiles physical,desktop --balanced --trials 12 \
  --refs nightly,6f2ef5d216e9d24633a6ad62000912ac0c4e7e08,1b637ed1e7128789419a06d46d62a7f044a46a02,<candidate> \
  --tape scripts/lab/tapes/q1-story-hold.json --device-note "<model, OS, GPU, refresh rate, power/thermal>"
```

Physical Android Chrome (USB debugging on, Chrome open):

```bash
adb forward tcp:9222 localabstract:chrome_devtools_remote
for p in 45940 45941 45942 45943; do adb reverse tcp:$p tcp:$p; done      # one lab server port per ref, from 45940 (LAB_PORT)
node scripts/lab/run.mjs --android --cdp http://127.0.0.1:9222 --profiles physical --balanced --trials 12 --refs ... \
  --tape scripts/lab/tapes/q1-story-hold.json --device-note "<model, Android/Chrome version, refresh rate, battery/thermal>"
```

Notes:
- Keep the screen on/unlocked and native Chrome in front. Foreground recovery must navigate to an actual lab URL, not an uninitialized `about:blank` tab; abandoned blank native targets can stall CDP browser initialization.
- Attached-browser setup uses `noDefaults: true` to avoid changing existing daily-driver focus/media/download settings. Only pages opened by the diagnostic are closed.
- `smoke-inspect` and `q1-story-hold` use exact `setTarget` viewports and trusted wheel injection. `physical-touch-continuity` uses explicitly labeled CDP-injected browser touches; it does not measure physical-finger, touchscreen hardware, native-OS delivery, or input-to-photon latency. Expected contact identities must match observed browser contacts before interpreting a two-to-one transition.
- Galaxy S25 Ultra native foreground/awake/unlocked replay has been exercised against pinned A/D outputs. Explicit offline preparation did **not** cover all subsequent requests; those receipts are exclusions, not offline performance wins. Source mappings and exclusions: [`results/20261015-s25-ultra/`](results/20261015-s25-ultra/).
- `visual-check.mjs --cdp URL --prepared-builds FILE --base SHA --cand SHA --out FILE` compares separate settled physical screenshots against the incumbent. Matching checkpoints do not prove absolute fidelity or transient blank/stale/tier-pop absence. These captures are not timed performance trials.
- Each receipt records repaint cost as `extra.detailPaints.paintFrameMsMedian` and `paintFrameMsMax` (the frame containing each detail paint).

## Not covered yet (by design)

The following are left for later PRs:

- A collector-overhead calibration against an uninstrumented control.
- GPU-fence diagnostics.
- Native-OS/physical-finger input latency and input-to-photon measurement.
- Constrained network profiles beyond explicit offline coverage diagnostics.
- Proven offline coverage for the complete replay workload.
- Full theme-switch visual validation.
- The 1 GP fixture.
- Pixel fidelity.
- The OpenSeadragon same-DZI control (PR 3).

The existing GP feel harness (`scripts/gigapixel-feel-browser.mjs` on the `preview/g*` branches) hard-codes `/mnt/zer0models` assets and an owner trace. It is recorded in the registry rather than rewritten.

## Credit and provenance

- **Branches and findings** belong to their original authors, as recorded per ref in `branches.json` (`credit`). That includes the RFC spike results on `preview/rfc-001-compiler`, `preview/rfc-003-realtime` and `preview/rfc-005-gaussian`, and the existing browser contracts this harness reuses or inventories. Nothing here re-verifies those findings. They are listed as evidence to reproduce later.
- **[Ian Gilman](https://github.com/iangilman)** advocated a reusable benchmark and frame-time uniformity in [openseadragon#2988](https://github.com/openseadragon/openseadragon/issues/2988).
- **[dao251](https://github.com/dao251)** highlighted tile load/update/draw constraints, instrumentation overhead and cross-machine variability in [openseadragon discussion #2982](https://github.com/openseadragon/openseadragon/discussions/2982) and #2988 ([osd-demo](https://github.com/dao251/osd-demo)).
- Crediting them does not imply that either endorsed Quackles or independently verified these results. Nothing in this harness is posted upstream.
