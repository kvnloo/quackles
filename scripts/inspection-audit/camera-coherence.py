#!/usr/bin/env python3
"""Analyse camera-paths captures: for each target compare every path's settled hero to the exact source crop.
Metrics per shot: subpixel registration shift (dy,dx) of the hero luma vs source truth, and pairwise path spread.
Contract (owner: camera must not warp; settled view independent of path): every path within 1.0 px of truth and of each other."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import audit as a
S = Path(sys.argv[1]); meta = json.loads((S / "meta.json").read_text())
CSS_W, CSS_H, X0 = 600, 900, 420
LEVEL_FOR = {2: 3, 4: 2, 6: 1, 8: 1}
def truth(z, fx, fy):
    w = 1 / z; x = max(0, min(1 - w, fx * (1 - w))); y = max(0, min(1 - w, fy * (1 - w)))
    img, _, _ = a.crop(a.LEGACY, LEVEL_FOR[int(z)], (x, y, w, w), (CSS_W, CSS_H)); return np.asarray(img.convert("RGB"))
def hero(png): return np.asarray(Image.open(png).convert("RGB"))[:, X0:X0 + CSS_W]
# use a central text-free sub-box for registration (avoid page text overlays)
BOX = (300, 700, 120, 520)  # y0,y1,x0,x1 in hero coords
rows = []; worst = 0.0
for target in sorted({tuple(m["target"]) for m in meta}):
    z, fx, fy = target; T = truth(z, fx, fy)
    shots = {m["path"]: m for m in meta if tuple(m["target"]) == target}
    out = {}
    for name, m in shots.items():
        H = hero(S / f"{m['id']}.png"); y0, y1, x0, x1 = BOX
        dy, dx = a.registration_shift(T[y0:y1, x0:x1], H[y0:y1, x0:x1]); out[name] = (dy, dx, m["w"], m["left"], m["top"])
    spread = max(np.hypot(v[0] - w[0], v[1] - w[1]) for v in out.values() for w in out.values())
    mx = max(np.hypot(v[0], v[1]) for v in out.values()); worst = max(worst, spread)
    print(f"z{z} f=({fx},{fy}) shift-vs-truth(dy,dx)px:", {k: (v[0], v[1]) for k, v in out.items()}, f"path-spread={spread:.2f}px maxShift={mx:.2f}px")
    for k, v in out.items(): print(f"    {k:10} detailW={v[2]} canvas left/top={v[3]}/{v[4]}")
print("WORST path spread px:", round(worst, 2)); sys.exit(1 if worst > 1.0 else 0)
