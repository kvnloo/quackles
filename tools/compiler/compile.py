#!/usr/bin/env python3
"""compile register|derive|verify|promote|check-manifest  (RFC-001 / #44)

  register ID --theme T --family F --source PNG|CHUNKDIR --recipe R [--blend B] [--edits E] [--renderer JSON] [--sidecar J]
  derive ID plate   (--out FILE --width 1024 | --adopt FILE) [--url U]
  derive ID pyramid (--out DIR [--tile 512 --min-width 1024] | --adopt DIR) [--url U]
  verify ID [--plate FILE] [--pyramid DIR] [--out DIR] [--samples 6]      exit 1 = REFUSE
  promote PROOF.json [--supersede OLD_ID]                                  exit 1 = REFUSE
  check-manifest MANIFEST.json [--policy inspection-source.ts] [--root DIR] [--hidden hidden-pyramids.json]
                                                                           exit 1 = invariant broken

Proofs are JSON (machine) + Markdown (human), written next to each other.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from qcompiler import api  # noqa: E402

DEFAULT_REGISTRY = Path(__file__).resolve().parent / "registry"


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="compile", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--registry", type=Path, default=DEFAULT_REGISTRY)
    sub = ap.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("register")
    r.add_argument("id")
    for k in ("theme", "family", "source", "recipe"):
        r.add_argument(f"--{k}", required=True)
    for k in ("blend", "edits", "sidecar", "notes"):
        r.add_argument(f"--{k}")
    r.add_argument("--renderer", type=json.loads, default=None)

    d = sub.add_parser("derive")
    d.add_argument("id")
    d.add_argument("kind", choices=["plate", "pyramid"])
    g = d.add_mutually_exclusive_group(required=True)
    g.add_argument("--out", type=Path)
    g.add_argument("--adopt", type=Path, help="attach an existing artifact as an unproven claim")
    d.add_argument("--width", type=int, default=1024)
    d.add_argument("--tile", type=int, default=512)
    d.add_argument("--min-width", type=int, default=1024)
    d.add_argument("--url")

    v = sub.add_parser("verify")
    v.add_argument("id")
    v.add_argument("--plate", type=Path)
    v.add_argument("--pyramid", type=Path)
    v.add_argument("--out", type=Path)
    v.add_argument("--samples", type=int, default=6)

    p = sub.add_parser("promote")
    p.add_argument("proof", type=Path)
    p.add_argument("--supersede")

    c = sub.add_parser("check-manifest")
    c.add_argument("manifest", type=Path)
    c.add_argument("--policy", type=Path)
    c.add_argument("--root", type=Path)
    c.add_argument("--hidden", type=Path, help="hidden-pyramids.json (easter-egg scenes)")

    a = ap.parse_args(argv)
    reg = a.registry
    try:
        if a.cmd == "register":
            m = api.register(reg, a.id, theme=a.theme, family=a.family, source=a.source, recipe=a.recipe, blend=a.blend,
                             edits=a.edits, renderer=a.renderer, sidecar=a.sidecar, notes=a.notes)
            print(json.dumps({k: m[k] for k in ("id", "kind", "width", "height", "sha256")}))
        elif a.cmd == "derive":
            if a.adopt:
                rec = api.adopt(reg, a.id, a.kind, a.adopt, url=a.url)
            elif a.kind == "plate":
                rec = api.derive_plate(reg, a.id, a.out, width=a.width, url=a.url)
            else:
                rec = api.derive_pyramid(reg, a.id, a.out, tile=a.tile, min_width=a.min_width, url=a.url)
            print(json.dumps({k: rec.get(k) for k in ("kind", "status", "path", "sha256", "parent")}))
        elif a.cmd == "verify":
            out = a.out or reg / "proofs"
            proof = api.verify(reg, a.id, plate=a.plate, pyramid=a.pyramid, out_dir=out, samples=a.samples)
            print(f"{proof['verdict']} {a.id} -> {proof['proof_path']}")
            for c in proof["checks"]:
                print(f"  {'ok  ' if c['pass'] else 'FAIL'} {c['name']}")
            for reason in proof["reasons"]:
                print(f"  - {reason}")
            return 0 if proof["verdict"] == "ACCEPT" else 1
        elif a.cmd == "promote":
            e = api.promote(reg, a.proof, supersede=a.supersede)
            print(f"PROMOTED {e['master_id']} ({e['family']}) {e['master_sha256'][:16]}")
        elif a.cmd == "check-manifest":
            rep = api.check_manifest(reg, a.manifest, policy=a.policy, root=a.root, hidden=a.hidden)
            print(json.dumps(rep, indent=1))
            return 0 if rep["ok"] else 1
    except api.Refused as e:
        print("REFUSED: " + "; ".join(e.reasons), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
