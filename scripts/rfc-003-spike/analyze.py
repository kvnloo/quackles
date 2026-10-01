#!/usr/bin/env python3
"""RFC-003 spike analysis: parity of three.js captures vs the Blue hero plate and the 201MP Cycles pyramid.

usage: analyze.py EXPORT_DIR CAPTURE_DIR OUT_DIR
Full frame (1024x1536): silhouette IoU (three mask vs Blender mask of the same camera), region dE (scene-match score.py
regions) vs the shipped plate, per-pixel CIE76 dE inside/outside the robot mask.
Zoom (8x, 1024x1536 canvas over a 128x192 plate rect): per-pixel dE, SSIM(L) and high-frequency energy ratio vs the
201MP pyramid crop (the Cycles anchor), plus the plate crop upscaled (what the control shows without the pyramid).
"""
import sys, json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, "/mnt/zer0models/project-artifacts/quackles/overnight/scene-match/tools")
import score  # noqa: E402

EXP, CAP, OUT = map(Path, sys.argv[1:4]); OUT.mkdir(parents=True, exist_ok=True)
REPO = Path(__file__).resolve().parents[2]
PLATE = REPO / "public/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp"
PYR = Path("/mnt/zer0models/quackles-1gp/assets-repo/blue/p0000000")
PW, PH = 11584, 17376
Image.MAX_IMAGE_PIXELS = None

rgb = lambda p: np.asarray(Image.open(p).convert("RGB").resize((1024, 1536), Image.LANCZOS)).astype(np.float64)
lab = score.srgb2lab
de = lambda a, b: np.sqrt(((lab(a) - lab(b)) ** 2).sum(-1))
mask = lambda p: np.asarray(Image.open(p).convert("L").resize((1024, 1536), Image.NEAREST)) > 127


def box(x, r):
    k = 2 * r + 1; p = np.pad(x, r, mode="edge"); c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)


def ssim(a, b, m=None, r=5):
    C1, C2 = (0.01 * 100) ** 2, (0.03 * 100) ** 2
    ma, mb = box(a, r), box(b, r)
    va, vb, cov = box(a * a, r) - ma * ma, box(b * b, r) - mb * mb, box(a * b, r) - ma * mb
    s = ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2))
    return float(s[m].mean() if m is not None else s.mean())


def hf(L, m):  # high-frequency energy: std of a 3x3 Laplacian inside the mask
    lap = 4 * L[1:-1, 1:-1] - L[:-2, 1:-1] - L[2:, 1:-1] - L[1:-1, :-2] - L[1:-1, 2:]
    return float(lap[m[1:-1, 1:-1]].std())


def pyramid_crop(rect):
    x0, y0, w, h = rect
    X0, Y0, X1, Y1 = round(x0 * PW), round(y0 * PH), round((x0 + w) * PW), round((y0 + h) * PH)
    im = Image.new("RGB", (X1 - X0, Y1 - Y0))
    for ty in range(Y0 // 512, (Y1 - 1) // 512 + 1):
        for tx in range(X0 // 512, (X1 - 1) // 512 + 1):
            t = Image.open(PYR / "0" / f"{tx}_{ty}.webp").convert("RGB")
            im.paste(t, (tx * 512 - X0, ty * 512 - Y0))
    return im.resize((1024, 1536), Image.LANCZOS)


res = {"full": {}, "zoom": {}}
plate = rgb(PLATE)
cyc_mask = mask(EXP / "cycles-robot-mask-1024.png")
three_mask = mask(CAP / "mask.png")
inter, union = (cyc_mask & three_mask).sum(), (cyc_mask | three_mask).sum()
res["full"]["silhouette_iou_three_vs_blender"] = float(inter / union)
# texel density: what robot atlas size gives 1 texel per 201MP pixel at the hero framing
if (CAP / "density.png").exists():
    R = np.asarray(Image.open(CAP / "density.png").convert("RGB"))[..., 0].astype(np.float64)
    m = three_mask & (R > 0)
    d = 2 ** (R[m] / 255 * 16 - 8)  # texels (of an 8192 atlas) per plate pixel
    scale = PW / 1024
    res["full"]["robot_texel_density"] = dict(
        texels_per_plate_px_at_8k_median=round(float(np.median(d)), 2), p10=round(float(np.percentile(d, 10)), 2),
        p90=round(float(np.percentile(d, 90)), 2),
        texels_per_201mp_px_at_8k_median=round(float(np.median(d)) / scale, 3),
        atlas_side_for_1to1_at_201mp_median=int(8192 * scale / np.median(d)),
        atlas_side_for_1to1_at_201mp_p10=int(8192 * scale / np.percentile(d, 10)))
# pyramid at 1024 (control)
if not (CAP / "pyr201-1024.png").exists():
    im = Image.new("RGB", (1448, 2172))
    for x in range(3):
        for y in range(5): im.paste(Image.open(PYR / "3" / f"{x}_{y}.webp"), (x * 512, y * 512))
    im.resize((1024, 1536), Image.LANCZOS).save(CAP / "pyr201-1024.png")
cands = {"control-201mp@1024": CAP / "pyr201-1024.png", "cycles-ref (saved scene)": EXP / "cycles-ref-1024.png",
         "B-bake-2k": CAP / "bake-2k.png", "B-bake-4k": CAP / "bake-4k.png", "B-bake-8k": CAP / "bake-8k.png", "B1-pbr-live": CAP / "pbr.png"}
for name, p in cands.items():
    if not p.exists(): continue
    c = rgb(p); d = de(c, plate)
    mean_region, rows = score.compare(str(PLATE), str(p))
    res["full"][name] = dict(region_mean_dE=round(mean_region, 2), regions={k: round(v["dE"], 1) for k, v in rows.items()},
                             robot_px_dE=round(float(d[cyc_mask].mean()), 2), background_px_dE=round(float(d[~cyc_mask].mean()), 2),
                             robot_mean_colour_dE=round(float(np.sqrt(((lab(c)[cyc_mask].mean(0) - lab(plate)[cyc_mask].mean(0)) ** 2).sum())), 2))
    if name != "control-201mp@1024":
        hm = np.clip(d / 40 * 255, 0, 255).astype(np.uint8)
        Image.fromarray(hm).convert("RGB").save(OUT / f"dE-{name.split()[0]}.png")

# full-frame side-by-side
tiles = [("plate (shipped)", PLATE), ("Cycles saved scene", EXP / "cycles-ref-1024.png"), ("three.js baked 2K", CAP / "bake-2k.png"),
         ("three.js live PBR", CAP / "pbr.png"), ("dE baked vs plate (0-40)", OUT / "dE-B-bake-2k.png")]
tiles = [(t, p) for t, p in tiles if Path(p).exists()]
sheet = Image.new("RGB", (512 * len(tiles), 768 + 28), "white"); dr = ImageDraw.Draw(sheet)
for i, (t, p) in enumerate(tiles):
    sheet.paste(Image.open(p).convert("RGB").resize((512, 768), Image.LANCZOS), (i * 512, 28)); dr.text((i * 512 + 6, 8), t, fill="black")
sheet.save(OUT / "side-by-side-full.png")

cap = json.loads((CAP / "capture.json").read_text()) if (CAP / "capture.json").exists() else {}
for z in ("head", "body"):
    k = f"zoom-{z}-mask"
    if k not in cap: continue
    rect = cap[k]["zoom"]; ref = pyramid_crop(rect); ref.save(CAP / f"zoom-{z}-pyr201.png"); R = np.asarray(ref).astype(np.float64)
    x0, y0, w, h = rect
    pc = Image.open(PLATE).convert("RGB").crop((round(x0 * 1024), round(y0 * 1536), round((x0 + w) * 1024), round((y0 + h) * 1536))).resize((1024, 1536), Image.BICUBIC)
    pc.save(CAP / f"zoom-{z}-plate-upscaled.png")
    m = mask(CAP / f"zoom-{z}-mask.png")
    LR = lab(R)[..., 0]; row = {"robot_fraction": round(float(m.mean()), 3), "ref_hf": round(hf(LR, m), 2)}
    variants = {"plate-upscaled (control w/o pyramid)": CAP / f"zoom-{z}-plate-upscaled.png", "B-bake-2k": CAP / f"zoom-{z}-bake-2k.png",
                "B-bake-8k": CAP / f"zoom-{z}-bake-8k.png", "C1-vt-8k": CAP / f"zoom-{z}-vt.png", "B1-pbr-live": CAP / f"zoom-{z}-pbr.png"}
    for name, p in variants.items():
        if not p.exists(): continue
        C = np.asarray(Image.open(p).convert("RGB")).astype(np.float64); d = de(C, R); LC = lab(C)[..., 0]
        blur = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))).astype(np.float64)
        row[name] = dict(robot_px_dE=round(float(d[m].mean()), 2), robot_px_dE_blur4=round(float(de(blur(C), blur(R))[m].mean()), 2),
                         ssim_L=round(ssim(LC, LR, m), 3), hf_ratio=round(hf(LC, m) / max(hf(LR, m), 1e-6), 2),
                         vt=cap.get(f"zoom-{z}-vt", {}).get("vt") if name.startswith("C1") else None)
    res["zoom"][z] = row
    tiles = [("201MP Cycles (anchor)", CAP / f"zoom-{z}-pyr201.png"), ("plate x8 upscaled", CAP / f"zoom-{z}-plate-upscaled.png"),
             ("baked 2K", CAP / f"zoom-{z}-bake-2k.png"), ("baked 8K resident", CAP / f"zoom-{z}-bake-8k.png"),
             ("VT 8K streamed", CAP / f"zoom-{z}-vt.png"), ("live PBR", CAP / f"zoom-{z}-pbr.png")]
    tiles = [(t, p) for t, p in tiles if Path(p).exists()]
    sheet = Image.new("RGB", (400 * len(tiles), 600 + 28), "white"); dr = ImageDraw.Draw(sheet)
    for i, (t, p) in enumerate(tiles):
        sheet.paste(Image.open(p).convert("RGB").resize((400, 600), Image.LANCZOS), (i * 400, 28)); dr.text((i * 400 + 6, 8), t, fill="black")
    sheet.save(OUT / f"side-by-side-zoom-{z}.png")
res["capture"] = {k: v for k, v in cap.items() if k.startswith("timing") or k in ("bake-2k", "pbr", "bake-8k")}
(OUT / "results.json").write_text(json.dumps(res, indent=1))
print(json.dumps(res, indent=1))
