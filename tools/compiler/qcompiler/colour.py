"""Colour/registration metrics. Same definitions as scripts/inspection-audit/audit.py
(CIE76 dE on sRGB->Lab D65, luma phase correlation, gradient correlation) so the
gate's numbers are comparable with the #43 evidence that froze the contract."""
from __future__ import annotations

import numpy as np

_M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]])


def srgb_to_lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255.0
    lin = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = lin @ _M.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


def _luma(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float64)
    return a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722


def registration_shift(a: np.ndarray, b: np.ndarray) -> tuple[float, float]:
    """(dy, dx) that aligns b with a, sub-pixel via parabola fit."""
    la, lb = _luma(a), _luma(b)
    w = np.outer(np.hanning(la.shape[0]), np.hanning(la.shape[1]))
    fa, fb = np.fft.fft2((la - la.mean()) * w), np.fft.fft2((lb - lb.mean()) * w)
    r = fa * np.conj(fb)
    r /= np.abs(r) + 1e-12
    corr = np.fft.ifft2(r).real
    py, px = np.unravel_index(np.argmax(corr), corr.shape)

    def refine(c, i, n):
        lft, mid, rgt = c[(i - 1) % n], c[i], c[(i + 1) % n]
        d = lft - 2 * mid + rgt
        return 0.0 if abs(d) < 1e-12 else 0.5 * (lft - rgt) / d

    n0, n1 = corr.shape
    dy = py + refine(corr[:, px], py, n0)
    dx = px + refine(corr[py, :], px, n1)
    dy = dy - n0 if dy > n0 / 2 else dy
    dx = dx - n1 if dx > n1 / 2 else dx
    return round(float(dy), 2) + 0.0, round(float(dx), 2) + 0.0


def edge_corr(a: np.ndarray, b: np.ndarray) -> float:
    def g(x):
        gy, gx = np.gradient(_luma(x))
        return np.hypot(gx, gy).ravel()

    ga, gb = g(a), g(b)
    if ga.std() < 1e-9 or gb.std() < 1e-9:
        return 1.0 if np.allclose(ga, gb) else 0.0
    return float(np.corrcoef(ga, gb)[0, 1])


def compare(a, b, shift: bool = True) -> dict:
    """Metrics of candidate `a` against reference `b` (same size, RGB uint8)."""
    A, B = np.asarray(a, dtype=np.uint8), np.asarray(b, dtype=np.uint8)
    la, lb = srgb_to_lab(A), srgb_to_lab(B)
    out = {
        "dE": round(float(np.sqrt(((la - lb) ** 2).sum(-1)).mean()), 3),
        "dL": round(float((la[..., 0] - lb[..., 0]).mean()), 3),
        "dRGB": [round(float(v), 2) for v in (A.astype(np.float64) - B).reshape(-1, 3).mean(0)],
        "maxAbs": int(np.abs(A.astype(np.int16) - B).max()),
    }
    if shift:
        out["shift_px"] = list(registration_shift(A, B))
        out["edge_corr"] = round(edge_corr(A, B), 4)
    return out
