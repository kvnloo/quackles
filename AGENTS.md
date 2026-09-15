<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Notes for agents — quackles

You are a contributor, not a maintainer. Workers open PRs. They never merge `main` or `dev`.

This project follows the [Verified OSS Loop](https://github.com/kvnloo/verified-oss-loop). Issues are not claims. AI work is untrusted until proven.

Remotes: `github` is [kvnloo/quackles](https://github.com/kvnloo/quackles). `origin` is the Cursor clone. Fetch both. Use `gh -R kvnloo/quackles`. Do not push to `nightly-pages` / [kvnloo/quackles-nightly](https://github.com/kvnloo/quackles-nightly) unless a human asked.

## First 60 seconds

1. Read this file, then `CONTRIBUTING.md`.
2. `git fetch github && git fetch origin`. `python3 .verified-oss-loop/rollout.py show`. Branch from `github/$(python3 .verified-oss-loop/rollout.py get worker_base)` unless the issue names another base. Day-pass PRs target `feature_target`. Overnight unattended PRs target `overnight_target`. See `.verified-oss-loop/rollout.yml`.
3. Search open issues and PRs. Do not duplicate in-flight work.
4. Orient (`skills/orient/SKILL.md`). If GitNexus MCP is already there: `query` → `context` → `impact`. Do not run `gitnexus analyze` unless a human asked. Else Serena symbols, else `rg` + read.

```bash
gh issue list -R kvnloo/quackles --label claimable --state open
gh pr list -R kvnloo/quackles --state open
```

## Pick and claim

Take **one** open issue labeled `claimable` and not `claimed`. Prefer `priority:P0`, then `P1`, then `good-first-issue`. Skip `needs-discussion` unless a human assigned it.

If nothing is `claimable`: do not code. **Triage** — if a `needs-discussion` issue exists: one-paragraph proposal on the newest; stop. If none: mint **exactly one** issue from the first untracked item in `ROADMAP.md`, else a failing unit command from `AGENTS.md`, else docs drift; label **`needs-discussion` only**; stop. Do not self-apply `claimable`. Do not rewrite `ROADMAP.md`. **Stop** if triage found nothing untracked, a live claim exists, a competing PR covers the scope, or secrets are required. Comment the blocker only if an issue thread exists. Do not open a consolation PR.

Claim comment (24h lease unless the project says otherwise):

```text
claiming for autodevelop
claimant: <github login or agent id>
base: <git rev-parse github/$(python3 .verified-oss-loop/rollout.py get worker_base)>
expires: <now + 24h UTC>
scope: <one sentence>
```

Then add `claimed` and remove `claimable`. If a claim newer than 24h exists, pick a different issue.

## Proof

Commands were filled by `oss-onboard` from the tree it saw. Do not invent a mutation score if mutation is `n/a`.

| Layer | Command |
|---|---|
| Unit | `npm test` |
| Mutation | `n/a` — no Stryker config in this tree |
| Runtime | `npm run test:scroll` |

1. Name the intended vs current behavior.
2. Fail, then pass (see `skills/tdd/SKILL.md`).
3. Keep the smallest complete change (`skills/anti-slop/SKILL.md`).
4. Run unit tests on the touched surface.
5. If mutation is not `n/a`, run it on the contract you changed. A surviving mutant is a missing assertion.
6. Open a PR at `feature_target` (or `overnight_target` if unattended overnight). Fill `.github/PULL_REQUEST_TEMPLATE.md`. Never merge `main` or `dev`. Do not merge preview/nightly yourself; automerge may, when `rollout.yml` allows.
7. If the project runs an independent review bot (Greptile, CodeRabbit, Bugbot, Copilot, …), treat its comments as review, not merge. Fix real findings. Do not wait for a bot to approve itself.

## Nightly snapshots

After each working commit, update and push `nightly` (the name is `nightly`, not a `cursor/` prefix) so progress is visible on both remotes:

```bash
git push origin nightly && git push github nightly
```

GitHub Pages for this repo deploys from `nightly` via `.github/workflows/pages.yml`. Do not delete that workflow. Do not retarget it at [kvnloo/quackles-nightly](https://github.com/kvnloo/quackles-nightly).

## Do not

- Commit secrets, tokens, `.env`, or pairing files.
- Merge `main` or `dev`.
- Redefine the roadmap.
- Claim mutation coverage that the stack cannot run.
- Overwrite `LICENSE`.
- Duplicate `AGENTS.md` into `CLAUDE.md` / `GEMINI.md` / copilot-instructions.
- Run `gitnexus analyze` as a side effect of a claim.
- Dump the pstack plugin or Dr Eggbot marketplace pack into this tree. Pointers: `skills/pstack/SKILL.md`, `skills/dr-eggbot/SKILL.md`.
