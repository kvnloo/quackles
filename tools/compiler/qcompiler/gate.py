"""The verification gate. Produces a proof; ACCEPT only if every check passes.

Checks
  master-integrity  the master still hashes to its registered identity
  provenance        every input is a recorded derivative and still has that hash
  one-family        every input's recorded parent is THIS master (law: one master
                    owns one refinement hierarchy)
  plate-vs-master   plate == downsample(master) under the frozen contract (D2):
                    full-frame mean CIE76 dE <= 5, |dL| <= 3, registration <= 1 px
  pyramid-geometry  level sizes = master size, halved with ceil; tile grid complete
  pyramid-level0    sampled level-0 tiles == master pixels (dE <= 1)
  pyramid-nesting   sampled tiles of level n+1 == BOX 2x of level n, compared after a
                    further 4x BOX so lossy-mip noise does not count (dE <= 2.5,
                    |dL| <= 1, median registration <= 0.5 px)
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
from pathlib import Path

import numpy as np
from PIL import Image

from . import colour
from .derive import assemble, read_pyramid
from .masters import Reader, chunk_identity
from .store import Hasher, all_masters, git_head, load_master, local, now, portable, sha_of

CONTRACT = {"plate_dE_max": 5.0, "plate_abs_dL_max": 3.0, "plate_shift_px_max": 1.0, "plate_aspect_tol": 0.005,
            "cell_dE_report": 10.0, "level0_dE_max": 1.0, "nest_dE_max": 2.5, "nest_abs_dL_max": 1.0, "nest_reduce": 4, "nest_shift_px_max": 0.5,
            "shift_min_luma_std": 4.0,
            "compare_width": 384}
SCHEMA = "quackles.compiler.proof/1"


def _check(name, ok, metrics=None, thresholds=None, detail=None):
    return {"name": name, "pass": bool(ok), "metrics": metrics or {}, "thresholds": thresholds or {}, "detail": detail}


def _cache_dir() -> Path:
    d = Path(os.environ.get("QC_CACHE", Path.home() / ".cache" / "quackles-compiler")) / "reductions"
    d.mkdir(parents=True, exist_ok=True)
    return d


def master_reduction(r: Reader, size) -> Image.Image:
    """downsample(master) at `size`, memoised by master identity (a derived audit image)."""
    p = _cache_dir() / f"{r.m['sha256']}-{size[0]}x{size[1]}.png"
    if p.exists():
        return Image.open(p).convert("RGB")
    img = r.downsample(size)
    img.save(p)
    return img


def check_master(m: dict, hasher: Hasher) -> dict:
    src = local(m["source"])
    if not src.exists():
        return _check("master-integrity", False, detail=f"master source missing: {src}")
    if m["kind"] == "single":
        got = hasher.file(src)
    else:
        chunks = [{**c, "sha256": hasher.file(src / c["name"])} for c in m["chunks"]]
        got = chunk_identity(chunks, m["width"], m["height"])
    return _check("master-integrity", got == m["sha256"], {"sha256": got}, {"sha256": m["sha256"]})


def check_inputs(reg, m: dict, inputs: list[tuple[str, Path]], hasher: Hasher) -> tuple[dict, dict, list]:
    owners: dict[str, list[tuple[str, dict]]] = {}
    for other in all_masters(reg):
        for d in other["derivatives"]:
            owners.setdefault(d["path"], []).append((other["id"], d))
    prov, fam, recs = [], [], []
    for kind, path in inputs:
        key = portable(path)
        cur = sha_of(kind, path, hasher)
        claims = owners.get(key, [])
        mine = [d for mid, d in claims if mid == m["id"]]
        foreign = sorted({mid for mid, _ in claims if mid != m["id"]})
        rec = mine[0] if mine else None
        recs.append({"kind": kind, "path": key, "sha256": cur, "status": rec["status"] if rec else None,
                     "recorded_sha256": rec["sha256"] if rec else None, "url": rec.get("url") if rec else None})
        if not claims:
            prov.append(f"{kind} {key}: no recorded provenance")
        elif rec and rec["sha256"] != cur:
            prov.append(f"{kind} {key}: changed since recorded ({rec['sha256'][:12]} -> {cur[:12]})")
        elif not rec and any(d["sha256"] != cur for _, d in claims):
            prov.append(f"{kind} {key}: changed since recorded")
        if claims and not rec:
            fam.append(f"{kind} {key} derives from {', '.join(foreign)}, not {m['id']}")
        elif rec and rec["parent"] != m["sha256"]:
            fam.append(f"{kind} {key}: recorded parent {rec['parent'][:12]} is not master {m['sha256'][:12]}")
    return (_check("provenance", not prov, detail=prov or None),
            _check("one-family", not fam, {"masters": sorted({m['id']} | {mid for p, _ in inputs for mid, _ in owners.get(portable(p), [])})},
                   detail=fam or None), recs)


def check_plate(r: Reader, plate: Path) -> dict:
    W, H = r.size
    im = Image.open(plate).convert("RGB")
    aspect_err = abs((im.width / im.height) / (W / H) - 1)
    cw = min(CONTRACT["compare_width"], im.width)
    size = (cw, round(cw * H / W))
    ref = master_reduction(r, size)
    cand = im.resize(size, Image.LANCZOS, reducing_gap=3.0)
    full = colour.compare(cand, ref)
    A, B = np.asarray(cand), np.asarray(ref)
    cells = []
    gx, gy = 3, 4
    for j in range(gy):
        for i in range(gx):
            sl = (slice(j * size[1] // gy, (j + 1) * size[1] // gy), slice(i * size[0] // gx, (i + 1) * size[0] // gx))
            c = colour.compare(A[sl], B[sl], shift=False)
            cells.append({"cell": [i, j], "dE": c["dE"], "dL": c["dL"]})
    worst = max(cells, key=lambda c: c["dE"])
    ok = (full["dE"] <= CONTRACT["plate_dE_max"] and abs(full["dL"]) <= CONTRACT["plate_abs_dL_max"]
          and max(abs(v) for v in full["shift_px"]) <= CONTRACT["plate_shift_px_max"] and aspect_err <= CONTRACT["plate_aspect_tol"])
    notes = [f"cell {c['cell']} dE {c['dE']} > {CONTRACT['cell_dE_report']} (localized divergence, review)"
             for c in cells if c["dE"] > CONTRACT["cell_dE_report"]]
    return _check("plate-vs-master", ok,
                  {"compare_size": list(size), "plate_size": [im.width, im.height], "aspect_err": round(aspect_err, 5),
                   "full": full, "worst_cell": worst, "cells": cells},
                  {k: CONTRACT[k] for k in ("plate_dE_max", "plate_abs_dL_max", "plate_shift_px_max", "plate_aspect_tol")},
                  notes or None)


def _sample(cands: list, n: int, seed: str) -> list:
    if len(cands) <= n:
        return cands
    rnd = random.Random(seed)
    picks = [cands[0], cands[-1], cands[len(cands) // 2]]
    rest = [c for c in cands if c not in picks]
    return picks + rnd.sample(rest, max(0, n - 3))


def _luma_std(img: Image.Image) -> float:
    return float(np.asarray(img.convert("L"), dtype=np.float64).std())


def _textured(level_dir: Path, tile: int, cands: list, n: int) -> list:
    """Of the sampled candidate tiles, keep the n with the most luma structure (dark
    scenes are mostly black; a black tile proves nothing about nesting)."""
    if len(cands) <= n or cands == [None]:
        return cands
    scored = []
    for tc in cands:
        with Image.open(level_dir / f"{tc[0]}_{tc[1]}.webp") as t:
            scored.append((_luma_std(t), tc))
    scored.sort(key=lambda s: -s[0])
    return [tc for _, tc in scored[:n]]


def check_pyramid(r: Reader, pyr: Path, samples: int, seed: str) -> list[dict]:
    W, H = r.size
    info = read_pyramid(pyr)
    tile, lvls = info["tile"], info["levels"]
    out = []
    # geometry
    expect, geo_err = [], []
    w, h = W, H
    for lv in lvls:
        expect.append((w, h))
        if info["sizes"] and tuple(info["sizes"].get(lv, ())) != (w, h):
            geo_err.append(f"level {lv}: dzi {info['sizes'].get(lv)} != expected {(w, h)}")
        cols, rows = math.ceil(w / tile), math.ceil(h / tile)
        have = len(list((pyr / str(lv)).glob("*.webp")))
        if have != cols * rows:
            geo_err.append(f"level {lv}: {have} tiles, expected {cols}x{rows}={cols * rows}")
        w, h = (w + 1) // 2, (h + 1) // 2
    if not lvls or lvls != list(range(len(lvls))):
        geo_err.append(f"levels must be 0..n contiguous, got {lvls}")
    out.append(_check("pyramid-geometry", not geo_err, {"levels": [list(e) for e in expect], "tile": tile}, None, geo_err or None))
    if geo_err:
        out.append(_check("pyramid-level0", False, detail="geometry mismatch: level 0 is not this master's raster"))
        out.append(_check("pyramid-nesting", False, detail="geometry mismatch"))
        return out
    # level 0 == master
    W0, H0 = expect[0]
    full = [(tx, ty) for ty in range(H0 // tile) for tx in range(W0 // tile)]
    rows0 = []
    for tx, ty in _sample(full, samples, seed + "L0"):
        box = (tx * tile, ty * tile, (tx + 1) * tile, (ty + 1) * tile)
        with Image.open(pyr / "0" / f"{tx}_{ty}.webp") as t:
            c = colour.compare(t.convert("RGB"), r.crop(box), shift=False)
        rows0.append({"tile": [tx, ty], "dE": c["dE"], "dL": c["dL"], "maxAbs": c["maxAbs"]})
    worst0 = max((x["dE"] for x in rows0), default=0.0)
    out.append(_check("pyramid-level0", rows0 and worst0 <= CONTRACT["level0_dE_max"], {"tiles": rows0, "worst_dE": worst0},
                      {"level0_dE_max": CONTRACT["level0_dE_max"]}))
    # nesting: level k+1 == BOX 2x(level k)
    pairs, nest_ok = [], True
    for k in range(len(lvls) - 1):
        (wk, hk), (wn, hn) = expect[k], expect[k + 1]
        cands = [(tx, ty) for ty in range(hn // tile) for tx in range(wn // tile)
                 if 2 * (tx + 1) * tile <= wk and 2 * (ty + 1) * tile <= hk]
        if not cands:  # tiny levels: compare the whole level
            cands = [None]
        cells = []
        for tc in _textured(pyr / str(k + 1), tile, _sample(cands, 4 * samples, f"{seed}N{k}"), samples):
            if tc is None:
                box_n, box_k = (0, 0, wn, hn), (0, 0, min(wk, 2 * wn), min(hk, 2 * hn))
            else:
                tx, ty = tc
                box_n = (tx * tile, ty * tile, (tx + 1) * tile, (ty + 1) * tile)
                box_k = tuple(2 * v for v in box_n)
            parent = assemble(pyr / str(k), tile, box_k).resize((box_n[2] - box_n[0], box_n[3] - box_n[1]), Image.BOX)
            child = assemble(pyr / str(k + 1), tile, box_n)
            q = CONTRACT["nest_reduce"]
            small = (max(1, child.width // q), max(1, child.height // q))
            c = colour.compare(child.resize(small, Image.BOX), parent.resize(small, Image.BOX), shift=False)
            textured = _luma_std(parent) >= CONTRACT["shift_min_luma_std"]
            shift = list(colour.registration_shift(np.asarray(child), np.asarray(parent))) if textured else None
            cells.append({"tile": list(tc) if tc else "whole", "dE": c["dE"], "dL": c["dL"], "shift_px": shift})
        worst = max(c["dE"] for c in cells)
        worst_dl = max(abs(c["dL"]) for c in cells)
        # registration only on textured samples (phase correlation of a flat/black tile is
        # noise), median so one ambiguous tile cannot fail a level that is really aligned
        shifts = [max(abs(v) for v in c["shift_px"]) for c in cells if c["shift_px"] is not None]
        worst_shift = round(float(np.median(shifts)), 3) if shifts else None
        ok = (worst <= CONTRACT["nest_dE_max"] and worst_dl <= CONTRACT["nest_abs_dL_max"]
              and (worst_shift is None or worst_shift <= CONTRACT["nest_shift_px_max"]))
        nest_ok &= ok
        pairs.append({"levels": [k, k + 1], "pass": ok, "worst_dE": worst, "worst_abs_dL": worst_dl, "median_shift_px": worst_shift, "tiles": cells})
    out.append(_check("pyramid-nesting", nest_ok and bool(pairs) or len(lvls) == 1, {"pairs": pairs},
                      {k: CONTRACT[k] for k in ("nest_dE_max", "nest_abs_dL_max", "nest_reduce", "nest_shift_px_max")}))
    return out


def verify(reg, mid: str, *, plate=None, pyramid=None, out_dir=None, samples: int = 6) -> dict:
    reg = Path(reg)
    m = load_master(reg, mid)
    hasher = Hasher()
    inputs = [(k, Path(p)) for k, p in (("plate", plate), ("pyramid", pyramid)) if p is not None]
    checks = [check_master(m, hasher)]
    prov, fam, recs = check_inputs(reg, m, inputs, hasher)
    checks += [prov, fam]
    r = Reader(m)
    try:
        if checks[0]["pass"]:
            if plate is not None:
                checks.append(check_plate(r, Path(plate)))
            if pyramid is not None:
                checks += check_pyramid(r, Path(pyramid), samples, m["sha256"][:16])
        else:
            checks.append(_check("derivative-checks", False, detail="skipped: master identity not established"))
    finally:
        r.close()
        hasher.save()
    failed = [c for c in checks if not c["pass"]]
    proof = {
        "schema": SCHEMA, "verdict": "REFUSE" if failed or not inputs else "ACCEPT",
        "reasons": [f"{c['name']}: {c['detail'] or 'failed'}" for c in failed] + ([] if inputs else ["no derivative to verify"]),
        "master": {k: m[k] for k in ("id", "theme", "family", "kind", "source", "width", "height", "sha256", "recipe", "blend", "edits", "renderer")},
        "inputs": recs, "contract": CONTRACT, "checks": checks,
        "tool": {"git_head": git_head(), "name": "tools/compiler"}, "created_at": now(),
    }
    if out_dir is not None:
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        stem = f"{mid}-{proof['verdict'].lower()}-{hashlib.sha256(json.dumps(recs, sort_keys=True).encode()).hexdigest()[:10]}"
        p = out_dir / f"{stem}.json"
        p.write_text(json.dumps(proof, indent=1) + "\n")
        from .report import render
        (out_dir / f"{stem}.md").write_text(render(proof))
        proof["proof_path"] = str(p)
    proof["checks_by_name"] = {c["name"]: c for c in checks}
    return proof
