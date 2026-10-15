#!/usr/bin/env python3
"""Local, stdlib-only inventory. Never fetches, pushes, prunes or deletes refs.
Snapshot is intentionally machine-specific; check without --live is portable CI.
"""
from __future__ import annotations
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess

STATUSES = {'active', 'channel', 'integrated', 'stale', 'archive'}
FIELDS = {'ref', 'branch', 'head', 'purpose', 'owner_lane', 'base', 'status',
          'channel', 'preview_slot', 'merge_target', 'evidence_links', 'reason'}

def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()

def refs(root):
    lines = git(root, 'for-each-ref', '--format=%(refname)\t%(objectname)\t%(symref)', 'refs/heads', 'refs/remotes').splitlines()
    return {p[0]: {'head': p[1], 'symbolic_target': p[2] if len(p) > 2 else ''}
            for line in lines if (p := line.split('\t'))}

def worktrees(root):
    result = []
    for block in git(root, 'worktree', 'list', '--porcelain').split('\n\n'):
        fields: dict[str, str] = {}
        for line in block.splitlines():
            key, _, value = line.partition(' ')
            fields[key] = value or 'true'
        path = fields.pop('worktree')
        result.append({'id': hashlib.sha256(path.encode()).hexdigest()[:16],
                       'label': Path(path).name, 'head': fields['HEAD'],
                       'ref': fields.get('branch'), 'present': Path(path).is_dir(),
                       'locked': bool(fields.get('locked')), 'prunable': bool(fields.get('prunable'))})
    return sorted(result, key=lambda w: w['id'])

def ancestor(root, head, target):
    p = subprocess.run(['git', '-C', str(root), 'merge-base', '--is-ancestor', head, target], capture_output=True)
    if p.returncode not in (0, 1):
        raise ValueError(p.stderr.decode())
    return p.returncode == 0

def classify(root, ref, head, target):
    branch = ref.removeprefix('refs/heads/').removeprefix('refs/remotes/')
    logical = branch.split('/', 1)[1] if ref.startswith('refs/remotes/') else branch
    if branch.startswith('hist/'):
        return 'archive', 'Historical evidence namespace; preserve until restore-tested archive and owner approval.'
    if logical in {'main', 'main-v0', 'dev', 'nightly', 'preview', 'HEAD'} or logical.startswith('integ/'):
        return 'channel', 'Promotion/control channel; not an automatic merge authorization.'
    if ancestor(root, head, target):
        return 'integrated', 'Tip is an ancestor of the recorded integration target; dirty worktrees still need preservation.'
    if logical.startswith(('feat/', 'perf/', 'chore/agentic-', 'preview/gp-', 'preview/scroll-', 'preview/scenes-', 'preview/touch-pan', 'fix/i5-')):
        return 'active', 'Retained feature/performance lane; readiness and owner acceptance are separate.'
    return 'stale', 'Unassigned or historical experiment; review proposal only, not permission to delete.'

def owner(branch):
    if 'agentic-gitops' in branch or branch.startswith('integ/'):
        return 'gitops'
    if 'lineage' in branch:
        return 'lineage'
    if 'learning' in branch or 'geo-seo' in branch:
        return 'learning-lab'
    if any(x in branch for x in ('gp-', 'scroll-', 'touch-pan', 'scenes-', 'gigapixel', 'perf/')):
        return 'perf'
    if 'process-blog' in branch:
        return 'process-blog'
    return 'owner-review'

def snapshot(root, base, target):
    base_sha, target_sha = git(root, 'rev-parse', base), git(root, 'rev-parse', target)
    records = []
    for ref, info in sorted(refs(root).items()):
        branch = ref.removeprefix('refs/heads/').removeprefix('refs/remotes/')
        status, reason = classify(root, ref, info['head'], target)
        local = ref.startswith('refs/heads/')
        slot = 'branch-' + hashlib.sha256(ref.encode()).hexdigest()[:12] if local else None
        merge_base = subprocess.run(['git', '-C', str(root), 'merge-base', info['head'], base_sha], capture_output=True, text=True)
        if merge_base.returncode not in (0, 1):
            raise ValueError(merge_base.stderr)
        logical = branch.split('/', 1)[1] if ref.startswith('refs/remotes/') else branch
        held = logical in {'preview/gp-motion-decode', 'preview/gp-all', 'perf/motion-decode-eval'}
        records.append({'ref': ref, 'branch': branch, **info,
                        'purpose': 'Tip intent: ' + git(root, 'show', '-s', '--format=%s', info['head']),
                        'owner_lane': owner(branch), 'base': base_sha,
                        'merge_base_sha': merge_base.stdout.strip() or None,
                        'promotion_hold': 'D6/F7 owner ruling required; comparison only' if held else None,
                        'status': status, 'channel': 'local-integration' if branch.startswith('integ/') else ('preview' if slot else 'evidence'),
                        'preview_slot': slot, 'preview_url': None,
                        'merge_target': target if status == 'active' and not held else None,
                        'evidence_links': ['git:' + info['head']], 'reason': reason})
    trees = worktrees(root)
    by_ref = {b['ref']: b for b in records}
    for tree in trees:
        b = by_ref.get(tree['ref'])
        tree.update(status=b['status'] if b else ('integrated' if ancestor(root, tree['head'], target) else 'archive'),
                    owner_lane=b['owner_lane'] if b else 'owner-review',
                    reason='Registered checkout, not deletion approval. Detached controls remain evidence.',
                    preservation='Inspect staged/unstaged/untracked/ignored material before any removal; no cleanup performed.')
    return {'schema_version': 1, 'captured_at': datetime.now(timezone.utc).isoformat(),
            'base': base, 'base_sha': base_sha, 'target': target, 'target_sha': target_sha,
            'classification_policy': 'Ancestry first; active family is not READY. Archive/stale are proposals only.',
            'branches': records, 'worktrees': trees}

def render(data):
    counts = Counter(b['status'] for b in data['branches'])
    lines = ['# Branch and worktree registry', '', 'Generated by `python3 scripts/agent_gitops.py snapshot`; do not edit this table.', '',
             f"Snapshot: {data['captured_at']}. Base `{data['base']}`; target `{data['target']}` at `{data['target_sha']}`.", '',
             f"{len(data['branches'])} refs (including remote symbolic aliases); {len(data['worktrees'])} registered worktrees. " + ', '.join(f'{k}: {v}' for k,v in sorted(counts.items())), '',
             'Every classification is a preservation/review proposal, never a deletion or merge instruction.',
             'Preview slots are reserved logical identities, not deployed URLs. See [channel policy](docs/agentic-gitops.md).', '',
             '| Ref | Status | Lane | Preview slot | Head |', '|---|---|---|---|---|']
    for b in data['branches']:
        lines.append(f"| `{b['ref']}` | {b['status']} | {b['owner_lane']} | {b['preview_slot'] or '—'} | `{b['head'][:12]}` |")
    lines += ['', '## Worktrees', '', 'Host paths are intentionally omitted. IDs hash registration paths; labels are only basenames.', '',
              '| ID / label | Ref or detached | Status | Present | Head |', '|---|---|---|---|---|']
    for w in data['worktrees']:
        lines.append(f"| `{w['id']}` / {w['label']} | `{w['ref'] or 'detached'}` | {w['status']} | {w['present']} | `{w['head'][:12]}` |")
    return '\n'.join(lines) + '\n'

def check(root, data, live=False):
    if data.get('schema_version') != 1:
        raise ValueError('unsupported schema')
    names, slots = set(), set()
    for b in data['branches']:
        if not FIELDS <= b.keys() or b['status'] not in STATUSES or b['ref'] in names:
            raise ValueError('invalid or duplicate branch record')
        if (len(b['head']) != 40 or any(c not in '0123456789abcdef' for c in b['head'])
                or not b['evidence_links'] or not b['purpose'] or not b['owner_lane']):
            raise ValueError('invalid SHA or missing ownership/evidence')
        names.add(b['ref'])
        if b['preview_slot']:
            if b['preview_slot'] in slots:
                raise ValueError('duplicate preview slot')
            slots.add(b['preview_slot'])
    ids = [w['id'] for w in data['worktrees']]
    if len(ids) != len(set(ids)) or any(w['status'] not in STATUSES for w in data['worktrees']):
        raise ValueError('invalid or duplicate worktree')
    if (root / 'BRANCHES.md').read_text() != render(data):
        raise ValueError('BRANCHES.md drift; render from registry')
    if live:
        if names != set(refs(root)):
            raise ValueError('live ref coverage drift; regenerate snapshot')
        live_trees = {w['id']: w['ref'] for w in worktrees(root)}
        if {w['id']: w['ref'] for w in data['worktrees']} != live_trees:
            raise ValueError('live worktree coverage/binding drift; regenerate snapshot')
    return {'refs': len(names), 'worktrees': len(ids), 'live_coverage': live,
            'head_policy': 'recorded snapshot; moving tips do not invalidate identity coverage'}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    sub = parser.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('snapshot')
    s.add_argument('--base', default='integ/home-2026-10-13')
    s.add_argument('--target', default='integ/site-2026-10-15')
    c = sub.add_parser('check')
    c.add_argument('--live', action='store_true')
    sub.add_parser('render')
    args = parser.parse_args()
    root = args.root.resolve()
    path = root / '.agents/branches.json'
    if args.cmd == 'snapshot':
        data = snapshot(root, args.base, args.target)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + '\n')
        (root / 'BRANCHES.md').write_text(render(data))
        print(json.dumps(check(root, data, live=True)))
    else:
        data = json.loads(path.read_text())
        if args.cmd == 'render':
            (root / 'BRANCHES.md').write_text(render(data))
        else:
            print(json.dumps(check(root, data, args.live)))

if __name__ == '__main__':
    main()
