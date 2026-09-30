#!/usr/bin/env python3
"""Blue inspection-source audit (#43): 201MP control vs 1GP candidate vs base plate.

Same normalized crop, same zoom, same output size for every source. Measures
colour (CIE76 dE, mean L/RGB delta), registration (phase-correlation shift of
luma) and edge correlation, plus bytes of the tiles a viewer would fetch.
Desktop/CPU only; no browser. Sources are local, hash-recorded copies.
"""
from __future__ import annotations
import hashlib, json, math, sys
from dataclasses import dataclass
from pathlib import Path
import numpy as np
from PIL import Image

@dataclass
class Family:
    name: str
    root: str
    levels: dict          # level -> (width, height)
    tile: int = 512
    ext: str = "webp"

def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    m = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])
    xyz = lin @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)

def delta_e(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.sqrt(((srgb_to_lab(a) - srgb_to_lab(b)) ** 2).sum(-1)).mean())

def _luma(a): a = a.astype(np.float64); return a[..., 0] * .2126 + a[..., 1] * .7152 + a[..., 2] * .0722

def registration_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """(dy, dx) such that rolling b by (dy, dx) aligns it with a. Sub-pixel via parabola."""
    la, lb = _luma(a), _luma(b)
    w = np.outer(np.hanning(la.shape[0]), np.hanning(la.shape[1]))
    fa, fb = np.fft.fft2((la - la.mean()) * w), np.fft.fft2((lb - lb.mean()) * w)
    r = fa * np.conj(fb); r /= np.abs(r) + 1e-12
    corr = np.fft.ifft2(r).real
    py, px = np.unravel_index(np.argmax(corr), corr.shape)
    def refine(c, i, n):
        l, m, rr = c[(i - 1) % n], c[i], c[(i + 1) % n]
        d = l - 2 * m + rr
        return 0.0 if abs(d) < 1e-12 else 0.5 * (l - rr) / d
    n0, n1 = corr.shape
    dy = py + refine(corr[:, px], py, n0); dx = px + refine(corr[py, :], px, n1)
    dy = dy - n0 if dy > n0 / 2 else dy; dx = dx - n1 if dx > n1 / 2 else dx
    return round(float(dy), 2) + 0.0, round(float(dx), 2) + 0.0

def edge_corr(a: np.ndarray, b: np.ndarray) -> float:
    def g(x):
        l = _luma(x); gy, gx = np.gradient(l); return np.hypot(gx, gy).ravel()
    ga, gb = g(a), g(b)
    return float(np.corrcoef(ga, gb)[0, 1])

def pick_level(fam: Family, zoom: float, out_w: int) -> int:
    ok = [l for l, (w, _) in fam.levels.items() if w / zoom >= out_w]
    return min(ok, key=lambda l: fam.levels[l][0]) if ok else max(fam.levels, key=lambda l: fam.levels[l][0])

def crop(fam: Family, level: int, box: tuple, out: tuple):
    """box = normalized (x, y, w, h). Returns (PIL image at `out`, tile bytes, tile count)."""
    W, H = fam.levels[level]; ts = fam.tile
    x0, y0, x1, y1 = int(box[0] * W), int(box[1] * H), math.ceil((box[0] + box[2]) * W), math.ceil((box[1] + box[3]) * H)
    tx0, ty0, tx1, ty1 = x0 // ts, y0 // ts, (x1 - 1) // ts, (y1 - 1) // ts
    canvas = Image.new("RGB", ((tx1 - tx0 + 1) * ts, (ty1 - ty0 + 1) * ts)); nbytes = n = 0
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            p = Path(fam.root) / str(level) / f"{tx}_{ty}.{fam.ext}"
            nbytes += p.stat().st_size; n += 1
            canvas.paste(Image.open(p).convert("RGB"), ((tx - tx0) * ts, (ty - ty0) * ts))
    img = canvas.crop((x0 - tx0 * ts, y0 - ty0 * ts, x1 - tx0 * ts, y1 - ty0 * ts))
    return img.resize(out, Image.LANCZOS), nbytes, n

# ---- Blue matrix -----------------------------------------------------------
BLUE_ROOT = "/mnt/zer0models/quackles-1gp/assets-repo/blue/p0000000"
LEGACY = Family("201mp-legacy", BLUE_ROOT, {0: (11584, 17376), 1: (5792, 8688), 2: (2896, 4344), 3: (1448, 2172)})
GP = Family("1gp", BLUE_ROOT + "/gp", {0: (25820, 38730), 1: (12910, 19365), 2: (6455, 9683), 3: (3228, 4842), 4: (1614, 2421)})
REGIONS = {"robot-head": (0.36, 0.34), "poster-bust": (0.85, 0.20), "plinth-text": (0.30, 0.84), "orb": (0.07, 0.72), "arch": (0.50, 0.30)}
ZOOMS = [1, 2, 4, 8]
OUT = (384, 576)

def window(cx, cy, z):
    w = 1 / z; x = min(max(cx - w / 2, 0), 1 - w); y = min(max(cy - w / 2, 0), 1 - w); return (x, y, w, w)

def pair(a, b):
    A, B = np.asarray(a), np.asarray(b)
    dy, dx = registration_shift(A, B)
    return {"dE": round(delta_e(A, B), 3), "dL": round(float((srgb_to_lab(A)[..., 0] - srgb_to_lab(B)[..., 0]).mean()), 3),
            "dRGB": [round(float(v), 2) for v in (A.astype(float) - B).reshape(-1, 3).mean(0)],
            "shift_px": [dy, dx], "edge_corr": round(edge_corr(A, B), 4)}

def run(plate_path: Path, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    plate = Image.open(plate_path).convert("RGB")
    rows, sheet_rows = [], []
    for region, (cx, cy) in REGIONS.items():
        for z in ZOOMS:
            box = window(cx, cy, z) if z > 1 else (0, 0, 1, 1)
            cell = {"region": "full" if z == 1 else region, "zoom": z, "box": [round(v, 4) for v in box]}
            if z == 1 and region != "robot-head": continue  # one full-frame row
            imgs = {}
            for fam in (LEGACY, GP):
                lvl = pick_level(fam, z, OUT[0]); im, nb, nt = crop(fam, lvl, box, OUT)
                imgs[fam.name] = im; cell[fam.name] = {"level": lvl, "width": fam.levels[lvl][0], "bytes": nb, "tiles": nt, "source_limited": fam.levels[lvl][0] / z < OUT[0]}
            px = plate.crop((int(box[0] * 1024), int(box[1] * 1536), math.ceil((box[0] + box[2]) * 1024), math.ceil((box[1] + box[3]) * 1536))).resize(OUT, Image.LANCZOS)
            imgs["plate-1024"] = px; cell["plate-1024"] = {"source_limited": 1024 / z < OUT[0]}
            cell["control_vs_plate"] = pair(imgs["201mp-legacy"], px); cell["candidate_vs_control"] = pair(imgs["1gp"], imgs["201mp-legacy"]); cell["candidate_vs_plate"] = pair(imgs["1gp"], px)
            rows.append(cell); sheet_rows.append((cell, imgs))
    # contact sheet: columns plate | 201MP | 1GP
    w, h = OUT; pad = 6
    sheet = Image.new("RGB", (3 * w + 4 * pad, len(sheet_rows) * (h + pad) + pad), (255, 0, 255))
    for i, (cell, imgs) in enumerate(sheet_rows):
        for j, k in enumerate(["plate-1024", "201mp-legacy", "1gp"]):
            sheet.paste(imgs[k], (pad + j * (w + pad), pad + i * (h + pad)))
    sheet.save(outdir / "contact-sheet.png")
    return rows

def thresholds(rows):
    ctl = [r["control_vs_plate"] for r in rows if r["zoom"] <= 2]
    return {"control_dE_max_z<=2": max(c["dE"] for c in ctl), "control_shift_max_z<=2": max(max(abs(v) for v in c["shift_px"]) for c in ctl),
            "control_abs_dL_max_z<=2": max(abs(c["dL"]) for c in ctl)}

# ---- All-five: 1GP candidate vs each theme's authored base plate -----------
ASSETS = "/mnt/zer0models/quackles-1gp/assets-repo"
THEMES = ["day", "white", "blue", "dark", "night"]
PLATE_EXT = {"day": "png", "white": "webp", "blue": "webp", "dark": "webp", "night": "webp"}

def gp_family(theme):
    return Family(f"{theme}-1gp", f"{ASSETS}/{theme}/p0000000/gp", GP.levels)

def verdict(dE, dL):
    """Frozen Blue contract (dE<=5, |dL|<=3) applied per crop; >10 dE = different scene."""
    if dE <= 5 and abs(dL) <= 3: return "pass"
    return "diverges" if dE > 10 else "marginal"

def all_five(root: Path, outdir: Path):
    outdir.mkdir(parents=True, exist_ok=True)
    crops = [("full", (0, 0, 1, 1), 1), ("robot", window(0.36, 0.34, 2), 2), ("poster", window(0.85, 0.20, 2), 2), ("plinth", window(0.30, 0.84, 2), 2)]
    w, h = OUT; pad = 6
    sheet = Image.new("RGB", (len(THEMES) * 2 * (w // 2) + 12 * pad, len(crops) * (h // 2 + pad) + pad), (255, 0, 255))
    report = {}
    for ti, theme in enumerate(THEMES):
        plate = Image.open(root / f"public/preview-scene/sequence/cinematic-proof-v2/{theme}/p0000000-1024.{PLATE_EXT[theme]}").convert("RGB")
        fam = gp_family(theme); cells = []
        for ci, (name, box, z) in enumerate(crops):
            lvl = pick_level(fam, z, OUT[0]); im, nb, nt = crop(fam, lvl, box, OUT)
            px = plate.crop((int(box[0] * 1024), int(box[1] * 1536), math.ceil((box[0] + box[2]) * 1024), math.ceil((box[1] + box[3]) * 1536))).resize(OUT, Image.LANCZOS)
            m = pair(im, px); m.update(crop=name, zoom=z, level=lvl, bytes=nb, verdict=verdict(m["dE"], m["dL"])); cells.append(m)
            for j, img in enumerate((px, im)):
                sheet.paste(img.resize((w // 2, h // 2)), (pad + (ti * 2 + j) * (w // 2 + pad // 2), pad + ci * (h // 2 + pad)))
        worst = max(c["dE"] for c in cells); passes = sum(c["verdict"] == "pass" for c in cells)
        status = "production-candidate" if passes == len(cells) else ("disabled" if worst > 10 else "candidate-1gp")
        report[theme] = {"status": status, "worst_dE": worst, "cells": cells}
    sheet.save(outdir / "all-five-contact-sheet.png")
    return report

if __name__ == "__main__" and len(sys.argv) > 2 and sys.argv[2] == "all-five":
    root = Path(__file__).resolve().parents[2]; out = Path(sys.argv[1])
    rep = all_five(root, out); (out / "all-five.json").write_text(json.dumps(rep, indent=1))
    for t, r in rep.items():
        print(t, r["status"], "worst dE", r["worst_dE"], [(c["crop"], c["dE"], c["dL"], c["verdict"]) for c in r["cells"]])
    sys.exit(0)

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[2]
    out = Path(sys.argv[1])
    rows = run(root / "public/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp", out)
    th = thresholds(rows)
    src = json.load(open(BLUE_ROOT + "/metadata.json"))["source"]
    (out / "matrix.json").write_text(json.dumps({"source_201mp_sha256": src["sha256"], "plate_sha256": hashlib.sha256((root / "public/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp").read_bytes()).hexdigest(), "control_thresholds": th, "cells": rows}, indent=1))
    for r in rows:
        print(f'{r["region"]:12} z{r["zoom"]}  ctl-vs-plate dE={r["control_vs_plate"]["dE"]:6.2f} shift={r["control_vs_plate"]["shift_px"]}  | 1gp-vs-ctl dE={r["candidate_vs_control"]["dE"]:6.2f} dL={r["candidate_vs_control"]["dL"]:6.2f} shift={r["candidate_vs_control"]["shift_px"]} edge={r["candidate_vs_control"]["edge_corr"]}  | bytes 201={r["201mp-legacy"]["bytes"]//1024}K 1gp={r["1gp"]["bytes"]//1024}K')
    print(th)
