"""Extract real Cycles pass arrays and bounded linear-only leave-one-out views."""
import argparse
import json
from pathlib import Path
import shutil
import sys

import numpy as np
import OpenImageIO as oiio
from PIL import Image

from measure_stone import sha, load
from stone_bsdf import contributions, ablations
from stone_contract import VERSION
from verify_stone_evidence import difference

MASK_SHA256 = "4e4ea9cb0b036c094b98c80e6b441e8abc6bc3e997c89cf9ea3ad77cca132468"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--render", type=Path, required=True)
    parser.add_argument("--prior", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    receipt_path = args.render / "render-receipt.json"
    receipt = json.loads(receipt_path.read_text())
    for row in receipt["outputs"].values():
        assert sha(row["path"]) == row["sha256"]
    mask_path = args.prior / "current-measurements-verified/shared-valid.png"
    assert sha(mask_path) == MASK_SHA256
    mask = np.asarray(Image.open(mask_path)) > 0
    assert mask.shape == (140, 470) and int(mask.sum()) == 58152
    src = oiio.ImageInput.open(str(args.render / "passes.exr"))
    if src is None:
        raise ValueError(oiio.geterror())
    spec = src.spec()
    assert (spec.height, spec.width) == mask.shape
    channels = list(spec.channelnames)
    pixels = src.read_image(format=oiio.FLOAT)
    src.close()
    assert pixels is not None and np.isfinite(pixels).all()
    names = [f"{family} {kind}" for family in ("Diffuse", "Glossy", "Transmission") for kind in ("Direct", "Indirect", "Color")]
    names += ["Emission", "Environment", "Volume Direct", "Volume Indirect", "Combined"]
    passes = {name: pixels[:, :, [channels.index(f"{receipt['layer']}.{name}.{c}") for c in "RGB"]].copy() for name in names}
    composite = pixels[:, :, [channels.index(f"Composite.Combined.{c}") for c in "RGB"]].copy()
    terms, total = contributions(passes)
    arrays = {"raw-"+k.lower().replace(" ", "-"): v for k, v in passes.items()}
    arrays.update(terms)
    arrays.update(ablations(terms))
    arrays["combined"] = passes["Combined"]
    arrays["composite"] = composite
    prior_render = json.loads((args.prior / "current-render/render-receipt.json").read_text())
    for name in ("beauty", "emission"):
        stage = next(s for s in prior_render["stages"] if s["stage"] == name)
        row = stage["outputs"][name+"-linear.npy"]
        assert sha(row["path"]) == row["sha256"]
        arrays["prior-"+name] = np.load(row["path"], allow_pickle=False)
    args.out.mkdir(parents=True, exist_ok=False)
    shutil.copyfile(mask_path, args.out / "shared-valid.png")
    manifest = {"contract": VERSION, "mask_path": str(args.out / "shared-valid.png"), "mask_sha256": MASK_SHA256,
                "render_receipt": {"path": str(receipt_path), "sha256": sha(receipt_path)},
                "runner_sha256": sha(Path(__file__)), "math_sha256": sha(Path(__file__).with_name("stone_bsdf.py")),
                "channels": channels, "missing_passes": [], "arrays": {}, "prior": str(args.prior),
                "semantics": "raw-* are actual renderer passes, terms are color-weighted radiance; without-* is linear leave-one-out, not a physical material rerender. Display is not additive.",
                "reconstruction_full": difference(total, passes["Combined"]),
                "reconstruction_shared": difference(total[mask], passes["Combined"][mask]),
                "composite_minus_combined": difference(composite, passes["Combined"]),
                "composite_vs_prior_beauty": difference(composite, arrays["prior-beauty"])}
    np.save(args.out / "reconstruction-residual-f64.npy", total-passes["Combined"], allow_pickle=False)
    for name, data in arrays.items():
        path = args.out / (name+".npy")
        np.save(path, data.astype(np.float32), allow_pickle=False)
        manifest["arrays"][name] = {"path": str(path), "sha256": sha(path), "source_dtype": str(data.dtype)}
    (args.out / "manifest.json").write_text(json.dumps(manifest, indent=2, allow_nan=False)+"\n")
    print(json.dumps({k: manifest[k] for k in ("reconstruction_full", "reconstruction_shared", "composite_minus_combined", "composite_vs_prior_beauty")}, indent=2))
    print("PREPARED", len(arrays), "arrays, shared mask unchanged")


if __name__ == "__main__":
    main()
