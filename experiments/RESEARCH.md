# Quackles Lab research log and queue (#53)

Mission: reduce missed display deadlines and input-to-visible latency while keeping the authored imagery, visual quality over time, time to sharp, and bounded memory.

This file is the checkpoint between sessions. Start from **Queue**. Don't repeat an experiment listed under **Waves** unless its pins changed.

## Standing caveats (apply to every number below)

- **Host.** Every run so far used a 4-vCPU cloud VM with headless Chromium 141 and **SwiftShader** (no GPU, `/dev/dri` absent). Canvas 2D and compositing run in software, which inflates the cost of synchronous canvas paints compared with a phone GPU.
- **Hardware transfer is unverified.** These are work-removal results (fewer paints doing identical work), but no GPU host or phone has replayed them yet. Neither the size nor the direction of any timing result is established on real hardware.
- **No phone evidence.** None of these numbers are physical-phone evidence. Promotion needs a physical Android Chrome run and a human feel review (#53 decision gates).
- **Fixture.** Blue `p0000000` 201 MP (master `sha256:f8741314…`) from `kvnloo/quackles-assets@4c2c52a3`, served over loopback. Desktop viewport 1440×1000 at DPR 2. App profile `balanced`, decoded budget 64 MiB.
- **Metric limits.**
  - Frame times are rAF intervals, not photon or GPU completion.
  - `inputToCameraMs` runs from the wheel event to the first rAF with a changed camera transform.
  - Time to sharp trusts the app's own `detailWidth`.
- **Pairing.** Trials are paired by trial number. Ref and mode order is seeded random per trial.
  - `scripts/lab/compare.mjs` reports the median paired difference, a seeded bootstrap 95% CI, and the incumbent's MAD.
  - A result counts as "beyond noise" when the CI excludes 0 and |median diff| > MAD.

## Waves

### W0: where does a missed frame come from? (A/B/C/D decomposition)

- **Run:** `20261012-w0-abcd-b774946`. Ref `nightly` `71c9813a`, tape `smoke-inspect`, 7 trials per mode. Summary: [results/20261012-w0-abcd-b774946](results/20261012-w0-abcd-b774946/summary.md).

| mode | frames >50 ms | rAF p99 | decodes / pass | detail paints (at rest) | long frames containing a paint |
|---|---|---|---|---|---|
| A normal, cold | 48 (42–52) | 150 ms | 601 | 48 (26) | 48/48 |
| B compressed cache warm, asset network blocked | 51 (48–53) | 152 ms | 603 | 52 (27) | 51/51 |
| C prewarmed under capacity pressure (2nd pass in the same document, same 64 MiB budget; **not** decode-free) | 50 (49–53) | 156 ms | 594 | 51 (27) | 50/50 |
| D painted surface, camera-only replay (diagnostic) | 0 (0–1) | 23 ms | 0 | 0 | — |

Preparation cost for B, C and D: about 24.3 s of wall time, about 230 requests, about 45 MB and about 630 decodes per prep pass. This is recorded in each receipt as `extra.prep`.

- **B is only mostly warm.** Each trial had 3–9 tiles that were not in the Cache API and hit the blocked network. They are recorded as a limitation.
- **Correction (2026-10-13).** Mode C was **prewarmed under capacity pressure**: a second pass in the same document within the same 64 MiB budget. It is **not** a decode-free state. Its measured passes still decoded about 590 images, because the wanted set exceeds the budget (Q1). The earlier wording "decoded cache warm" overstated it.
- **Finding.** Network and cold decode are **not** the frame bottleneck: B and C do not reduce long frames. Neither is compositing: D has no long frames, even on SwiftShader.
- **Where the time goes.** Every long frame contains a synchronous `paintDetail`, a full redraw of the buffered detail canvas at about 90–100 ms each. Long Animation Frame entries attribute about 4.7–5.0 s of script per pass to one rAF callback, `SequencePlayer.render`.
- **Decode churn.** All of A, B and C show about 600 decodes per pass, which is the next bottleneck.

### W1: repaint loop in the detail escape test

- **Mechanism.** `escaping = !cropInside(crop, paintedCoverage, 12% inset)` requires an inset on **every** side. Coverage is clamped to the image, so this test can never pass in two cases:
  - zoom < ~1.32;
  - a crop on an image edge.

  `render()` therefore repaints the full detail canvas with identical coverage and tiles. Load completions from cache churn keep scheduling `render()`. One trace shows 22 back-to-back repaints of about 100 ms each at rest at zoom 1.19.
- **H1.** Removing repaints that cannot change pixels cuts frames >50 ms beyond run-to-run noise, without losing sharpness, memory bounds or pixels. It is rejected if at-rest paints drop by less than 80%, the paired drop in frames >50 ms is within noise, or any gate, visual, time-to-sharp or memory check regresses.
- **Contenders.** All three are built from `71c9813a`. The patches in [candidates/](candidates/) reproduce the exact SHAs with `git am --committer-date-is-author-date`.
  - **Incumbent:** `nightly` `71c9813a`.
  - **Simplest alternative:** `d269afba`, which skips a repaint whose detail key is unchanged.
  - **Challenger:** `6f2ef5d2`, which uses no inset on coverage sides already on the image edge (`cropEscapes`, plus `scripts/detail-escape-contracts.mjs`, written to fail first).

Smoke tape, 7 paired trials (`20261012-w1-smoke-27d3af4`):

| metric | mode | nightly | simplest | challenger |
|---|---|---|---|---|
| frames >50 ms | A | 47 | 7 (−40, CI [−41, −36]) | 6 (−41, CI [−43, −37]) |
| frames >50 ms | C | 48 | 8 (−41) | 5 (−43) |
| rAF p99 | A | 162 ms | 31 | 32 |
| detail paints (at rest) | A | 46 (24) | 7 (3) | 5 (2) |
| time to sharp | A | 2814 ms | 2762 (n.s.) | 2833 (n.s.) |
| input → camera | A | 60 ms | 55 (n.s.) | 57 (n.s.) |
| decodes per pass | A | 561 | 708 (+150) | 728 (+173) |

Unseen tape `unseen-edge-wheel`, 10 paired trials (`20261012-w1-unseen-27d3af4`). This tape was written before any W1 result and never used for tuning.

| metric | mode | nightly | simplest | challenger |
|---|---|---|---|---|
| frames >50 ms | A | 47 | 9 (−41) | 7 (−42) |
| frames >50 ms | C | 73 | 35 (−37) | **9 (−64, CI [−68, −62])** |
| rAF p99 | C | 350 ms | 329 (n.s.) | **35 (−333)** |
| paints while moving | C | 55 | 31 | **8** |
| input → camera | C | 64 ms | 60 (n.s.) | 57 (−6.6, beyond noise) |
| decodes per pass | C | 148 | 301 | **725** |

- **Time to sharp on the unseen tape.** It is mostly `null` for **all** builds, nightly included: the 6× corner target is not reached within the ~3.9 s window. This tape cannot show a sharpness regression either way.
- **Visual check** (`scripts/lab/visual-check.mjs`). Four settled states: 1.19×, a 2.5× left edge, 8× interior, and the 6× corner. Each was taken once the camera was at rest, the painted tier was at least the need, and there had been no paint for 1.5 s. Both candidates are **pixel-identical to nightly (maxDiff 0)** in all four. Nightly never reached "no paint for 1.5 s" at 1.19× or at the 2.5× edge, which confirms the loop directly.
- **Memory.** The decoded peak equals the 64 MiB budget for all builds, and the `decoded-within-budget` gate passed. There were no blank polls.

Verdicts:

- **Simplest alternative `d269afba`: REJECT.** It is dominated by the challenger on the unseen tape: it still repaints during every edge pan (C: 35 vs 9 frames >50 ms).
- **Challenger `6f2ef5d2`: KEEP as a lab candidate, but incomplete.** A probe at the 2.5× edge at rest still shows about 9 repaints per second. There, `sharpPlan`'s budget fallback paints coverage == crop (zero slack on interior sides), so the same loop continues. This leads to W1b.
- **Recorded costs for both candidates.**
  - **More decodes, beyond noise** (+27–34% on smoke, up to about 5× on the unseen C pass). Freeing the main thread lets the at-rest decode/evict loop (Queue Q1) spin faster.
  - Decoding is off the main thread here and memory stays bounded. But it costs CPU and battery, and it must be fixed before any promotion.

### W1b: cap the inset by the paint's slack per side

- **Contender:** `93821ef5`, built on `6f2ef5d2`. `slackInsets()` caps each side's early-repaint inset by the slack the painted coverage had beyond the painted crop. The image-edge case is the zero-slack special case.
- **Run:** held-out tape `heldout-midzoom-hold`, committed in `c052457` before any W1b result. 10 paired trials, modes A and C (`20261012-w1b-heldout-c052457`).
  - The receipts mark the harness dirty because an uncommitted `visual-check.mjs` edit sat in the tree.
  - `run.mjs` was unchanged at `c052457`.

v2 vs v1 (paired):

| metric | A | C |
|---|---|---|
| paints at rest | 19 → 2 (beyond noise) | 20 → 2 (beyond noise) |
| paints while moving | **9 → 24 (worse)** | **11 → 22 (worse)** |
| rAF p99 | **+42 ms (worse)** | **+57 ms (worse)** |
| max frame | **+77 ms (worse)** | **+78 ms (worse)** |
| time to sharp | +77 ms (n.s.) | **+159 ms (worse)** |
| frames >50 ms | −3 (n.s.) | −5 (beyond noise) |
| decodes | +24 (beyond noise) | −136 (beyond noise) |

- **Verdict: REJECT `93821ef5`.** It removes the at-rest loop as intended, but more repaints move into motion, and the tail and post-stop sharpening get worse. That is the trade the mission rules out.
- **Why the moving repaints rose is not yet explained.** In theory, smaller insets should escape less often. A working guess: zero-slack coverage painted at the end of one gesture makes the next gesture's first moves escape every frame, while each motion repaint again hits the budget's margin-0 fallback. This needs a trace before any v3 (Queue Q2b).

Held-out confirmation of the W1 challenger vs nightly on the same run:

| metric | A | C |
|---|---|---|
| frames >50 ms | 47 → 28 (−20, CI [−23, −17]) | 50 → 31 (−19) |
| rAF p99 | 187 → 105 ms | 208 → 98 ms |
| max frame | 304 → 233 ms | 337 → 236 ms |
| **time to sharp** | **−805 ms (CI [−998, −771])** | **−1147 ms (CI [−1195, −1074])** |
| decodes | +134 (beyond noise) | +293 (beyond noise) |
| decoded peak | = budget | = budget |
| blank polls | 0 | 0 |

**Wave 1 outcome: KEEP `6f2ef5d2` as the lab candidate.** It is better than nightly beyond noise on three tapes, two of them unseen. It is pixel-identical at four settled states, its time to sharp is equal or better, and memory stays at the budget. It is not for promotion yet:
- it has a known residual at-rest loop when coverage == crop;
- it has higher decode churn (Q1);
- it has no GPU-host or phone evidence (Q3, Q4).

### Q1: bounded admission + priority-aware eviction (on top of W1 v1)

- **Host.** The container moved hosts between W1 and Q1: the CPU is now a 2.10 GHz Xeon x4 (it was 2.80 GHz). Q1 never compares against W1 numbers. v1 was re-measured as the control arm in every Q1 run.
- **Hypothesis.** Speculative images repeatedly displace useful decoded images because the requested working set exceeds the budget. Controlling admission, not just eviction order, should end the decode churn.
- **Arms.** Each arm is a single mechanism, and each later arm sits on top of the earlier one. Patches are in [candidates/](candidates/).

| arm | commit | change |
|---|---|---|
| A | v1 `6f2ef5d2` | unchanged |
| B | `99a629f9` | `retain()` carries the player's existing priorities. A job may evict only images *no more useful than itself*: unwanted first, then the least useful, then LRU. Pinned images stay untouchable. Eviction is still greedy, and equals may displace each other. |
| C | `1b637ed1` (on B) | **Admission.** A job starts only if *strictly less useful* (or unwanted) images free enough room, and it evicts nothing otherwise. A deferred job keeps its asset compressed via the existing idle-warm path. Deferred work is reconsidered only on a demand change (a changed `retain`/`pin`) or a capacity change (a job finishes). Identical per-frame demand does not re-run admission. There are no timers, no pin-all, the 64 MiB budget is unchanged, and scroll prefetch stays. |

**Regression checks** (`scripts/sequence-contracts.mjs` in C; fixtures, no browser). Decoded + reserved bytes are sampled every 1 ms in each check. Evidence: [results/20261013-q1-unit-matrix](results/20261013-q1-unit-matrix/).

| check | A | B | C |
|---|---|---|---|
| wanted bytes > budget settle without a cycle | FAIL (2001 decodes / 6 wanted) | FAIL (2001) | pass (4 decodes) |
| low priority never displaces useful images | FAIL (995 bitmaps closed) | pass | pass |
| forward/reverse scroll priorities: current frame fed, no churn at rest | FAIL (starved) | pass | pass |
| deferred: dedupe, stale abort, kept compressed, resolves on capacity | FAIL | FAIL | pass |
| identical demand does not re-run admission | FAIL | FAIL | pass |

**Intentional behaviour change in C.** The existing "serialize high detail work" check retains 6 × 24 MiB of equal-priority detail against a 96 MiB budget. In C the over-budget remainder now waits (2 deferred) instead of evicting its equals. The check was adjusted to say so.

**Browser runs.** Harness `63ba81d`; Blue 201 MP, assets `4c2c52a3`; desktop 1440×1000 at DPR 2; SwiftShader. 7 paired trials per cell, seeded random order.

| tape | metric | v1 | B | C |
|---|---|---|---|---|
| **held-out `q1-story-hold`** (story scroll, reverse, re-inspect, 30 s hold) | frames >50 ms | 462 | 6 (−456) | 6 (−456) |
| | **30 s hold: decodes / evictions / detail paints** | **918 / 918 / 418** | 0 / 0 / 0 | **0 / 0 / 0** |
| | 30 s hold: process CPU | 48.9 s | 1.38 s | 1.36 s |
| | 30 s hold: frames >33 ms | 419 | 1 | 1 |
| | refinement settles (cap 20 s) | never (20.0 s) | 1.5 s | 1.5 s |
| | max decodes of one asset per run | 363 | 37 | **6** |
| | process CPU per run | 102 s | 18.0 s | 16.1 s |
| | story-scroll rAF p95 / max (fwd, rev) | 18.3/22.8, 17.9/21.4 | n.s. (rev max +1.8 ms, beyond noise) | n.s. |
| | time to sharp | 2548 ms | n.s. | n.s. |
| smoke (mode A) | decodes / max per asset | 876 / 252 | 861 / 248 (n.s.) | **381 / 6** |
| | process CPU per run | 29.6 s | n.s. | −12.8 s |
| | frames >50 ms, p99 | 7, 24 ms | n.s. | n.s. |
| | time to sharp | 2494 ms | **+60 ms (beyond noise)** | +19 ms (beyond noise, unbalanced order; see retest) |
| held-out mid-zoom (mode A) | frames >50 ms | 33 | 13 | 15 |
| | decodes / max per asset | 845 / 178 | 566 / 120 | **338 / 7** |
| | time to sharp | 2845 ms | n.s. | n.s. |
| mid-zoom, mode C (prewarmed under pressure) | decodes | 1026 | 641 | **391** |

**Sharpness retest.** Smoke, mode A, v1 vs C, 12 trials, **balanced order** (every permutation equally often), harness `9d81e00`.
- C's time to sharp is **−1.1 ms (CI [−37.7, +28.4])**: no delay. The first run's +19 ms coincided with C running last in 4 of 7 trials.
- The decode, CPU and churn reductions all reproduce: decodes 867 → 374, max per asset 255 → 6, process CPU −12.8 s.
- The **visual check** covers 1.19×, the 2.5× edge, 8× interior, the 6× corner and a story-scrolled state at 0.12. **B and C are pixel-identical to v1 (maxDiff 0)** in all five. v1 never quiets at the 2.5× edge.
- Memory: the decoded peak equals the 64 MiB budget in every arm, and decoded + reserved never exceeds the budget in the unit checks. Blank polls: 0. The canvas backing-store estimate is unchanged. GPU memory is not measurable on this host.

**v1's remaining repaint loop, counted separately.**
- In v1, the zero-slack escape test (W1 residual, Q2b) repainted **418 times in the 30 s hold**.
- In B and C, **0 paints in the hold**, and detail paints at rest across the run drop 734 → 3 (story) and 30 → 2 (mid-zoom).
- **This loop was not fixed; it lost its trigger.** Each repaint was a `render()` scheduled by a decode completion from the churn. The escape defect is still there: any render at rest with zero-slack coverage (e.g. a theme change, a resize or a late tile) will still repaint once per render. Q2b is still open.

Verdicts:

- **C `1b637ed1`: KEEP as the new lab candidate** (v1 + Q1). Idle decode/evict cycles stop: 0 in the hold, and at most 6–8 decodes of one asset per run vs 178–363. Foreground work is not starved: time to sharp is n.s. on three tapes plus the balanced retest, frames >50 ms are equal or better, and input → camera is n.s. Story-scroll feel is unchanged, memory is bounded and pixels are identical. Process CPU per run is 13–86 s lower. Not for promotion: no GPU or phone evidence, and Q2b is latent.
- **B `99a629f9`: REJECT.** It ends the stationary loop on the story tape and protects useful images, but it leaves equal-priority churn (smoke decodes unchanged; 2001 decodes in the unit check). It also delayed time to sharp by +60 ms on smoke in the unbalanced run (not retested). C dominates it.
- **v1 `6f2ef5d2`** stays the control arm.

## Queue (highest expected value first)

Q1 is done; C `1b637ed1` is the incumbent for every item below.

1. **Q2b, the latent zero-slack repaint loop.** With churn gone, it now fires only when something else schedules `render()` at rest. Steps:
   - Quantify it with a probe that triggers renders at rest at 2.5× (e.g. a theme mix change, a resize, a late tile).
   - Then fix it without W1b's motion regressions. The leading idea is to make the *budget fallback* in `sharpPlan` keep some slack (or skip the repaint when the planned coverage equals the painted coverage and the tier is unchanged), rather than shrinking insets.
   - Measure motion **and** post-stop sharpening on all four tapes, with a balanced order for finalists.
2. **Q2, remaining long frames.** `maxFrameMs` is about 125–160 ms in C: the first sharp-tier paint and tier upgrades, a full redraw of 48–54 tiles. Candidates: an incremental paint of newly exposed or upgraded tiles, or splitting a paint across frames while the old surface stays visible.
3. **Q3, a real GPU host.** Replay v1 and C (plus the nightly control) with `GPU=1` on a host with a real GPU. This is required before any claim transfers.
4. **Q4, physical phone.** Android Chrome, the same tapes (touch tapes need a CDP touch port), and a human blind A/B feel review. Required before promotion.
5. **Q5, collector overhead.** Calibrate the collector (rAF loop, polls, LoAF, decode counter) against an uninstrumented control.

## Negative findings

- **Warm caches alone don't help frame pacing.** W0: B and C vs A show no reduction in long frames. Prefetch and warm-up work cannot fix this bottleneck.
- **The identical-key repaint skip (`d269afba`) is not enough.** It misses the per-frame repaints during edge pans, because the coverage changes slightly every frame while it stays at the image edge.
- **Slack-capped insets (`93821ef5`, W1b) are rejected.** They fix at-rest repaints but add repaints in motion, worsen the tail (p99 +42–57 ms, max +77 ms), and slow time to sharp (+159 ms in C).
- **Priority-aware eviction alone (Q1-B `99a629f9`) does not end churn.** Equal-priority speculative work keeps swapping places: smoke decodes are unchanged, and the unit check shows 2001 decodes for 6 wanted assets. Admission is the mechanism that matters.
- **Unbalanced order can fake a small effect.** C's first-run +19 ms time to sharp (beyond noise) vanished under a balanced 12-trial retest (−1.1 ms). Use `--balanced` for close finalists.
- **v1's residual repaint loop was fed by cache churn.** Removing the churn hides it. It does not fix it (Q2b).
- **`2d22784d` (Q1 control) is not runnable** against any `quackles-assets` revision (missing DZI levels). Use `cd62cd66`.
