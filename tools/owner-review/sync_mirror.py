#!/usr/bin/env python3
"""Synchronize the public owner-review source into an existing dream-loop tree."""
import argparse
from pathlib import Path
import shutil

FILES = (
    'owner_rating.py', 'owner-rating.js', 'owner-rating.css', 'owner-rating.html',
    'meta_loop.py', 'live_rating.py', 'catalog.py', 'trial_schema.py', 'synthetic_fixture.py',
    'chat_backfill.test.py', 'chat_ui.test.py', 'runtime_port.test.py',
    'launch_owner_review.test.py', 'owner-review.browser.mjs', 'meta_loop.test.py', 'live_rating.test.py',
)
SCHEMAS = ('rounds.schema.json', 'meta-trial.schema.json')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mirror', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--check', action='store_true')
    mode.add_argument('--write', action='store_true')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    mirror = args.mirror.resolve()
    if not (mirror/'scripts').is_dir() or not (mirror/'templates').is_dir():
        parser.error('Expected existing dream-loop scripts and templates directories')
    pairs = [(source/name,mirror/'scripts'/name) for name in FILES]
    pairs += [(source/'schemas'/name,mirror/'templates'/name) for name in SCHEMAS]
    drift = []
    for original, destination in pairs:
        if args.write:
            shutil.copyfile(original,destination)
        elif not destination.is_file() or destination.read_bytes() != original.read_bytes():
            drift.append(str(destination.relative_to(mirror)))
    if drift:
        parser.exit(1,'Mirror drift: '+', '.join(drift)+'\n')
    print(('Synchronized' if args.write else 'Identical')+f': {len(pairs)} files')


if __name__=='__main__': main()
