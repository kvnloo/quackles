#!/usr/bin/env python3
"""Convert blender/out/frame-*.png → public/poster/frame-*.jpg."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
OUT = HERE / "out"
PUBLIC = HERE.parent / "public" / "poster"


def main() -> None:
    PUBLIC.mkdir(parents=True, exist_ok=True)
    for plate in ("white", "cobalt", "dark"):
        png = OUT / f"frame-{plate}.png"
        if not png.exists():
            print("skip missing", png)
            continue
        im = Image.open(png).convert("RGB")
        jpg = PUBLIC / f"frame-{plate}.jpg"
        im.save(jpg, "JPEG", quality=92, optimize=True)
        public_png = PUBLIC / f"frame-{plate}.png"
        im.save(public_png, "PNG", optimize=True)
        print("wrote", jpg, jpg.stat().st_size, "and", public_png.name)


if __name__ == "__main__":
    main()
