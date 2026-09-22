"""Execute the v1 contract on native Day crops; never mutate input files."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import sys

import numpy as np
from PIL import Image
import scipy

from stone_contract import VERSION, analyze, ink_valid

ROI = (430, 1365, 900, 1505)


def sha(path):
    with open(path, "rb") as f:
        return hashlib.file_digest(f, "sha256").hexdigest()


def pairs(values):
    parsed = {}
    for value in values:
        label, path = value.split("=", 1)
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", label) or label in parsed:
            raise ValueError("unique filesystem-safe labels required")
        parsed[label] = Path(path).absolute()
    return parsed


def load(path):
    with Image.open(path) as image:
        rgb = np.asarray(image.convert("RGB"))
    if rgb.shape == (1536, 1024, 3):
        return rgb[ROI[1]:ROI[3], ROI[0]:ROI[2]].copy()
    if rgb.shape != (140, 470, 3):
        raise ValueError(f"{path}: expected native 1024x1536 frame or exact 470x140 ROI; no inferred scaling")
    return rgb


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--image", action="append", required=True, metavar="LABEL=PNG")
    p.add_argument("--linear", action="append", default=[], metavar="LABEL=NPY")
    p.add_argument("--render-receipt", type=Path)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    paths = pairs(a.image)
    linear = pairs(a.linear)
    if set(linear)-set(paths):
        raise ValueError("each linear label requires a display image")
    images = {label: load(path) for label, path in paths.items()}
    hashes = {label: sha(path) for label, path in paths.items()}
    masks = {label: ink_valid(rgb) for label, rgb in images.items()}
    shared = np.logical_and.reduce(list(masks.values()))
    a.out.mkdir(parents=True, exist_ok=False)
    shared_path = a.out / "shared-valid.png"
    Image.fromarray(shared.astype(np.uint8)*255).save(shared_path)
    report = {"contract": VERSION, "native_roi_xyxy": ROI,
              "implementation_sha256": sha(Path(__file__).with_name("stone_contract.py")),
              "runner_sha256": sha(Path(__file__)),
              "python": sys.version, "numpy": np.__version__, "scipy": scipy.__version__,
              "mask_composition": "shared validity is intersection of each display image's v1 validity; reused unchanged for scene-linear data",
              "shared_mask_sha256": sha(shared_path), "images": []}
    if a.render_receipt:
        report["render_receipt"] = {"path": str(a.render_receipt.absolute()), "sha256": sha(a.render_receipt)}
    for label, rgb in images.items():
        folder = a.out / label
        folder.mkdir()
        Image.fromarray(rgb).save(folder / "crop.png")
        record = {"label": label, "source": str(paths[label]), "source_sha256": hashes[label],
                  "crop_pixel_sha256": hashlib.sha256(rgb.tobytes()).hexdigest(),
                  "crop_png_sha256": sha(folder / "crop.png"), "modes": {}}
        for mode, mask in (("unmasked", np.ones(rgb.shape[:2], bool)), ("ink_excluded", masks[label]), ("shared_ink_excluded", shared)):
            metric, planes = analyze(rgb, mask, domain="display-rgb255")
            mask_path = folder / f"{mode}-valid.png"
            Image.fromarray(mask.astype(np.uint8)*255).save(mask_path)
            metric["mask"]["sha256_png"] = sha(mask_path)
            np.savez_compressed(folder / f"{mode}-planes.npz", **planes)
            overlay = rgb.copy()
            overlay[~mask] = [30, 160, 255]
            overlay[planes["dark"]] = [255, 45, 20]
            Image.fromarray(overlay).save(folder / f"{mode}-overlay.png")
            record["modes"][mode] = metric
        if label in linear:
            raw = np.load(linear[label], allow_pickle=False)
            if raw.shape != rgb.shape or not np.isfinite(raw).all():
                raise ValueError("linear data must be finite RGB, top-left native crop orientation")
            record["linear_source"] = {"path": str(linear[label]), "sha256": sha(linear[label])}
            record["linear_shared"], _ = analyze(raw*255., shared, domain="scene-linear-rgb-times255")
        report["images"].append(record)
    assert all(sha(paths[label]) == hashes[label] for label in paths), "source changed during measurement"
    (a.out / "measurements.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print(json.dumps({"contract": VERSION, "images": len(images), "shared_valid_px": int(shared.sum()), "receipt": str(a.out / "measurements.json")}))


if __name__ == "__main__":
    main()
