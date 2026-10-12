# Quackles Lab research log and queue (#53)

Mission: reduce missed display deadlines and input-to-visible latency while keeping the authored imagery, visual quality over time, time to sharp, and bounded memory.

This file is the checkpoint between sessions. Start from **Queue**. Don't repeat an experiment listed under **Waves** unless its pins changed.

## Standing caveats (apply to every number below)

- **Host.** Every run so far used a 4-vCPU cloud VM with headless Chromium 141 and **SwiftShader** (no GPU, `/dev/dri` absent). Canvas 2D and compositing run in software, which inflates the cost of synchronous canvas paints compared with a phone GPU.
- **Direction vs size.** The *direction* of a work-removal result (fewer paints doing identical work) should carry over to real hardware. The *size* in milliseconds will not.
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
| C decoded cache warm (2nd pass, same 64 MiB budget) | 50 (49–53) | 156 ms | 594 | 51 (27) | 50/50 |
| D painted surface, camera-only replay (diagnostic) | 0 (0–1) | 23 ms | 0 | 0 | — |

Preparation cost for B, C and D: about 24.3 s of wall time, about 230 requests, about 45 MB and about 630 decodes per prep pass. This is recorded in each receipt as `extra.prep`.

- **B is only mostly warm.** Each trial had 3–9 tiles that were not in the Cache API and hit the blocked network. They are recorded as a limitation.
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

### W1b: cap the inset by the paint's slack per side (in progress)

- **Contender:** `93821ef5`, built on `6f2ef5d2`. `slackInsets()` caps each side's early-repaint inset by the slack the painted coverage had beyond the painted crop. The image-edge case is the zero-slack special case.
- **Run:** held-out tape `heldout-midzoom-hold`, committed in `c052457` before any W1b result. 10 paired trials, nightly vs W1 challenger vs W1b, modes A and C.
- **Results:** pending.

## Queue (highest expected value first)

1. **Q1, at-rest decode/evict loop (`FrameCache.room`).** `room()` evicts any unpinned decoded entry in LRU order, including entries the player still `retain`s, to admit a job of any priority. At rest, the retained set is more than 64 MiB: pinned detail tiles, plus four adjacent-frame and two neighbor-theme 1024×1536 plates at 6 MiB each. The plates evict one another forever.

   Probe: at rest at 1.19× with the W1 challenger, there were 660 decodes and 605 closed bitmaps in 20 s, with zero network, zero paints and a cache that never went idle. On nightly, each completion also triggered the W1 repaint.

   - **H2.** Admission that never evicts a still-wanted entry for a job of equal or lower priority ends the loop without slowing time to sharp.
   - **Reject if:**
     - at-rest decodes in a 10 s hold drop by less than 90%;
     - time to sharp regresses beyond noise;
     - frames >50 ms get worse;
     - the decoded peak exceeds the budget;
     - **story-scroll smoothness regresses** (adjacent-frame plates exist for scrolling). Run `npm run test:scroll` / `fps-harness` and add a scroll tape.
   - **Contenders:**
     - incumbent: the W1 or W1b winner;
     - simplest alternative: do not evict wanted entries at all, so the job waits;
     - challenger: priority-aware eviction.
2. **Q2, remaining long frames.** `maxFrameMs` stays at about 220–330 ms in every build. These are the first sharp-tier paint and tier upgrades: a full 2400×3600 canvas redraw of 48–54 tiles. Candidates, in order:
   - incremental paint of only the newly exposed or upgraded tiles;
   - splitting a paint across frames, keeping the old surface visible until it is complete;
   - avoiding `imageSmoothingQuality: "high"` only where the scale is exactly 1:1. This needs a pixel check and must not reduce quality.
3. **Q3, a calibrated GPU host.** Re-run W0/W1 with `GPU=1` on a host with a real GPU. The SwiftShader numbers overstate paint cost.
4. **Q4, physical phone.** Run the W1/W1b finalist plus the Q1 winner on Android Chrome with the same tapes (touch tapes need a CDP touch port of the tape format) and a human blind A/B feel review.
5. **Q5, collector overhead.** Calibrate the collector (rAF loop, polls, LoAF observer) against an uninstrumented control.

## Negative findings

- **Warm caches alone don't help frame pacing.** W0: B and C vs A show no reduction in long frames. Prefetch and warm-up work cannot fix this bottleneck.
- **The identical-key repaint skip (`d269afba`) is not enough.** It misses the per-frame repaints during edge pans, because the coverage changes slightly every frame while it stays at the image edge.
- **`2d22784d` (Q1 control) is not runnable** against any `quackles-assets` revision (missing DZI levels). Use `cd62cd66`.
