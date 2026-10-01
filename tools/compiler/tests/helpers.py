"""Synthetic scenes for fast unit tests (no real masters needed)."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image


def scene(w: int = 640, h: int = 960, seed: int = 0, tint=(0, 0, 0)) -> Image.Image:
    """A textured 2:3 'render': gradients, blobs and fine noise so registration and
    nesting checks have something to lock onto."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float64)
    r = 90 + 80 * np.sin(xx / 37.0) * np.cos(yy / 53.0)
    g = 110 + 60 * np.cos((xx + yy) / 71.0)
    b = 150 + 70 * np.sin(yy / 29.0)
    img = np.stack([r, g, b], -1)
    for _ in range(12):
        cx, cy, rad = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(20, 90)
        col = rng.uniform(0, 255, 3)
        m = ((xx - cx) ** 2 + (yy - cy) ** 2) < rad ** 2
        img[m] = 0.35 * img[m] + 0.65 * col
    img += rng.normal(0, 6, img.shape)
    img += np.array(tint, dtype=np.float64)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB")


def write_chunks(img: Image.Image, root: Path, cols: int, rows: int, sidecar: bool = True) -> Path:
    """Split like render_1gp.py: c{col}_{row}.png (+ .json sidecar with sha256)."""
    import hashlib

    root.mkdir(parents=True, exist_ok=True)
    cw, ch = img.width // cols, img.height // rows
    for row in range(rows):
        for col in range(cols):
            p = root / f"c{col}_{row}.png"
            img.crop((col * cw, row * ch, (col + 1) * cw, (row + 1) * ch)).save(p)
            if sidecar:
                meta = {"chunk": f"c{col}_{row}", "width": img.width, "height": img.height,
                        "sha256": hashlib.sha256(p.read_bytes()).hexdigest(), "samples": 16}
                (root / f"c{col}_{row}.json").write_text(json.dumps(meta))
    return root
