"""Measure real pass ablations with the immutable Day stone v1 shared mask."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from measure_stone import load, sha
from prepare_stone_bsdf import MASK_SHA256
from stone_bsdf import energy_budget
from stone_contract import VERSION, analyze
from verify_stone_evidence import difference


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--display", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    mp = args.prepared / "manifest.json"
    manifest = json.loads(mp.read_text())
    dp = args.display / "display-receipt.json"
    display = json.loads(dp.read_text())
    assert display["manifest"]["sha256"] == sha(mp)
    assert sha(manifest["mask_path"]) == manifest["mask_sha256"] == MASK_SHA256
    mask = np.asarray(Image.open(manifest["mask_path"])) > 0
    prior = Path(manifest["prior"])
    render = json.loads(Path(manifest["render_receipt"]["path"]).read_text())
    arrays, images, paths = {}, {}, {}
    for name, row in manifest["arrays"].items():
        assert sha(row["path"]) == row["sha256"]
        arrays[name] = np.load(row["path"], allow_pickle=False)
        out = display["outputs"][name]
        assert sha(out["path"]) == out["sha256"] and out["linear_sha256"] == row["sha256"]
        images[name] = load(out["path"])
        paths[name] = out["path"]
    old = json.loads((prior / "current-measurements-verified/measurements.json").read_text())
    for name in ("reference", "beauty", "emission"):
        row = next(r for r in old["images"] if r["label"] == name)
        assert sha(row["source"]) == row["source_sha256"]
        key = name if name == "reference" else "legacy-"+name
        images[key] = load(row["source"])
        if name != "reference":
            arrays[key] = arrays["prior-"+name]
    args.out.mkdir(parents=True, exist_ok=False)
    records = {}
    for name, rgb in images.items():
        row = {"display": analyze(rgb, mask, domain="display-rgb255")[0]}
        metric, planes = analyze(rgb, mask, domain="display-rgb255")
        row["display"] = metric
        np.savez_compressed(args.out / (name+"-display-planes.npz"), **planes)
        overlay = rgb.copy()
        overlay[~mask] = [30, 160, 255]
        overlay[planes["dark"]] = [255, 45, 20]
        Image.fromarray(overlay).save(args.out / (name+"-overlay.png"))
        if name in arrays:
            row["linear"], lp = analyze(arrays[name]*255., mask, domain="scene-linear-rgb-times255")
            np.savez_compressed(args.out / (name+"-linear-planes.npz"), **lp)
        records[name] = row
        path = args.out / (name+"-crop.png")
        Image.fromarray(rgb).save(path)
        paths[name] = str(path)
    controls = {k: manifest[k] for k in ("reconstruction_full", "reconstruction_shared", "composite_minus_combined", "composite_vs_prior_beauty")}
    controls["display_roundtrip"] = difference(load(render["outputs"]["composite.png"]["path"]), images["composite"])
    controls["display_reconstruction"] = difference(images["reconstructed"], images["combined"])
    controls["original_display_prior_repeat"] = difference(load(render["outputs"]["composite.png"]["path"]), images["legacy-beauty"])
    controls["exported_combined_vs_composite"] = difference(images["combined"], images["composite"])
    terms = {n: arrays[n] for n in ("diffuse-direct", "diffuse-indirect", "glossy-direct", "glossy-indirect", "transmission-direct", "transmission-indirect", "emission", "environment", "volume-direct", "volume-indirect")}
    budget = energy_budget(terms, arrays["combined"], mask)
    panels = []
    groups = {
        "raw-passes": ["reference", "combined", "raw-diffuse-color", "raw-glossy-color", "raw-diffuse-direct", "raw-glossy-direct", "raw-diffuse-indirect", "raw-glossy-indirect"],
        "radiance": ["reference", "combined", "diffuse-direct", "glossy-direct", "diffuse-indirect", "glossy-indirect", "diffuse", "glossy", "direct", "indirect"],
        "ablations": ["reference", "combined", "legacy-emission", "prior-emission", "without-glossy", "without-diffuse-indirect", "without-glossy-direct", "without-glossy-indirect", "without-diffuse-direct", "reconstructed"],
    }
    for title, labels in groups.items():
        sheet = Image.new("RGB", (990, 48+190*((len(labels)+1)//2)), (20, 22, 25))
        draw = ImageDraw.Draw(sheet)
        draw.text((16, 12), title+" | native 470x140 | original view, no exposure normalization", fill="white")
        tiles = []
        for i, name in enumerate(labels):
            x, y = 16+494*(i % 2), 70+190*(i//2)
            draw.text((x, y-19), name, fill="white")
            sheet.paste(Image.fromarray(images[name]), (x, y))
            tiles.append({"label": name, "source": paths[name], "source_sha256": sha(paths[name]), "xy": [x, y]})
        path = args.out / (title+"-sidebysides.png")
        sheet.save(path)
        panels.append({"path": str(path), "sha256": sha(path), "tiles": tiles})
    # Fixed-axis presentation only: there is no visual acceptance line.
    labels = ["reference", "legacy-emission", "combined", "raw-diffuse-color", "diffuse", "diffuse-direct", "diffuse-indirect", "glossy", "without-glossy", "without-glossy-direct", "without-glossy-indirect", "without-diffuse-indirect"]
    graph = Image.new("RGB", (1050, 70+42*len(labels)), (250, 248, 243))
    draw = ImageDraw.Draw(graph)
    draw.text((12, 12), "Display P95 diameter (px) | anisotropy dx2/dy2 | mean display luma (fixed axes 0..10, 0..2, 0..100)", fill="black")
    for i, name in enumerate(labels):
        y = 60+i*42
        draw.text((12, y), name, fill="black")
        m = records[name]["display"]
        diameter = m["features"]["diameter_px_p50_p90_p95"]
        values = [diameter[2] if diameter else None, m["anisotropy"]["ratio_dx2_dy2"], m["photometry"]["luma_mean"]]
        for j, (val, maximum) in enumerate(zip(values, (10., 2., 100.))):
            x = 250+j*260
            draw.line((x, y+22, x+190, y+22), fill=(160, 160, 160))
            if val is not None:
                draw.rectangle((x, y+9, x+round(190*val/maximum), y+19), fill=((80, 106, 130) if j != 1 else (146, 86, 50)))
                draw.text((x+195, y+7), f"{val:.4f}", fill="black")
            else:
                draw.text((x+195, y+7), "none", fill="black")
    graph_path = args.out / "metrics-graph.png"
    graph.save(graph_path)
    report = {"contract": VERSION, "mask_sha256": MASK_SHA256, "mask_path": manifest["mask_path"],
              "prepared_manifest_sha256": sha(mp), "display_receipt_sha256": sha(dp),
              "runner_sha256": sha(Path(__file__)), "contract_sha256": sha(Path(__file__).with_name("stone_contract.py")),
              "math_sha256": sha(Path(__file__).with_name("stone_bsdf.py")),
              "measurements": records, "controls": controls, "energy_budget": budget, "panels": panels,
              "graph": {"path": str(graph_path), "sha256": sha(graph_path), "labels": labels},
              "limits": ["No inverse reference linear data", "No material intervention: leave-one-out is compositing algebra", "No per-panel normalization", "Fixed absolute threshold means dim contribution pore counts can be absent", "Generated-image PNG roundtrip exact failure retained separately; not a tolerance pass", "Single ROI and seed; no artistic acceptance"]}
    (args.out / "measurements.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print("MEASURED", len(records), "images", int(mask.sum()), "shared valid pixels")
    print(json.dumps({"controls": controls, "energy_budget": budget}, indent=2))


if __name__ == "__main__":
    main()
