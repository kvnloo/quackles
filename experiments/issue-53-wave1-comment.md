<!-- Ready to post on https://github.com/kvnloo/quackles/issues/53. Posting from the lab session was refused (403 Resource not accessible by integration). -->
## Quackles Lab: W0 decomposition + Wave 1 (detail repaint loop)

Harness, receipt summaries and candidate patches are on `claude/deterministic-benchmarks-pr1-870e75` under `experiments/` and `scripts/lab/`. To reproduce a candidate's exact SHA, apply its patch from `experiments/candidates/` to `71c9813a` with `git am --committer-date-is-author-date`.

### Caveats for every number

- **Host:** a 4-vCPU cloud VM, headless Chromium 141, **SwiftShader (no GPU)**.
- **Fixture:** Blue 201 MP `p0000000` (master `sha256:f8741314…`), assets `4c2c52a3`, served over loopback with external hosts blocked.
- **Viewport:** desktop 1440×1000 at DPR 2, app profile `balanced`, 64 MiB decoded budget.
- **Evidence status:** this is **not** phone evidence. Software canvas inflates the cost of each synchronous paint. The direction of a work-removal result should carry over to real hardware; the size in ms will not.
- **Statistics:** trials are paired by trial number, with seeded random order of refs and modes per trial. I report the median paired difference, a bootstrap 95% CI, and the incumbent's MAD. A result is "beyond noise" when the CI excludes 0 and |median diff| > MAD.

### W0: what makes a frame miss? (nightly `71c9813a`, 7 trials per mode)

| mode | frames >50 ms | rAF p99 | decodes / pass | long frames containing a detail paint |
|---|---|---|---|---|
| A normal, cold | 48 | 150 ms | 601 | 48/48 |
| B compressed cache warm, asset network blocked | 51 | 152 ms | 603 | 51/51 |
| C decoded cache warm, same 64 MiB budget | 50 | 156 ms | 594 | 50/50 |
| D painted surface, camera-only replay (diagnostic) | **0** | 23 ms | 0 | — |

- **Not the network, cold decode or compositing.** Warm caches don't help frame pacing, and D has no long frames even on SwiftShader.
- **The cause is the synchronous `paintDetail` full-canvas redraw.** Every long frame contains one, at about 90–100 ms each, roughly 50 per tape and half of them at rest. Long Animation Frame entries put about 5 s of script per pass in `SequencePlayer.render`.
- **Preparation cost** (for B, C and D) is recorded separately: about 24 s, about 230 requests and about 630 decodes per prep pass.

### Wave 1: the detail escape test repaints forever

- **Mechanism.** `cropInside(crop, paintedCoverage, 12% inset)` requires an inset on every side. Coverage is clamped to the image, so the test can never pass below about 1.32× or with a crop on an image edge. Each `render()` then repaints the same coverage and tiles. A trace at rest at 1.19× shows 22 back-to-back repaints of about 100 ms each.
- **Contenders:**
  - incumbent: `nightly`;
  - simplest alternative: `d269afba` (skip a repaint whose key is identical);
  - challenger: `6f2ef5d2` (no inset on coverage sides already on the image edge, plus `scripts/detail-escape-contracts.mjs`, written to fail first).

| tape (paired trials) | mode | frames >50 ms nightly → challenger | rAF p99 | time to sharp |
|---|---|---|---|---|
| smoke (7) | A | 47 → 6 (CI [−43, −37]) | 162 → 32 ms | n.s. |
| unseen edge/wheel (10) | C | 73 → 9 (CI [−68, −62]) | 350 → 35 ms | n/a for every build (target not reached within the window) |
| held-out mid-zoom (10) | C | 50 → 31 | 208 → 98 ms | **−1.15 s** (CI [−1.20, −1.07]) |

- **Visual:** four settled states (sharp tier painted and 1.5 s without a paint) are **pixel-identical to nightly (maxDiff 0)** for both candidates.
- **Memory:** the decoded peak is at the budget, and there were 0 blank polls.

### Verdicts

- **`6f2ef5d2`: KEEP as the lab candidate. Not for promotion.**
  - A **known cost**: decodes per pass rise 27–34% (up to about 5× on one unseen pass) because the freed main thread lets the at-rest decode/evict loop spin faster.
  - A known residual: an at-rest repaint loop when the budget forces coverage == crop.
- **`d269afba`: REJECT.** It is dominated on the unseen tape, because it still repaints every frame while panning along an edge.
- **`93821ef5`** (W1b: cap the inset by per-side paint slack): **REJECT.** At-rest paints drop from 20 to 2, but paints in motion rise from 11 to 22, p99 rises by 42–57 ms, max frame by about 77 ms, and time to sharp by 159 ms.

### Next highest-value test: Q1, the at-rest decode/evict loop

`FrameCache.room()` evicts still-retained entries in LRU order, whatever the job's priority. At rest, the retained set (detail tiles plus six 6 MiB prefetch plates) is larger than 64 MiB, so the plates evict one another forever. A probe at rest showed 660 decodes in 20 s with zero network.

The plan:
- **Hypothesis:** priority-aware admission ends the loop without slowing time to sharp.
- **Gates:** time to sharp, frames >50 ms, the budget, and **story-scroll smoothness** (adjacent-frame plates exist for scrolling).

After that:
- a GPU host;
- a physical Android phone with a blind A/B feel review, which is required before any promotion.

`nightly` and every experiment branch are untouched. Candidates live on local `lab/53-*` branches; their patches are in `experiments/candidates/`. The full research log and queue are in `experiments/RESEARCH.md`. Prior Quackles branches and findings keep their original credit (see `experiments/branches.json`).

---
_Generated by [Claude Code](https://claude.ai/code)_
