#!/usr/bin/env python3
"""Plate<->detail alignment at sharp lock: registration shift between the base-only view and the settled (detail) view, per path.
Low-pass both (the plate is blurry) and register the hero luma. Contract: <= 1.0 px (no visible warp when detail arrives)."""
import json, sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, str(Path(__file__).parent)); import audit as a
S = Path(sys.argv[1]); meta = json.loads((S / "meta.json").read_text()); X0, W = 420, 600
lp = lambda p: np.asarray(Image.open(p).convert("RGB").crop((X0, 0, X0 + W, 900)).filter(ImageFilter.GaussianBlur(3)))
worst = 0.0
for m in meta:
    A, B = lp(S / f"{m['id']}.png"), lp(S / f"{m['id']}-baseonly.png")
    dy, dx = a.registration_shift(A[300:700, 120:520], B[300:700, 120:520]); mag = float(np.hypot(dy, dx)); worst = max(worst, mag)
    print(f"{m['id']:34} detail-vs-plate shift ({dy:+.2f},{dx:+.2f}) = {mag:.2f}px")
print("WORST lock shift px:", round(worst, 2)); sys.exit(1 if worst > 1.0 else 0)
