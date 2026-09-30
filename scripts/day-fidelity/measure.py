#!/usr/bin/env python3
"""Reproducible Day plate vs locked reference measurement (issue #41 item 1).

Measures only; changes nothing. Reference comes from the remote branch
fix/day-visual (blender/assets/reference_day.png) and is hash-locked, so a
clean checkout can reproduce it with no local-only files.

Caveat baked into the output: the reference is the dark UI-poster composition and
the nightly Day plate has a light backdrop, so `full` MAE is backdrop-dominated.
Use `robot` / `plinth` / `poster` region stats for material questions.
"""
from __future__ import annotations
import hashlib, json, subprocess, sys
from pathlib import Path
import numpy as np
from PIL import Image

REF_SHA = "1481b570e247a9420c39a634d9019142d3b03160d07d00cb9051dffcfca27891"
REF_GIT = "origin/fix/day-visual:blender/assets/reference_day.png"
PLATE = "public/preview-scene/sequence/cinematic-proof-v2/day/p0000000-1024.webp"
# x0, y0, x1, y1 on the 1024x1536 frame (pinned from a side-by-side review)
REGIONS = {"full": (0, 0, 1024, 1536), "robot": (350, 400, 890, 1210),
           "plinth": (200, 1160, 1024, 1536), "poster": (700, 0, 1024, 740)}

def load_reference(root: Path) -> Path:
    out = root / ".cache" / "reference_day.png"
    if not out.exists():
        out.parent.mkdir(exist_ok=True)
        out.write_bytes(subprocess.run(["git", "show", REF_GIT], cwd=root, check=True, capture_output=True).stdout)
    return out

def luma(a: np.ndarray) -> np.ndarray:
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722

def bright_chroma(a: np.ndarray, thresh: float = 120) -> dict:
    """Warmth of sunlit/bright pixels (luma > thresh): mean R-B. White shell ~0; cream/olive >> 0."""
    a = a.astype(np.float64); sel = luma(a) > thresh
    n = int(sel.sum())
    return {"n": n, "r_minus_b": round(float((a[..., 0] - a[..., 2])[sel].mean()), 3) if n else None,
            "g_minus_b": round(float((a[..., 1] - a[..., 2])[sel].mean()), 3) if n else None}

def region_metrics(plate: np.ndarray, ref: np.ndarray) -> dict:
    p, r = plate.astype(np.float64), ref.astype(np.float64)
    q = lambda a: [round(float(v), 3) for v in np.percentile(luma(a), [5, 50, 95])]
    return {"mae": round(float(np.abs(p - r).mean()), 4),
            "mean_delta": [round(float(v), 4) for v in (p - r).reshape(-1, 3).mean(0)],
            "luma_p5_p50_p95_plate": q(p), "luma_p5_p50_p95_ref": q(r),
            "bright_chroma_plate": bright_chroma(p), "bright_chroma_ref": bright_chroma(r)}

def measure(root: Path) -> dict:
    ref_path = load_reference(root)
    sha = hashlib.sha256(ref_path.read_bytes()).hexdigest()
    if sha != REF_SHA: raise SystemExit(f"reference hash mismatch {sha}")
    ref = np.asarray(Image.open(ref_path).convert("RGB"))
    plate_path = root / PLATE
    plate = np.asarray(Image.open(plate_path).convert("RGB"))
    assert plate.shape == ref.shape, (plate.shape, ref.shape)
    return {"reference_sha256": sha, "plate": PLATE,
            "plate_sha256": hashlib.sha256(plate_path.read_bytes()).hexdigest(),
            "regions": {n: region_metrics(plate[y0:y1, x0:x1], ref[y0:y1, x0:x1]) for n, (x0, y0, x1, y1) in REGIONS.items()}}

def crops(root: Path, outdir: Path) -> None:
    ref = Image.open(load_reference(root)).convert("RGB"); plate = Image.open(root / PLATE).convert("RGB")
    outdir.mkdir(parents=True, exist_ok=True)
    for n, box in REGIONS.items():
        if n == "full": continue
        a, b = ref.crop(box), plate.crop(box)
        c = Image.new("RGB", (a.width * 2 + 8, a.height), (255, 0, 255)); c.paste(a, (0, 0)); c.paste(b, (a.width + 8, 0))
        c.save(outdir / f"{n}-ref-left-nightly-right.png")

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    res = measure(root)
    if len(sys.argv) > 1: crops(root, Path(sys.argv[1]))
    print(json.dumps(res, indent=1))
