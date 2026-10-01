"""Master registration (provenance manifest) and bounded-memory master readers.

A master is either one image (the ~201MP Blue PNG) or a grid of chunk PNGs named
c{col}_{row}.png (render_1gp.py's 5x5 crops of a 1GP frame). A chunked master's
identity is the sha256 of its canonical chunk list, so it is content-addressed
without ever stitching the full frame.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from pathlib import Path

from PIL import Image

from .store import Hasher, Refused, load_master, master_path, now, portable, local, save_master

Image.MAX_IMAGE_PIXELS = 300_000_000  # one 201MP master fits; a stitched 1GP frame never loads
CHUNK = re.compile(r"^c(\d+)_(\d+)\.png$")
SCHEMA = "quackles.compiler.master/1"


def _file_ref(p, hasher: Hasher) -> dict | None:
    if p is None:
        return None
    p = Path(p)
    return {"path": portable(p), "sha256": hasher.file(p) if p.exists() else None, "present": p.exists()}


def _chunks(src: Path, hasher: Hasher) -> tuple[list[dict], int, int]:
    grid = {}
    for f in src.iterdir():
        m = CHUNK.match(f.name)
        if m:
            grid[(int(m.group(1)), int(m.group(2)))] = f
    if not grid:
        raise Refused(f"{src}: no c<col>_<row>.png chunks")
    cols = 1 + max(c for c, _ in grid)
    rows = 1 + max(r for _, r in grid)
    missing = [f"c{c}_{r}" for r in range(rows) for c in range(cols) if (c, r) not in grid]
    if missing:
        raise Refused(f"{src}: incomplete chunk grid, missing {missing[:6]}")
    sizes = set()
    for f in grid.values():
        with Image.open(f) as im:
            sizes.add(im.size)
    if len(sizes) != 1:
        raise Refused(f"{src}: chunks are not a uniform grid: {sorted(sizes)}")
    cw, ch = sizes.pop()
    out = []
    for r in range(rows):
        for c in range(cols):
            f = grid[(c, r)]
            digest = hasher.file(f)
            side = f.with_suffix(".json")
            if side.exists():
                claimed = json.loads(side.read_text()).get("sha256")
                if claimed and claimed != digest:
                    raise Refused(f"{f.name}: sidecar sha256 {claimed[:12]} != file {digest[:12]} (chunk changed after render)")
            out.append({"name": f.name, "col": c, "row": r, "x": c * cw, "y": r * ch, "w": cw, "h": ch, "sha256": digest})
    return out, cols * cw, rows * ch


def chunk_identity(chunks: list[dict], width: int, height: int) -> str:
    canon = json.dumps({"size": [width, height], "chunks": [[c["name"], c["x"], c["y"], c["w"], c["h"], c["sha256"]] for c in chunks]},
                       separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()


def register(reg, mid, *, theme, family, source, recipe, blend=None, edits=None, renderer=None, sidecar=None, notes=None) -> dict:
    reg, src = Path(reg), Path(source)
    hasher = Hasher()
    renderer = dict(renderer or {})
    if src.is_dir():
        chunks, width, height = _chunks(src, hasher)
        digest = chunk_identity(chunks, width, height)
        kind = "chunked"
        first = src / "c0_0.json"
        if first.exists():  # render_1gp.py sidecars carry the render contract
            meta = json.loads(first.read_text())
            renderer.setdefault("samples", meta.get("samples"))
            renderer.setdefault("devices", meta.get("devices"))
            blend = blend or meta.get("blend")
            if (meta.get("width"), meta.get("height")) != (width, height):
                raise Refused(f"chunk sidecar says {meta.get('width')}x{meta.get('height')}, grid is {width}x{height}")
    else:
        chunks = None
        with Image.open(src) as im:
            width, height = im.size
        digest = hasher.file(src)
        kind = "single"
        side = Path(sidecar) if sidecar else None
        if side and side.exists():
            meta = json.loads(side.read_text())
            if meta.get("sha256") and meta["sha256"] != digest:
                raise Refused(f"{src.name}: sidecar sha256 {meta['sha256'][:12]} != file {digest[:12]}")
            for k in ("engine", "device", "devices", "samples", "tiles", "seconds", "robot_mesh_hash"):
                if k in meta:
                    renderer.setdefault(k, meta[k])
            blend = blend or meta.get("blend")
    existing = master_path(reg, mid)
    if existing.exists():
        old = json.loads(existing.read_text())
        if old["sha256"] != digest:
            raise Refused(f"master id '{mid}' is already registered to {old['sha256'][:12]}; a new render needs a new id")
        hasher.save()
        return old
    m = {
        "schema": SCHEMA, "id": mid, "theme": theme, "family": family, "kind": kind,
        "source": portable(src), "width": width, "height": height, "megapixels": round(width * height / 1e6, 3),
        "sha256": digest, "chunks": chunks,
        "recipe": {"id": recipe}, "blend": _file_ref(blend, hasher), "edits": _file_ref(edits, hasher),
        "renderer": renderer, "notes": notes, "registered_at": now(), "derivatives": [],
    }
    save_master(reg, m)
    hasher.save()
    return m


class Reader:
    """Bounded-memory access to a registered master: downsample() and crop()."""

    def __init__(self, m: dict):
        self.m = m
        self.src = local(m["source"])
        self.size = (m["width"], m["height"])
        self._full: Image.Image | None = None
        self._cache: dict = {}

    def close(self):
        self._full = None
        self._cache.clear()

    def _image(self) -> Image.Image:
        if self._full is None:
            self._full = Image.open(self.src).convert("RGB")
        return self._full

    def _chunk(self, c: dict) -> Image.Image:
        key = c["name"]
        if key not in self._cache:
            if len(self._cache) >= int(os.environ.get("QC_CHUNK_CACHE", "4")):
                self._cache.pop(next(iter(self._cache)))
            self._cache[key] = Image.open(self.src / c["name"]).convert("RGB")
        return self._cache[key]

    def crop(self, box: tuple[int, int, int, int]) -> Image.Image:
        x0, y0, x1, y1 = box
        if self.m["kind"] == "single":
            return self._image().crop(box)
        out = Image.new("RGB", (x1 - x0, y1 - y0))
        for c in self.m["chunks"]:
            ix0, iy0 = max(x0, c["x"]), max(y0, c["y"])
            ix1, iy1 = min(x1, c["x"] + c["w"]), min(y1, c["y"] + c["h"])
            if ix0 < ix1 and iy0 < iy1:
                piece = self._chunk(c).crop((ix0 - c["x"], iy0 - c["y"], ix1 - c["x"], iy1 - c["y"]))
                out.paste(piece, (ix0 - x0, iy0 - y0))
        return out

    def downsample(self, size: tuple[int, int]) -> Image.Image:
        """Area-correct LANCZOS reduction. Chunked masters are reduced one chunk at a
        time onto an intermediate canvas ~4x the target, then to the target."""
        if self.m["kind"] == "single":
            return self._image().resize(size, Image.LANCZOS, reducing_gap=3.0)
        W, _ = self.size
        s = min(1.0, 4.0 * size[0] / W)
        ch0 = self.m["chunks"][0]
        icw, ich = max(1, round(ch0["w"] * s)), max(1, round(ch0["h"] * s))
        cols = 1 + max(c["col"] for c in self.m["chunks"])
        rows = 1 + max(c["row"] for c in self.m["chunks"])
        canvas = Image.new("RGB", (cols * icw, rows * ich))
        for c in self.m["chunks"]:
            with Image.open(self.src / c["name"]) as im:
                canvas.paste(im.convert("RGB").resize((icw, ich), Image.LANCZOS, reducing_gap=3.0), (c["col"] * icw, c["row"] * ich))
        return canvas.resize(size, Image.LANCZOS)


def reader(reg, mid) -> Reader:
    return Reader(load_master(reg, mid))
