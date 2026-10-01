"""Derivatives: plates and DZI-style tile pyramids, produced ONLY from a registered
master (status "derived"), or existing artifacts attached to a master as a claim
the gate must still prove (status "claimed")."""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image

from .masters import Reader
from .store import Hasher, Refused, load_master, now, portable, local, save_master, LEVEL_DIR


def _record(reg, mid: str, rec: dict) -> dict:
    m = load_master(reg, mid)
    rec = {**rec, "master_id": mid, "parent": m["sha256"], "recorded_at": now()}
    m["derivatives"] = [d for d in m["derivatives"] if d["path"] != rec["path"]] + [rec]
    save_master(reg, m)
    return rec


def _save(img: Image.Image, path: Path, lossless: bool = False, quality: int = 90) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    ext = path.suffix.lower()
    if ext == ".webp":
        img.save(path, "WEBP", lossless=lossless, quality=100 if lossless else quality, method=4)
        return {"format": "webp", "lossless": lossless, "quality": None if lossless else quality}
    img.save(path)
    return {"format": ext.lstrip("."), "lossless": True}


def plate_size(master: dict, width: int) -> tuple[int, int]:
    return width, round(width * master["height"] / master["width"])


def derive_plate(reg, mid: str, out, *, width: int = 1024, quality: int = 90, url: str | None = None) -> dict:
    m = load_master(reg, mid)
    out = Path(out)
    size = plate_size(m, width)
    r = Reader(m)
    try:
        enc = _save(r.downsample(size), out, quality=quality)
    finally:
        r.close()
    h = Hasher()
    rec = {"kind": "plate", "status": "derived", "path": portable(out), "sha256": h.file(out), "url": url,
           "width": size[0], "height": size[1], "params": {"resample": "lanczos", **enc}}
    h.save()
    return _record(reg, mid, rec)


def pyramid_levels(width: int, height: int, min_width: int) -> list[tuple[int, int]]:
    """Every level wider than `min_width` (the resident plate covers the rest), as
    build_pyramid.py does: 25820 -> ... -> 1614 and 11584 -> ... -> 1448."""
    levels, w, h = [], width, height
    while w > min_width or not levels:
        levels.append((w, h))
        w, h = (w + 1) // 2, (h + 1) // 2
    return levels


def derive_pyramid(reg, mid: str, out, *, tile: int = 512, min_width: int = 1024, mip_quality: int = 82,
                   url: str | None = None) -> dict:
    """Level 0 = master pixels (lossless WebP); level n+1 = BOX 2x of level n (q82),
    the layout of the shipped pyramids: <out>/<level>/<x>_<y>.webp, y from top."""
    m = load_master(reg, mid)
    out = Path(out)
    levels = pyramid_levels(m["width"], m["height"], min_width)
    r = Reader(m)
    try:
        for li, (w, h) in enumerate(levels):
            cols, rows = math.ceil(w / tile), math.ceil(h / tile)
            for ty in range(rows):
                for tx in range(cols):
                    box = (tx * tile, ty * tile, min(w, (tx + 1) * tile), min(h, (ty + 1) * tile))
                    if li == 0:
                        img = r.crop(box)
                    else:
                        img = _from_previous(out / str(li - 1), levels[li - 1], box, tile)
                    _save(img, out / str(li) / f"{tx}_{ty}.webp", lossless=(li == 0), quality=mip_quality)
    finally:
        r.close()
    dzi = {"tileSize": tile, "format": "webp", "overlap": 0, "size": [m["width"], m["height"]],
           "levels": [{"level": i, "size": [w, h]} for i, (w, h) in enumerate(levels)],
           "level0": "webp-lossless", "mips": f"webp-q{mip_quality}", "master_sha256": m["sha256"]}
    (out / "source.dzi").write_text(json.dumps(dzi, indent=1) + "\n")
    hasher = Hasher()
    digest, n = hasher.tree(out)
    hasher.save()
    rec = {"kind": "pyramid", "status": "derived", "path": portable(out), "sha256": digest, "files": n, "url": url,
           "tileSize": tile, "levels": [list(s) for s in levels], "params": {"level0": "lossless", "mips": "box2x", "mip_quality": mip_quality}}
    return _record(reg, mid, rec)


def _from_previous(prev_dir: Path, prev_size, box, tile: int) -> Image.Image:
    x0, y0, x1, y1 = box
    px0, py0 = 2 * x0, 2 * y0
    px1, py1 = min(prev_size[0], 2 * x1), min(prev_size[1], 2 * y1)
    src = assemble(prev_dir, tile, (px0, py0, px1, py1))
    return src.resize((x1 - x0, y1 - y0), Image.BOX)


def assemble(level_dir: Path, tile: int, box) -> Image.Image:
    """Pixels of `box` (level coordinates) read from the level's tiles."""
    x0, y0, x1, y1 = box
    out = Image.new("RGB", (x1 - x0, y1 - y0))
    for ty in range(y0 // tile, (y1 - 1) // tile + 1):
        for tx in range(x0 // tile, (x1 - 1) // tile + 1):
            with Image.open(level_dir / f"{tx}_{ty}.webp") as t:
                out.paste(t.convert("RGB"), (tx * tile - x0, ty * tile - y0))
    return out


def read_pyramid(path: Path) -> dict:
    """Level sizes + tile size for a pyramid dir, from source.dzi when present."""
    path = Path(path)
    dirs = sorted((int(d.name) for d in path.iterdir() if d.is_dir() and LEVEL_DIR.match(d.name)))
    dzi = path / "source.dzi"
    tile = 512
    sizes = {}
    if dzi.exists():
        meta = json.loads(dzi.read_text())
        tile = meta.get("tileSize", tile)
        for lv in meta.get("levels", []):
            sizes[lv["level"]] = tuple(lv["size"])
    else:
        with Image.open(path / "0" / "0_0.webp") as t:
            tile = max(t.size)
    return {"tile": tile, "levels": dirs, "sizes": sizes}


def adopt(reg, mid: str, kind: str, path, *, url: str | None = None) -> dict:
    """Attach an existing plate/pyramid to a master as an unproven claim."""
    if kind not in ("plate", "pyramid"):
        raise Refused(f"unknown derivative kind {kind}")
    path = Path(path)
    if not path.exists():
        raise Refused(f"{path} does not exist")
    h = Hasher()
    rec = {"kind": kind, "status": "claimed", "path": portable(path), "url": url}
    if kind == "plate":
        with Image.open(path) as im:
            rec.update(width=im.width, height=im.height)
        rec["sha256"] = h.file(path)
    else:
        info = read_pyramid(path)
        rec["sha256"], rec["files"] = h.tree(path)
        rec["tileSize"] = info["tile"]
        rec["levels"] = [list(info["sizes"][lv]) for lv in info["levels"] if lv in info["sizes"]]
    h.save()
    return _record(reg, mid, rec)


__all__ = ["derive_plate", "derive_pyramid", "adopt", "read_pyramid", "assemble", "plate_size", "local"]
