"""Read back real BSDF evidence; exact gates fail honestly, never use tolerances."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from measure_stone import sha, load
from stone_bsdf import contributions
from verify_stone_evidence import difference


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--require-reconstruction-exact", action="store_true")
    parser.add_argument("--require-display-exact", action="store_true")
    parser.add_argument("--require-prior-linear-exact", action="store_true")
    args = parser.parse_args()
    root = args.root
    rp = root / "render/render-receipt.json"
    mp = root / "prepared/manifest.json"
    dp = root / "display/display-receipt.json"
    qp = root / "measurements/measurements.json"
    render, manifest, display, report = [json.loads(p.read_text()) for p in (rp, mp, dp, qp)]
    assert sha(rp) == manifest["render_receipt"]["sha256"]
    assert sha(mp) == display["manifest"]["sha256"] == report["prepared_manifest_sha256"]
    assert sha(dp) == report["display_receipt_sha256"]
    assert sha(manifest["mask_path"]) == report["mask_sha256"] == manifest["mask_sha256"]
    assert sha(Path(__file__).with_name("stone_bsdf.py")) == report["math_sha256"] == manifest["math_sha256"]
    assert sha(Path(__file__).with_name("measure_stone_bsdf.py")) == report["runner_sha256"]
    assert sha(Path(__file__).with_name("prepare_stone_bsdf.py")) == manifest["runner_sha256"]
    assert sha(Path(__file__).with_name("display_stone_bsdf.py")) == display["script_sha256"]
    assert sha(Path(__file__).with_name("render_stone_bsdf.py")) == render["script_sha256"]
    for path, expected in render["sources"].items():
        assert sha(path) == expected, path
    assert sha(render["donor"]) == render["donor_sha256"]
    assert render["locks_before"] == render["locks_after"]
    for rows in (render["outputs"], manifest["arrays"], display["outputs"]):
        for row in rows.values():
            assert sha(row["path"]) == row["sha256"], row["path"]
    for row in report["panels"]+[report["graph"]]:
        assert sha(row["path"]) == row["sha256"]
    arrays = {name: np.load(row["path"], allow_pickle=False) for name, row in manifest["arrays"].items()}
    passes = {name.removeprefix("raw-").replace("-", " ").title(): data for name, data in arrays.items() if name.startswith("raw-")}
    _, reconstruction = contributions(passes)
    exact = {
        "reconstruction_full": difference(reconstruction, arrays["combined"]),
        "display_roundtrip": difference(load(root / "render/composite.png"), load(root / "display/composite.png")),
        "composite_vs_prior_beauty": difference(arrays["composite"], arrays["prior-beauty"]),
    }
    for name, result in exact.items():
        assert result == report["controls"][name], name
    print(json.dumps({"integrity_verified": True, "sources": len(render["sources"]), "arrays": len(arrays), "measurements": len(report["measurements"]), "exact_observations": exact}, indent=2))
    if args.require_reconstruction_exact and not exact["reconstruction_full"]["exact"]:
        return 1
    if args.require_display_exact and not exact["display_roundtrip"]["exact"]:
        return 1
    if args.require_prior_linear_exact and not exact["composite_vs_prior_beauty"]["exact"]:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
