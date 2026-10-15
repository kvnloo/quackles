#!/usr/bin/env python3
"""Compute public-safe, explicitly labelled Git velocity proxies; stdlib only."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import statistics
from agent_gitops import git, refs, worktrees


def distribution(values):
    if not values:
        return {'samples': 0, 'median': None, 'min': None, 'max': None}
    return {'samples': len(values), 'median': round(statistics.median(values), 3),
            'min': round(min(values), 3), 'max': round(max(values), 3)}


def measure(root):
    now = datetime.now(timezone.utc)
    rows = [line.split('\t', 3) for line in git(root, 'log', '--all', '--format=%H\t%ct\t%P\t%s').splitlines()]
    merges = [row for row in rows if len(row[2].split()) > 1]
    times = [int(row[1]) for row in rows]
    span_days = max((max(times) - min(times)) / 86400, 1)
    lead, excluded = [], 0
    for sha, ts, parents, _ in merges:
        parent = parents.split()
        # Exclude first parent's reachable history; second-parent additions only.
        added = git(root, 'log', '--format=%ct', parent[1], '--not', parent[0]).splitlines()
        if not added:
            excluded += 1
            continue
        duration = (int(ts) - min(map(int, added))) / 3600
        if duration < 0:
            excluded += 1
        else:
            lead.append(duration)
    live_refs = refs(root)
    local = {name: value for name, value in live_refs.items() if name.startswith('refs/heads/')}
    ages = [(now.timestamp() - int(git(root, 'show', '-s', '--format=%ct', r))) / 86400 for r in local]
    trees = worktrees(root)
    by_day = Counter(datetime.fromtimestamp(int(r[1]), timezone.utc).date().isoformat() for r in merges)
    rework = sum(bool(re.match(r'^(fix(?:\([^)]*\))?:|revert\b|Revert\b)', r[3])) for r in rows)
    return {'schema_version': 1, 'captured_at': now.isoformat(),
            'scope': 'Unique commits reachable from all local refs/tags; no GitHub API or private identities.',
            'commit_count': len(rows), 'merge_count': len(merges),
            'history_span_days': round(span_days, 3),
            'merge_frequency_per_history_day': round(len(merges) / span_days, 3),
            'merges_by_utc_day': dict(sorted(by_day.items())),
            'lead_time_proxy_hours': distribution(lead), 'lead_time_excluded_merges': excluded,
            'lead_time_definition': 'Merge committer time minus earliest second-parent commit time not reachable from first parent. Not issue-to-production lead time; octopus merges use only second parent.',
            'branch_tip_idle_days': distribution(ages),
            'branch_age_limitation': 'Git does not retain portable branch creation dates. Tip idle age is not branch age.',
            'local_branches': len(local), 'all_branch_refs': len(live_refs),
            'worktrees': len(trees), 'detached_worktrees': sum(not t['ref'] for t in trees),
            'missing_worktrees': sum(not t['present'] for t in trees),
            'distinct_worktree_heads': len({t['head'] for t in trees}),
            'rework_subject_proxy_count': rework,
            'rework_subject_proxy_percent': round(rework / len(rows) * 100, 3),
            'rework_limitation': 'fix:/fix(scope):/Revert subject count is a naming proxy, not defect rate or wasted effort.',
            'limitations': ['Local and historical refs overrepresent experiments.', 'Clock skew and rewritten history can bias durations.',
                           'No before/after velocity causal claim; no deployment or issue timestamps available.']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path('.'))
    p.add_argument('--output', type=Path)
    args = p.parse_args()
    text = json.dumps(measure(args.root), indent=2) + '\n'
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    print(text, end='')

if __name__ == '__main__':
    main()
