# Agentic GitOps: one lane, one change, one receipt

## Authority and channels

This site program is an explicitly assigned local-only extension of the Verified OSS Loop, not a replacement claim bot. `.agents/channels.json` records its base, merge order, holds and authority. Generic autodevelop still reads `.verified-oss-loop/rollout.yml`/`rollout.py` (currently rolling: nightly → preview/nightly). **Do not interpret that generic default as permission to publish this program.** The task's explicit local-only scope wins. No fetch, push, PR, nightly update or protected-branch merge is part of this assignment.

```
feature / existing performance channel
                  ↓ exact READY SHA + full verification
          integ/site-<date> (GitOps-owned local integration)
                  ↓ owner-reviewed PR
                 dev
                  ↓ owner phone + visual acceptance, owner-reviewed PR
                 main
```

Nightly is a separately approved snapshot, not a worker's scratch branch. Workers never merge `dev` or `main`. Only the owner authorizes publishing, PR creation and promotion. Existing automerge-nightly follows its rollout gate; it must not receive this program until the owner approves.

## Start, claim, focus

1. Read `AGENTS.md`, `.agents/START-HERE.md`, the task, and only the relevant area context.
2. Inspect `git status --short`, `git branch --show-current`, `git worktree list --porcelain`; do not move somebody else's checkout.
3. Use the assigned branch and base. One writer per branch; feature tuning stays in that feature/performance channel. An integration checkout is not a place to fix source conflicts.
4. Claim with `python3 scripts/branch_lease.py claim <branch> --owner <lane/session> --scope '<bounded task>'`. Copy the returned lease ID to your private task notes. This creates a lease in the **shared Git common directory**, not the per-worktree `.git` file. A versioned lease file would diverge across branches and is therefore not the lock.
5. Renew with `python3 scripts/branch_lease.py renew <branch> --lease-id <id>`; release with `... release ...`. Leases last at most 24h. `show <branch>` reads ownership. Expiry is a stop/review signal, **never permission to steal**. Owner recovery preserves the old lease and checks live processes/dirty state first. `flock` serializes updates across all local worktrees; this is cooperative coordination, not same-UID security or a distributed lock.
6. Put acceptance, non-goals, owned paths, protected paths and exact verification commands in `.agents/TASK.md` format. Never commit private lease tokens, host paths or raw session transcripts.

## Merge protocol

- Site order: process blog → perf READY branches one at a time in the perf lane's stated dependency order → lineage → learning → GEO → GitOps last. Require full branch SHA, base, owner, tests, perf command/results and evidence links. Never merge a moving name without comparing its tip with READY. A SHA named in READY is a candidate, not acceptance.
- `gp-net6` and `gp-settle` are composable independent concerns already in the home base. `gp-motion-decode` and the union `gp-all` remain held for D6/F7. Scroll experiments remain isolated, not silently reintroduced into zoom-and-colour-only home.
- Private unpublished single-writer features may rebase **before** sealing READY, with explicit lane agreement. Published/shared/evidence-pinned branches and integration channels use merges; never rebase, force-push, squash away or rewrite accepted evidence. A new head invalidates prior verification. Integrate with `--no-ff --no-commit`; commit only after gates pass. Preserve both parents and the tested tree ID in the receipt.
- Only GitOps writes the integration branch, under its lease. On conflict: record files and SHAs, abort the candidate merge; owning lanes resolve on their branches and issue new READY. No `ours`/`theirs` blanket resolution. Cross-area conflicts need both owners; shared `package.json`, layout and globals changes retain both contracts.
- On any failing gate, stop that candidate, preserve logs, abort the uncommitted merge and write the lane's `BLOCKED.md`. Do not weaken assertions, label it pre-existing without a matched baseline, or promote a red result. Dependencies remain blocked; independent lanes may continue only with explicit coordinator agreement.
- Required per-candidate proof: `npm test`, `npm run typecheck`, static `npm run build`, `PREVIEW_EXPECT=home node --import ./scripts/register-ts-resolve.mjs scripts/preview-config-contracts.mjs`, request-budget, gigapixel-engine, cleanup contracts, and the perf lane's documented runtime harness. Tests must exercise the merged tree, not just the lane head. Record command, exit, environment, base/input/tree/result SHAs and raw evidence location. A post-commit build uses the resulting commit SHA for the served build identity.
- Physical 120 Hz phone acceptance is a separate owner gate. Browser emulation, function budgets and a fast workstation do not prove device input latency or refresh-rate delivery. Mutation coverage is `n/a` unless actual tooling is added.

## Registry and preview slots

`.agents/branches.json` is a public-safe snapshot of **all** local and remote-tracking refs, including symbolic aliases, plus every registered worktree (detached and missing included). `BRANCHES.md` is generated. Exact host paths remain in private audit evidence; a worktree ID hashes its registration path and the display label is a basename.

```
python3 scripts/agent_gitops.py snapshot
python3 scripts/agent_gitops.py check --live
python3 scripts/agent_gitops.py check
```

Snapshot checks the live `for-each-ref` equivalent of `git branch -a` and `git worktree list --porcelain`; `--live` validates exhaustive identity coverage, not frozen tip equality. Tips in the file are explicitly time-stamped observations: ongoing work and the commit containing the snapshot necessarily move them. Compare READY tips separately at admission. CI uses the portable schema/render check because a hosted clone cannot reproduce private worktrees or local-only refs. To change policy metadata, change the generator then regenerate; never hand-edit the rendered table.

Status meanings: **active** = retained feature lane, not ready; **channel** = promotion/control; **integrated** = exact tip ancestor of snapshot target, not equivalent patches or dirty files; **stale** = unassigned review proposal; **archive** = retained historic/detached evidence. Branch base fields are the selected comparison base, not invented branch-creation provenance. Owners inferred from branch families are routing suggestions; `owner-review` means unassigned. Every record links its exact Git object. No entry authorizes cleanup.

Each local branch keeps a unique stable `preview_slot`, including after integration. `preview_url: null` deliberately means **not deployed**. Reserving a slot is not a claim that a port or alias is live. Before serving, claim a loopback port, bind without killing another listener, build the exact branch SHA, verify HTTP + build identity, and record URL/SHA/preview ID. `lib/preview.ts` remains the runtime source of scene/story/zoom configuration. Build/deployment alias and runtime preview ID are different dimensions.

The legacy sibling `update-previews.sh` fetches, switches a shared checkout and pushes: **do not run it for local-only work**. Legacy `slot.sh` is a machine-wide build/browser limiter, not branch ownership. The sibling `serve-*` entries are host preview directories, not portable repo contracts; inspect the serving process and target before use and never replace another live preview. Use a common resource limit across lanes; worktrees isolate Git edits, not CPU/GPU contention. Prefer local private cache/scratch paths for logs and locks.

## CI and nightly design

`agentic-gates.yml` runs the same unit/type/contract/budget/static-build checks on both the exact PR head and GitHub's synthetic merge ref. It is read-only, has no deploy permissions, uploads logs even on failure and never auto-merges. Schema tests run against disposable Git fixtures; live inventory is a local gate. The owner must enable these required checks in branch protection; adding a workflow does not configure GitHub protection.

Existing `verify.yml` is retained. Its browser job and this new workflow are not physical-phone certification. Runtime perf joins CI once the perf lane supplies a portable harness and its prerequisites; no benchmark success is invented. Hosted workflows have not been executed by this local-only task.

The inspected `origin/main:.github/workflows/pages.yml` is the **single Pages publisher**: root from main, `/nightly/` from nightly, `/preview/<name>/` from preview branches, with a daily `17 5 * * *` schedule. This integration base has `kick-pages.yml`, not `pages.yml`; that is intentional channel layout, not a missing workflow to duplicate. Keep the main publisher and nightly channel. No new deploy workflow or second Pages target is introduced. Legacy unpublished feature slots are not automatically Pages routes; owner-approved preview refs are needed before those URLs exist.

## Preserve-first cleanup

Follow the existing owner audit's CLEANUP-PLAN. Before removing any branch/worktree: capture refs and all staged/unstaged/untracked/ignored candidates; bundle local-only commits; copy unique binary/artifact evidence; hash copied bytes; restore-test the bundle; obtain owner approval. Never remove the canonical object store/main worktree. Missing registrations and duplicate tip SHAs are not evidence that dirty artifacts are disposable. This task classifies and proposes only; it deletes nothing.
