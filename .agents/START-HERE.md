# Start here (read budget: one task)

1. `AGENTS.md` → explicit task/PROGRAM → `CONTRIBUTING.md`.
2. Confirm branch/base/cleanliness. `.agents/channels.json` is the assigned local site's override; generic unattended rollout remains separate.
3. Read `BRANCHES.md` for ownership/routing; validate live inventory before treating it as current. Claim the assigned branch using `scripts/branch_lease.py`; no takeover on expiry.
4. Pick only one context: [site](context/site.md), [engine](context/engine.md), [content/data](context/content.md), [GitOps](context/gitops.md), [assets](context/assets.md).
5. Write task acceptance and red/green proof using [TASK](TASK.md). Do not absorb adjacent roadmap work.
6. Commit on your lane, send exact READY SHA and commands. GitOps re-tests the merge; owner controls publication and dev/main.

Stop if the branch is leased elsewhere, the base changed, a dependency is missing, the task needs secrets/publication, or an owner-locked product rule would change. Report the blocker with evidence rather than widening scope.
