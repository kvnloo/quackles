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

### W2A: redundant stationary paints (on top of Q1-C)

- **Reproduction** (`scripts/lab/redraw-probe.mjs`, 3 trials per cell; [results/20261014-w2a-probe](results/20261014-w2a-probe/README.md)).
  - On C at 2.5× (Blue 201 MP; the budget fallback paints coverage == crop, so there is zero slack), forced redraws repaint identical content: an unchanged render request **2×**, a same-theme request **5×**, a 1 px resize **4×**. Each paint costs a 120–190 ms frame on this host.
  - A late adjacent plate caused 0 paints.
  - The 8× interior control, which has slack, repaints **0×** for the same triggers.
- **Mechanism.** `render()` → `escaping = cropEscapes(crop, paintedCoverage, 12%)`. With zero slack on an interior side this is always true, so every render at rest repaints. `sharpPlan()` reaches zero slack because the 40% and 20% buffers do not fit the decoded budget at the 5792 tier.
- **Arms** (one mechanism each, on C `1b637ed1`):

| arm | commit | change |
|---|---|---|
| C | `1b637ed1` | incumbent |
| **G** | `18bb1dec` | settled-only content guard. At rest, skip a detail paint whose canvas content would be identical: frame, visible themes, per-layer tier, alpha and tile set, exact coverage, backing size (`detailContentKey`, `scripts/detail-content-contracts.mjs`, written to fail first). Motion rules and the escape inset are unchanged, so the rejected W1b inset strategy is not repeated. |
| P | `11d42fd4` | buffer planning. `sharpPlan` tries a 13% margin (just above the inset) before the zero-slack fallback. |

**Probe** (2.5× zero slack):

| trigger | C | G | P |
|---|---|---|---|
| unchanged | 2/2/2 | **0/0/0** | 2/2/2 |
| same theme | 5/5/5 | **0/0/0** | 5/5/5 |
| resize | 4/4/4 | **0/0/0** | 4/4/4 |
| real theme switch | 2/2/2 | 1/1/1 | 2/2/2 |

- G's end states are **pixel-identical to C (maxDiff 0)** for every trigger and state, including the theme switch where it paints once fewer. The intermediate frames of that transition were not captured.

**Balanced paired trials** (harness `5fc18dc`; 6 trials, all permutations equally often; smoke, unseen edge/wheel, held-out mid-zoom, held-out story+hold; 72 trials, all PASS):
- **G vs C:** no gate regressed beyond noise on any tape. Motion rAF p99 is n.s. everywhere (story −1.5 ms, beyond noise). Time to sharp, story-scroll tails, decodes, decoded peak (= budget) and blank polls are all n.s.
- The tapes contain no forced redraws at zero slack, so paint counts are unchanged there. G's gain is the probe's: removed redundant paints.
- **Visual** (5 settled states incl. story-scrolled): G is **pixel-identical** to C.
- **P:** the visual check differs at the 2.5× edge (maxDiff 204, 1.6% of pixels). The difference is in the inspection viewfinder inset, not the main scene.

**Verdicts:**
- **G `18bb1dec`: KEEP** as the new lab incumbent (v1 + Q1-C + W2A-G). Not for promotion.
- **P `11d42fd4`: REJECT.** No repaint benefit: the budget still forces zero slack. It also changes the viewfinder pixels.

### W2B: hardware validation (NOT RUN)

- **Not run.** No real desktop GPU and no physical Android device were available to the lab session. Both account environments are Anthropic cloud containers, and `/dev/dri` is absent.
- **Not substituted.** Emulation is not used in place of hardware evidence.
- **What exists instead:** the runner can replay on real hardware over CDP (`--cdp`, `physical` profile, `--device-note`, repaint duration in `extra.detailPaints.paintFrameMs*`). See the README "Hardware replay" section.
  - Tested only against a local headless Chromium.
  - The Android default-context fallback is untested.
- **Replay set:** `nightly 71c9813a`, v1 `6f2ef5d2`, Q1-C `1b637ed1`, W2A-G `18bb1dec`, on the story+hold, smoke and mid-zoom tapes, 12 trials, `--balanced`.

### W2C: split the remaining synchronous redraw (NOT RUN, gated)

- **Gated on W2B.** It runs only if hardware confirms that the remaining 48–54-tile synchronous redraw is expensive there.
- **Current lab evidence:** max frames are about 270–340 ms on SwiftShader, and each paint frame is 120–190 ms. Software canvas inflates these.

## Queue (highest expected value first)

The incumbent is **W2A-G `18bb1dec`** (v1 + Q1-C + settled guard).

1. **W2B, hardware replay (blocked on devices).** Desktop Chrome on a real GPU and physical Android Chrome. Replay nightly, v1, Q1-C and W2A-G with `--cdp`.
   - **Measure:** frame tails, `paintFrameMs` (repaint duration), visual continuity and input → camera.
   - **Hypothesis H-W2B:** "Detail-paint frames on a real GPU stay above one display deadline (≥ 16.7 ms at 60 Hz, ≥ 8.3 ms at 120 Hz) for the 48–54-tile sharp paint."
   - **Reject W2C if** the median `paintFrameMs` of sharp paints is within one deadline on both devices.
2. **W2C, split the synchronous redraw** (only if W2B confirms). Bounded offscreen staging (a second canvas at the same backing size, drawn incrementally across frames) with atomic publication (one swap). Compare against the incumbent, including canvas backing memory (2× during staging) and the cost of the final publication.
3. **Touch tapes.** A CDP touch port of the tape format (pinch, 2→1 handoff, held still), so hardware replay covers #50's direct-touch questions.
4. **Collector overhead.** Calibrate against an uninstrumented control (Q5).

## Negative findings

- **Warm caches alone don't help frame pacing.** W0: B and C vs A show no reduction in long frames. Prefetch and warm-up work cannot fix this bottleneck.
- **The identical-key repaint skip (`d269afba`) is not enough.** It misses the per-frame repaints during edge pans, because the coverage changes slightly every frame while it stays at the image edge.
- **Slack-capped insets (`93821ef5`, W1b) are rejected.** They fix at-rest repaints but add repaints in motion, worsen the tail (p99 +42–57 ms, max +77 ms), and slow time to sharp (+159 ms in C).
- **Priority-aware eviction alone (Q1-B `99a629f9`) does not end churn.** Equal-priority speculative work keeps swapping places: smoke decodes are unchanged, and the unit check shows 2001 decodes for 6 wanted assets. Admission is the mechanism that matters.
- **Unbalanced order can fake a small effect.** C's first-run +19 ms time to sharp (beyond noise) vanished under a balanced 12-trial retest (−1.1 ms). Use `--balanced` for close finalists.
- **v1's residual repaint loop was fed by cache churn.** Removing the churn hides it. It does not fix it (Q2b).
- **Buffer planning cannot fix the zero-slack repaint at the 5792 tier (W2A-P `11d42fd4`).** A 13% margin does not fit the 64 MiB budget, so the coverage stays == crop. It also changed the viewfinder pixels.
- **`2d22784d` (Q1 control) is not runnable** against any `quackles-assets` revision (missing DZI levels). Use `cd62cd66`.
