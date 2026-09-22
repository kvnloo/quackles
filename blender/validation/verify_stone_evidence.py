"""Read back exact outputs and immutable sources; report repeat noise, never hide it."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image


def sha(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def difference(a, b):
    if a.shape != b.shape:
        raise ValueError("shape mismatch")
    delta = np.abs(a.astype(np.float64)-b.astype(np.float64))
    row = {"shape": list(a.shape), "exact": bool(np.array_equal(a, b)),
           "changed_channels": int(np.count_nonzero(delta)),
           "changed_pixels": int(np.count_nonzero(np.any(delta != 0, axis=-1))),
           "max_abs": float(delta.max()), "mean_abs": float(delta.mean())}
    if a.dtype == b.dtype == np.float32 and min(a.min(), b.min()) >= 0:
        row["max_ulp_nonnegative_float32"] = int(np.abs(a.view(np.int32).astype(np.int64)-b.view(np.int32).astype(np.int64)).max())
    return row


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--render", type=Path, required=True)
    p.add_argument("--inventory", type=Path, required=True)
    p.add_argument("--active-repo", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--require-linear-exact", action="store_true")
    a = p.parse_args()
    if a.out.exists():
        raise FileExistsError(a.out)
    inventory = json.loads(a.inventory.read_text())
    receipt_path = a.render / "render-receipt.json"
    render = json.loads(receipt_path.read_text())
    source_mismatches = []
    for row in inventory["files"]:
        path = Path(row["path"])
        if not path.is_file() or sha(path) != row["sha256"]:
            source_mismatches.append(str(path))
    snapshot_mismatches = []
    for row in inventory["snapshots"]:
        if sha(row["snapshot"]) != row["sha256"]:
            snapshot_mismatches.append(row["snapshot"])
    output_mismatches = []
    for stage in render["stages"]:
        for row in stage["outputs"].values():
            if sha(row["path"]) != row["sha256"]:
                output_mismatches.append(row["path"])
    active = {}
    for key, argv in {"head": ["rev-parse", "HEAD"], "status": ["status", "--porcelain=v1", "--untracked-files=all"]}.items():
        active[key] = subprocess.check_output(["git", "--no-optional-locks", "-C", str(a.active_repo), *argv], text=True)
    images = {stage: np.array(Image.open(a.render / f"{stage}.png").convert("RGB")) for stage in ("beauty", "emission", "beauty-repeat")}
    linear = {stage: np.load(a.render / f"{stage}-linear.npy", allow_pickle=False) for stage in images}
    report = {
        "render_receipt_sha256": sha(receipt_path), "inventory_sha256": sha(a.inventory),
        "verifier_sha256": sha(Path(__file__)),
        "source_files_checked": len(inventory["files"]), "source_mismatches": source_mismatches,
        "snapshots_checked": len(inventory["snapshots"]), "snapshot_mismatches": snapshot_mismatches,
        "output_mismatches": output_mismatches, "active_git_unchanged": active == inventory["git"],
        "repeat": {"display": difference(images["beauty"], images["beauty-repeat"]), "linear": difference(linear["beauty"], linear["beauty-repeat"])},
        "stage_difference": {"display": difference(images["beauty"], images["emission"]), "linear": difference(linear["beauty"], linear["emission"])},
        "interpretation": "Exact linear repeat is an observation, not assumed. Nonzero deltas remain visible; no broad visual tolerance or reference-parity gate.",
    }
    a.out.write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print(json.dumps(report, indent=2))
    if source_mismatches or snapshot_mismatches or output_mismatches or not report["active_git_unchanged"]:
        return 3
    if a.require_linear_exact and not report["repeat"]["linear"]["exact"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
