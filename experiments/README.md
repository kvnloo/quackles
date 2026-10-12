# Quackles Lab

A reproducible branch tournament harness for [#53](https://github.com/kvnloo/quackles/issues/53). It produces evidence. It is not a production architecture change, and it does not promote branches. `nightly` stays the product control. #41 and #50 still decide product questions, and #43 still decides source-family correctness.

This is **PR 1**: the registry, one deterministic tape, the receipt schema, aggregation and a baseline smoke run. The branch matrix (PR 2) and the OpenSeadragon control (PR 3) are not here.

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
- `--profiles`: `desktop`, `mobile-emulated`, or both. Default `desktop`.
- `--tape`: the tape file. Default `scripts/lab/tapes/smoke-inspect.json`.

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
4. **Fences the network.** Chromium runs with `--host-resolver-rules=MAP * ~NOTFOUND` (loopback excluded). A build that reaches for GitHub Pages or any other host fails the `no-external-network` gate. It cannot silently measure the CDN.
5. **Replays the tape.** Each trial opens a fresh browser context, so the cache is cold. Contender order rotates every trial. The collector reads only the app's existing debug hooks: `__QUACKLES_SEQUENCE__`, `__QUACKLES_INSPECTION__` and `quackles:detail-painted`. It uses no `readPixels`, no overlays and no app changes.
6. **Writes receipts** to `results/<run-id>/<branch>-<scenario>-<profile>-t<k>.json`, plus `traces/`, `screens/` and `run.json`. These stay untracked. Only `summary.md` and `summary.csv` get committed.

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
| `inputToCameraMs` | wheel `event.timeStamp` → first rAF with a changed camera transform (median) | photon latency |
| `requests`, `transferredBytes`, `abortCount` | Playwright request events. Bytes are loopback body + headers | CDN wire bytes |
| `staleWorkCount` | app-reported `cache.staleDiscard + stalePaints` | |
| `blankFrames` | 50 ms polls with no visible plate/base/detail layer | every frame |
| `decodedPeakBytes` | app-reported `cache.decodedBytes` peak | |
| `gpuResidentBytesEstimate` | **estimate**: canvas backing stores w × h × 4 | measured GPU memory |
| `staleVisibleFrames`, `sourcePops` | `null` until pixel/generation instrumentation exists (PR 2+). Request-level family mixing is gated by `single-source-family` | |

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

## Not covered yet (by design)

The following are left for later PRs:

- A collector-overhead calibration against an uninstrumented control.
- GPU-fence diagnostics.
- Physical Android Chrome.
- Constrained network profiles.
- Touch/pinch tapes (the touch harnesses on these branches need private owner traces).
- Story-phase and theme-switch tapes.
- Warm and offline cache passes.
- The 1 GP fixture.
- Pixel fidelity.
- The OpenSeadragon same-DZI control (PR 3).

The existing GP feel harness (`scripts/gigapixel-feel-browser.mjs` on the `preview/g*` branches) hard-codes `/mnt/zer0models` assets and an owner trace. It is recorded in the registry rather than rewritten.

## Credit and provenance

- **Branches and findings** belong to their original authors, as recorded per ref in `branches.json` (`credit`). That includes the RFC spike results on `preview/rfc-001-compiler`, `preview/rfc-003-realtime` and `preview/rfc-005-gaussian`, and the existing browser contracts this harness reuses or inventories. Nothing here re-verifies those findings. They are listed as evidence to reproduce later.
- **[Ian Gilman](https://github.com/iangilman)** advocated a reusable benchmark and frame-time uniformity in [openseadragon#2988](https://github.com/openseadragon/openseadragon/issues/2988).
- **[dao251](https://github.com/dao251)** highlighted tile load/update/draw constraints, instrumentation overhead and cross-machine variability in [openseadragon discussion #2982](https://github.com/openseadragon/openseadragon/discussions/2982) and #2988 ([osd-demo](https://github.com/dao251/osd-demo)).
- Crediting them does not imply that either endorsed Quackles or independently verified these results. Nothing in this harness is posted upstream.
