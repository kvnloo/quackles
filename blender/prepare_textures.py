#!/usr/bin/env python3
"""Raster treatments for the Blender poster set (bust panel, Adam hands, leaf)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(parents=True, exist_ok=True)

COBALT = (47, 91, 255)
COBALT_DEEP = (18, 32, 168)
PAPER = (244, 238, 230)
INK = (22, 32, 74)


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    t = max(0.0, min(1.0, t))
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def duotone(gray: Image.Image, dark=COBALT_DEEP, light=PAPER) -> Image.Image:
    g = ImageOps.autocontrast(gray.convert("L"), cutoff=1)
    g = ImageEnhance.Contrast(g).enhance(1.28)
    g = g.point(lambda v: int(255 * ((v / 255.0) ** 0.92)))
    return ImageOps.colorize(g, black=dark, white=light)


def halftone(size: tuple[int, int], cell: int = 5) -> Image.Image:
    w, h = size
    im = Image.new("L", size, 0)
    dr = ImageDraw.Draw(im)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            dr.ellipse((x + 1, y + 1, x + cell - 2, y + cell - 2), fill=90)
    return im


def make_bust() -> None:
    src_path = ASSETS / "apollo_source.jpg"
    im = Image.open(src_path).convert("RGB")
    w, h = im.size
    # Tight crop on the head, matching the poster crop (chin to curls, left profile).
    crop = im.crop((int(w * 0.04), int(h * 0.10), int(w * 0.98), int(h * 0.88)))
    crop = crop.resize((1400, 1680), Image.Resampling.LANCZOS)
    duo = duotone(crop, dark=COBALT, light=(236, 232, 255))
    # Solid cobalt field, sculpture screened on top so paper whites become cobalt-tinted marble.
    field = Image.new("RGB", duo.size, COBALT)
    mixed = Image.blend(field, duo, 0.72)
    dots = halftone(mixed.size, 4).resize(mixed.size)
    mixed = Image.composite(mixed, ImageEnhance.Contrast(mixed).enhance(1.05), dots.point(lambda v: 40))
    # Soft left fade into the cream set, like the poster rectangle dissolving into the wall.
    alpha = Image.new("L", mixed.size, 255)
    ad = ImageDraw.Draw(alpha)
    fade_w = int(mixed.size[0] * 0.22)
    for x in range(fade_w):
        ad.line([(x, 0), (x, mixed.size[1])], fill=int(255 * (x / fade_w) ** 1.35))
    rgba = mixed.convert("RGBA")
    rgba.putalpha(alpha)
    rgba.save(ASSETS / "bust_panel.png")
    # Opaque version for displacement / backing.
    mixed.save(ASSETS / "bust_panel_opaque.png")
    gray = ImageOps.grayscale(crop)
    gray = ImageOps.autocontrast(gray)
    gray.save(ASSETS / "bust_disp.png")
    print("bust_panel", rgba.size)


def make_hands() -> None:
    src = Image.open(ASSETS / "adam_full.jpg").convert("RGB")
    w, h = src.size
    # Inner fresco, then the two index fingers.
    inner = src.crop((int(w * 0.12), int(h * 0.18), int(w * 0.88), int(h * 0.78)))
    iw, ih = inner.size
    # Only the two index fingers, matching the poster plinth print.
    hands = inner.crop((int(iw * 0.28), int(ih * 0.36), int(iw * 0.58), int(ih * 0.55)))
    hands = hands.resize((1600, 900), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(hands)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    gray = ImageEnhance.Contrast(gray).enhance(1.6)
    gray = gray.point(lambda v: int(255 * ((v / 255.0) ** 1.15)))
    rgb = ImageOps.colorize(gray, black=lerp(COBALT_DEEP, COBALT, 0.45), white=(214, 204, 190))
    # Darker fresco lines stay more opaque on the stone.
    alpha = gray.point(lambda v: int(255 * (0.25 + 0.75 * ((255 - v) / 255.0) ** 0.65)))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    out = out.filter(ImageFilter.SMOOTH)
    out.save(ASSETS / "hands_print.png")
    plate = Image.new("RGB", out.size, (210, 200, 186))
    plate.paste(out, mask=out.split()[-1])
    plate.save(ASSETS / "hands_opaque.png")
    print("hands_print", out.size)


def make_leaf() -> None:
    w, h = 512, 768
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    # Simple laurel-like leaf silhouette.
    dr.polygon(
        [
            (260, 40),
            (390, 220),
            (420, 420),
            (300, 700),
            (240, 720),
            (160, 480),
            (90, 260),
            (180, 120),
        ],
        fill=(28, 96, 48, 230),
    )
    dr.line([(240, 80), (270, 700)], fill=(12, 52, 24, 200), width=6)
    im.save(ASSETS / "leaf.png")
    print("leaf", im.size)


def main() -> None:
    make_bust()
    make_hands()
    make_leaf()


if __name__ == "__main__":
    main()
