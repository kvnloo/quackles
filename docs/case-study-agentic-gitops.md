# Quackles: organising agentic work without losing the experiment

Quackles is a useful GitOps case study because the hard part is not creating another branch. It is knowing which experiment a branch represents, whether its evidence still applies, and whether a local success is allowed to reach the product.

This is an implementation and measurement report, **not a claim that the workflow is perfected or that it has already improved delivery speed**. The repository is still an active multi-lane experiment. The design below makes that uncertainty visible rather than replacing it with a green status.

## The problem in the history

Three Git objects show why a branch is a useful unit of thought:

- `c98a8cd0292257c9b697a9add48b18548ec88896`: the owner narrowed home to zoom and colour. The commit records all five themes, `story: false`, production zoom policy, 13 home contracts and browser-emulated proof. That does not erase the scroll experiments; it changes their promotion relevance.
- `671c774cba5fda1ed9b0c1bf2257bf164c7c3360`: the `gp-net6` branch had to separate fetch and decode counters in its browser contracts. The previous test counted unlike resources together. A performance claim needs the right measurement model, not merely more tests.
- `5f90a4108e5b852f7826a2d48eadfcb553220569`: motion-decode explicitly conflicts with owner rule D6/F7. Combining it into `gp-all` cannot resolve that policy conflict. Green component tests are not owner approval.

The private audit and project trace also motivated preserve-first cleanup and a single integration owner. They are inputs to the design, not published raw transcripts. This document exposes only public-safe Git references and aggregate measurements.

## A short context path instead of a large agent prompt

An agent begins with its explicit assignment, `.agents/START-HERE.md` and one area context. It sees the owning lane, branch/base, files it may change, acceptance, commands to run and conditions that require stopping. `.agents/TASK.md` and the issue/PR templates carry those fields to the next reader.

The root `AGENTS.md` edit was blocked by the environment's protected-file guard in this task and remains unchanged. It still contains older automatic-nightly language; the explicit local-only owner assignment overrides that language for this program. The owner must authorize a root-contract update before treating the context cleanup as fully complete. New guidance is in `CONTRIBUTING.md`, `.agents/` and `docs/agentic-gitops.md`; this limitation is not hidden behind a completion checkmark.

## Branches retain meaning; integration carries responsibility

The route is feature or existing performance channel → `integ/site-<date>` → owner-reviewed dev PR → owner-reviewed main PR. A worker tunes one feature, not a growing pile of unrelated fixes. GitOps is the sole writer of the integration branch and admits exact READY SHAs in dependency order.

The branch registry is executable documentation: JSON plus a deterministic Markdown renderer and a live coverage validator. It includes remote-tracking aliases, detached controls and registered worktrees, not just the currently checked-out feature. Integrated means ancestry of the recorded tip, not proof that dirty artifacts or equivalent cherry-picked changes are safe to delete. Statuses are proposals. No branches or worktrees were deleted by this work.

Branch leases live in the common Git directory, where every worktree sees the same file and `flock` serializes claims. A versioned lease inside each branch would create competing truths. Even an expired lease cannot be silently stolen. This is coordination among cooperative agents, not a security mechanism.

Preview identity also needs two fields: the runtime scenario in `lib/preview.ts` and the branch/build channel. A deterministic logical slot reserves identity without pretending a URL exists. A served URL needs an exact SHA and an HTTP/build-identity check. The existing main-owned Pages publisher remains the only publisher; adding another deploy job would create authority ambiguity, not velocity.

## Verification belongs at the intersection

Before committing each candidate merge, run lint/unit contracts, typecheck, static build, home configuration, request/memory budgets and the perf lane's runtime harness on the **merged tree**. A branch's own evidence is necessary but insufficient: ordering can invalidate a previously sensible budget.

The new PR workflow checks both the submitted head and the synthetic merge ref, uploads logs and has read-only permissions. The owner still needs to enable required checks in branch protection, and hosted CI has not been run by this local-only assignment. Tests on a desktop or emulated phone do not certify physical 120 Hz responsiveness. Device and visual acceptance remain separate owner gates.

When a gate fails, preserve the failed attempt, abort the candidate merge and return the issue to the owning lane. This reduces integration guesswork: the coordinator does not silently rewrite another lane's feature or relabel a red measurement.

## Measured baseline, not a productivity score

Generated by `python3 scripts/gitops_metrics.py --output .agents/metrics.json`, snapshot **2026-10-15T18:57:48.275742+00:00**. See the machine-readable file for definitions and the complete UTC merge histogram. Ongoing lanes can change current counts; these numbers describe that frozen observation.

| Metric | Observed | What it actually measures |
|---|---:|---|
| Reachable unique commits | 600 | All local refs/tags, including retained historical experiments |
| Merge commits | 24 | Git merges, not releases or completed issues |
| Observed history span | 31.129 days | Max minus min committer timestamp |
| Merge frequency | 0.771/day | Merge count divided by observed history span |
| Merge lead-time proxy, median | 1.250 hours | Merge time minus earliest newly introduced second-parent commit |
| Lead-time proxy range | 0.019–116.605 hours | 24 eligible merge samples; not issue-to-production lead time |
| Local branches | 37 | Local heads only |
| All branch refs | 86 | Local + remote-tracking refs, including symbolic aliases |
| Branch-tip idle age, median | 14.780 days | Time since tip commit, **not** branch creation age |
| Registered worktrees | 82 | Includes detached controls; zero missing paths at this observation |
| Detached worktrees | 53 | Experimental/control checkouts, not automatically waste |
| Distinct worktree heads | 43 | Duplicate heads can still contain different dirty artifacts |
| Fix/revert subject proxy | 125 / 20.833% | Commit-name heuristic, not defect rate or avoidable rework |

Git cannot recover portable branch creation dates or actual engineering start times. No issue/deploy API was consulted. Rebased/cherry-picked history, retained experiments, clock skew and naming conventions bias these proxies. In particular, a short merge interval does not prove a short user-visible delivery cycle. Octopus merges use only the second parent in the lead-time proxy.

## Lessons and the next experiment

1. **Preserve before classifying away.** An integrated tip does not preserve untracked render evidence. Bundle, copy, hash, restore-test, then ask for cleanup approval.
2. **Small context is a routing problem.** A short start page plus owned-area notes is more useful than repeating the whole project history in each agent prompt.
3. **A union branch is not a policy decision.** Record held experiments and their owner decision explicitly.
4. **Separate resource and ownership locks.** A branch lease prevents conflicting writers; build/browser/GPU admission prevents resource contention. Neither substitutes for the other.
5. **Keep provenance through merges.** Merge parents, input SHA, tested tree and command exits are more durable than “tests green” in a chat message.
6. **Measure before claiming speed.** Re-run the same metrics after a comparable period, then add owner-approved issue-open → first-commit → READY → verified-integration → production timestamps. Track integration retry counts and owner-review waiting time separately. Only those observations can test whether narrower lanes actually reduce lead time and rework.

The useful result is not more automation. It is a smaller, explicit decision at each boundary: who owns this branch, what exactly was tested, and who may promote it next.
