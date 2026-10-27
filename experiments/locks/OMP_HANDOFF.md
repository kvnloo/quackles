# Quackles GP performance target lock — mandatory per iteration

The user's primary experiment is **the existing gigapixel performance branches**, not main/nightly or the Blue 201MP repaint/cache candidates. Test these pinned branches in physical Chrome on the Galaxy S25 Ultra:

- preview/gigapixel-single — GP control
- preview/gp-motion-decode — motion decode
- preview/gp-net6 — network concurrency
- preview/gp-settle — settle policy
- preview/gp-all — combined scheduling
- preview/rfc-002-refine — async refinement

For EVERY iteration choose the control and one named challenger. Fetch exact remote heads and run the existing lab harness with BOTH explicit --refs and --target-lock. This is a fail-closed invariant; absence of a requested candidate is not permission to substitute a checkout.

Example on the lock branch, with a verified CDP endpoint and prepared asset checkout:

```bash
node scripts/lab/run.mjs \
  --target-lock experiments/locks/gigapixel-performance.json \
  --refs preview/gigapixel-single,preview/gp-motion-decode \
  --profiles physical --modes A --balanced --trials 6 \
  --cdp http://127.0.0.1:9222 \
  --tape scripts/lab/tapes/smoke-inspect.json
```

The build/measurement must actually load `preview = gigapixel-single` and same-master `white/p0000000/gp` assets; require tile fetches under `/quackles-assets/white/p0000000/gp/` and pinned `kvnloo/quackles-assets@4c2c52a3941b260f8c16c4b3cfef06029a97430f`. The DZI source dimensions must be 25820×38730, tiles 512. Do not mistake Blue 201MP for this fixture.

**ABORT / INVALID / NOT RUN** on missing explicit refs, missing candidate, changed SHA, wrong/dirty asset checkout, incorrect live preview, absence of expected 1GP tile requests, different source family, bad fixture, or absent Chrome access. NEVER fall back to main, nightly, dev, current worktree, or a 201MP experiment. Do not claim a performance winner from INVALID, FAIL, or NOT RUN receipts. Continue with another named GP candidate or a genuine prerequisite, preserving the locked objective.

Retain physical Chrome/OS/GPU provenance, exact SHA, JSON receipt, visual proof, rAF p95/p99/worst, frames exceeding deadlines, time-to-sharp, network/decode/churn and memory. This branch is for research only; no default-branch merge or production promotion. Credit previous authors in the branch registry and #53.
