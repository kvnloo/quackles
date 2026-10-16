#!/usr/bin/env python3
"""Cooperative branch leases shared by worktrees, not an authorization boundary.
Expired leases still require explicit holder release or owner recovery. No takeover.
"""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import hashlib
import json
from pathlib import Path
import uuid
from agent_gitops import git


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root', type=Path, default=Path('.'))
    p.add_argument('action', choices=['claim', 'show', 'renew', 'release'])
    p.add_argument('branch')
    p.add_argument('--owner')
    p.add_argument('--scope')
    p.add_argument('--lease-id')
    p.add_argument('--hours', type=int, default=24)
    args = p.parse_args()
    if not 1 <= args.hours <= 24:
        p.error('hours must be 1..24')
    git(args.root, 'check-ref-format', 'refs/heads/' + args.branch)
    head = git(args.root, 'rev-parse', '--verify', 'refs/heads/' + args.branch)
    common = Path(git(args.root, 'rev-parse', '--path-format=absolute', '--git-common-dir'))
    directory = common / 'agent-leases'
    directory.mkdir(mode=0o700, exist_ok=True)
    key = hashlib.sha256(args.branch.encode()).hexdigest()
    path = directory / (key + '.json')
    with (directory / (key + '.lock')).open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        old = json.loads(path.read_text()) if path.exists() else None
        now = datetime.now(timezone.utc)
        if args.action == 'show':
            print(json.dumps(old))
            return
        if args.action == 'claim':
            if old:
                p.error('lease already exists (even if expired); inspect and ask holder/owner')
            if not args.owner or not args.scope:
                p.error('claim requires owner and scope')
            data = {'branch': args.branch, 'owner': args.owner, 'scope': args.scope,
                    'base_sha': head, 'lease_id': uuid.uuid4().hex, 'claimed_at': now.isoformat()}
        else:
            if not old or old['lease_id'] != args.lease_id:
                p.error('lease ID mismatch; nothing changed')
            data = old
        data['updated_at'] = now.isoformat()
        data['expires_at'] = (now + timedelta(hours=args.hours)).isoformat()
        if args.action == 'release':
            history = directory / 'history'
            history.mkdir(exist_ok=True)
            data['released_at'] = now.isoformat()
            (history / (data['lease_id'] + '.json')).write_text(json.dumps(data, indent=2) + '\n')
            path.unlink()
        else:
            temp = path.with_suffix('.new')
            temp.write_text(json.dumps(data, indent=2) + '\n')
            temp.replace(path)
        print(json.dumps(data))

if __name__ == '__main__':
    main()
