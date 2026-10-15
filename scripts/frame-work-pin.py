#!/usr/bin/env python3
"""Pin only the owned harness/browser descendants; never touch other jobs."""
import json
import os
from pathlib import Path
import sys
import time


def choose(loads, cores, count):
    selected, physical = [], set()
    for _, cpu in sorted(loads):
        if cores[cpu] not in physical:
            selected.append(cpu)
            physical.add(cores[cpu])
        if len(selected) == count:
            break
    return sorted(selected)


def sample():
    return {int(p[0][3:]): list(map(int, p[1:]))
            for line in Path('/proc/stat').read_text().splitlines()
            if (p := line.split()) and p[0].startswith('cpu') and p[0][3:].isdigit()}


def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/frame-work-pin.py variants.json')
    a = sample()
    time.sleep(2)
    b = sample()
    loads = [(1 - ((b[c][3] + b[c][4]) - (a[c][3] + a[c][4])) / max(1, sum(b[c]) - sum(a[c])), c)
             for c in os.sched_getaffinity(0)]
    cores = {c: (Path(f'/sys/devices/system/cpu/cpu{c}/topology/physical_package_id').read_text().strip(),
                 Path(f'/sys/devices/system/cpu/cpu{c}/topology/core_id').read_text().strip())
             for _, c in loads}
    selected = choose(loads, cores, 4)
    out = Path(os.environ.get('ARTIFACTS', str(Path(os.environ.get('TMPDIR', '.')) / 'frame-work-v2')))
    out.mkdir(parents=True, exist_ok=True)
    receipt = {'loads': loads, 'selected': selected, 'loadavg': Path('/proc/loadavg').read_text().strip()}
    (out / 'pin.json').write_text(json.dumps(receipt, indent=2) + '\n')
    cpus = ','.join(map(str, selected))
    os.environ['FRAME_WORK_PIN'] = cpus
    os.sched_setaffinity(0, selected)
    os.execvp('node', ['node', 'scripts/frame-work-browser.mjs', sys.argv[1]])


if __name__ == '__main__':
    main()
