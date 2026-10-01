#!/usr/bin/env python3
"""Cut a baked atlas into virtual-texture pages for the RFC-003 spike.

usage: build_vt.py ATLAS.png OUTDIR [--page 256 --border 4 --levels 2]
L0 = full atlas, L1 = half, ... (levels streamed); each page is (page + 2*border)^2 WebP with edge-clamped gutters.
Stitches <name>-tIJ.png tiles into ATLAS first when they exist, and writes the resident ladder <name>-2k/4k/8k.png.
"""
import sys, json
from pathlib import Path
from PIL import Image

a = sys.argv[1:]
def opt(k, d): return type(d)(a[a.index(k) + 1]) if k in a else d
src, out = Path(a[0]), Path(a[1]); out.mkdir(parents=True, exist_ok=True)
P, B, LV = opt("--page", 256), opt("--border", 4), opt("--levels", 2)
Image.MAX_IMAGE_PIXELS = None
tiles = sorted(src.parent.glob(src.stem + "-t??.png"))
if tiles:  # stitch a tiled bake: tile tIJ covers UV [i/T,(i+1)/T] x [j/T,(j+1)/T]; UV v=0 is the image bottom
    T = int(len(tiles) ** 0.5); ts = Image.open(tiles[0]).size[0]; im = Image.new("RGB", (ts * T, ts * T))
    for t in tiles:
        i, j = int(t.stem[-2]), int(t.stem[-1]); im.paste(Image.open(t).convert("RGB"), (i * ts, (T - 1 - j) * ts))
    im.save(src)
im = Image.open(src).convert("RGB"); V = im.size[0]
for side in (2048, 4096, 8192):  # resident ladder for B1 (2K is also the VT base)
    if side <= V: (im if side == V else im.resize((side, side), Image.LANCZOS)).save(src.parent / f"{src.stem}-{side // 1024}k.png")
total = 0; count = 0
for l in range(LV):
    lvl = im if l == 0 else im.resize((V >> l, V >> l), Image.LANCZOS)
    n = (V >> l) // P; d = out / f"L{l}"; d.mkdir(exist_ok=True)
    # pad by border with edge clamp
    pad = Image.new("RGB", (lvl.size[0] + 2 * B, lvl.size[1] + 2 * B))
    pad.paste(lvl, (B, B))
    pad.paste(lvl.crop((0, 0, lvl.size[0], 1)).resize((lvl.size[0], B)), (B, 0))
    pad.paste(lvl.crop((0, lvl.size[1] - 1, lvl.size[0], lvl.size[1])).resize((lvl.size[0], B)), (B, lvl.size[1] + B))
    col = pad.crop((B, 0, B + 1, pad.size[1])).resize((B, pad.size[1])); pad.paste(col, (0, 0))
    col = pad.crop((pad.size[0] - B - 1, 0, pad.size[0] - B, pad.size[1])).resize((B, pad.size[1])); pad.paste(col, (pad.size[0] - B, 0))
    for y in range(n):
        for x in range(n):
            t = pad.crop((x * P, y * P, x * P + P + 2 * B, y * P + P + 2 * B))
            f = d / f"{x}_{y}.webp"; t.save(f, quality=90, method=4); total += f.stat().st_size; count += 1
(out / "meta.json").write_text(json.dumps(dict(virtualSize=V, pageSize=P, border=B, levels=LV, pages=count, bytes=total), indent=1))
print(f"{count} pages, {total/1e6:.1f} MB")
