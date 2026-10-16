#!/usr/bin/env python3
"""Run the synthetic, offline owner-review suite without third-party Python packages."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    root = Path(__file__).resolve().parent
    failed = []
    with tempfile.TemporaryDirectory(prefix='.test-',dir=root) as tmp:
        env = dict(os.environ,TMPDIR=tmp)
        for path in sorted(root.glob('*.test.py')):
            print(path.name,flush=True)
            result = subprocess.run([sys.executable,str(path)],cwd=root,env=env)
            if result.returncode:
                failed.append(path.name)
    print(f'{len(failed)} failed test files')
    raise SystemExit(bool(failed))


if __name__=='__main__': main()
