# GitOps

Look: `.agents/channels.json`, `docs/agentic-gitops.md`, `.verified-oss-loop/`, `.github/`, `scripts/agent_gitops.py`, `scripts/branch_lease.py`.
Run: `python3 -m unittest discover -s scripts -p test_agent_gitops.py -v`, `python3 scripts/agent_gitops.py check --live`, `git diff --check`; integration commands in channel policy.
Protect: no push/PR/main/dev merge in this program; no ref/worktree pruning. Keep Pages single-publisher architecture. Registry statuses are proposals, not cleanup authorization. Integration sole-writer lease is shared in Git common dir.
