"""Day stone measurement math: independent versioned diagnostic, not acceptance."""
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

VERSION = "day-stone/1.0.0"
MM_PER_PX = 0.5403  # Provisional convention, not recovered physical calibration.


def luma(rgb):
    """Weighted channel plane; input units retained (no implicit transfer)."""
    return np.asarray(rgb, dtype=np.float64) @ np.array([.2126, .7152, .0722])

def photometry(rgb, valid):
    values = np.asarray(rgb, dtype=np.float64)[valid]
    if not len(values):
        raise ValueError("empty measurement domain")
    y = luma(values)
    mean = values.mean(axis=0)
    return {
        "valid_pixels": len(values),
        "luma_mean": float(y.mean()),
        "luma_std": float(y.std()),
        "luma_quantiles_p05_p50_p95": np.percentile(y, [5, 50, 95]).tolist(),
        "dark_pixels_lt64": int((y < 64).sum()),
        "dark_occupancy_lt64": float((y < 64).mean()),
        "rgb_mean": mean.tolist(),
        "chromaticity_ratio_of_means": (mean / mean.sum()).tolist() if mean.sum() else None,
    }


def plane_residual(signal, valid):
    yy, xx = np.indices(signal.shape)
    design = np.stack([xx, yy, np.ones_like(xx)], axis=-1).astype(np.float64)
    coef, _, rank, _ = np.linalg.lstsq(design[valid], np.asarray(signal)[valid], rcond=None)
    if rank != 3:
        raise ValueError("measurement domain cannot fit a rank-3 plane")
    return signal - design @ coef, coef


def features(residual, valid, mm_per_px=MM_PER_PX):
    if mm_per_px <= 0 or not np.isfinite(mm_per_px) or not np.any(valid):
        raise ValueError("positive finite unit scale and nonempty mask required")
    dark = (residual < -14.0) & valid
    labels, count = ndimage.label(dark, structure=np.ones((3, 3), int))
    ids = np.arange(1, count + 1)
    areas = np.bincount(labels.ravel(), minlength=count+1)[1:]
    diameters = 2*np.sqrt(areas / np.pi)
    quantiles = np.percentile(diameters, [50, 90, 95]) if count else None
    centers = np.array(ndimage.center_of_mass(dark, labels, ids)) if count else np.empty((0, 2))
    spacing = float(np.median(cKDTree(centers).query(centers, k=2)[0][:, 1])) if count > 1 else None
    boundary = valid & ~ndimage.binary_erosion(valid, structure=np.ones((3, 3)), border_value=0)
    touching = np.unique(labels[boundary & dark])
    return {
        "components": int(count), "areas_px": areas.tolist(),
        "centroids_yx_px": centers.tolist(),
        "dark_pixels": int(dark.sum()), "occupancy": float(dark.sum()/valid.sum()),
        "valid_area_px": int(valid.sum()),
        "valid_area_mm2": float(valid.sum()*mm_per_px**2),
        "per_cm2": float(count/(valid.sum()*mm_per_px**2/100)),
        "diameter_px_p50_p90_p95": quantiles.tolist() if count else None,
        "diameter_mm_p50_p90_p95": (quantiles*mm_per_px).tolist() if count else None,
        "nn_spacing_px_median": spacing,
        "nn_spacing_mm_median": spacing*mm_per_px if spacing is not None else None,
        "boundary_components": int(len(touching)),
    }, dark


def area_bins(areas, valid_pixels):
    rows = []
    for lo, hi in ((1, 5), (5, 17), (17, 33), (33, None)):
        selected = (areas >= lo) & ((areas < hi) if hi is not None else True)
        area = int(areas[selected].sum())
        rows.append({"lower_inclusive_px": lo, "upper_exclusive_px": hi,
                     "components": int(selected.sum()), "area_px": area,
                     "occupancy_contribution": area/valid_pixels,
                     "dark_area_share": area/int(areas.sum()) if areas.sum() else None})
    return rows


def anisotropy(residual, valid):
    dx = np.diff(residual, axis=1)[valid[:, :-1] & valid[:, 1:]]
    dy = np.diff(residual, axis=0)[valid[:-1, :] & valid[1:, :]]
    x = float(np.mean(dx*dx)) if len(dx) else None
    y = float(np.mean(dy*dy)) if len(dy) else None
    return {"horizontal_pairs": len(dx), "vertical_pairs": len(dy),
            "mean_dx2": x, "mean_dy2": y,
            "ratio_dx2_dy2": x/y if x is not None and y else None}


def density(dark, valid):
    tile = 32
    h, w = dark.shape
    bins = []
    occupancies = []
    for y in range(0, h-tile+1, tile):
        for x in range(0, w-tile+1, tile):
            sub = valid[y:y+tile, x:x+tile]
            n = int(sub.sum())
            k = int((dark[y:y+tile, x:x+tile] & sub).sum())
            used = n >= .75*tile*tile
            occupancy = k/n if n else None
            bins.append({"x": x, "y": y, "valid_px": n, "dark_px": k,
                         "occupancy": occupancy, "used": used})
            if used:
                occupancies.append(occupancy)
    return {"tile_px": tile, "used_tiles": len(occupancies),
            "omitted_full_tiles": len(bins)-len(occupancies),
            "discarded_partial_pixels": h*w-(h//tile*tile)*(w//tile*tile),
            "variance_ddof0": float(np.var(occupancies)) if occupancies else None,
            "bins": bins}


def ink_valid(display_rgb):
    """New v1 conservative blue gate; not the recovered historical mask."""
    rgb = np.asarray(display_rgb, dtype=np.float64)
    r, g, b = np.moveaxis(rgb, -1, 0)
    total = r+g+b
    blue = (b-r >= 8) & (b-g >= 4) & (b > .36*total)
    excluded = ndimage.binary_dilation(blue, structure=np.ones((5, 5), bool))
    excluded[:, :12] = True  # Locked ROI's hands-card sliver plus guard.
    return ~excluded


def spectrum(residual, valid):
    h, w = residual.shape
    window = np.hanning(h)[:, None]*np.hanning(w)[None, :]
    signal = np.where(valid, residual, 0.)*window
    power = np.abs(np.fft.fft2(signal))**2
    radius = np.hypot(np.fft.fftfreq(h)[:, None], np.fft.fftfreq(w)[None, :])
    wavelength = np.divide(1., radius, out=np.full_like(radius, np.inf), where=radius > 0)
    total = float(power[radius > 0].sum())
    bands = {"2_to_4_px": (2., 4.), "4_to_12_px": (4., 12.), "12_to_32_px": (12., 32.)}
    sums = {key: float(power[(wavelength >= lo) & (wavelength < hi)].sum()) for key, (lo, hi) in bands.items()}
    return {"power": sums, "total_non_dc_power": total,
            "shares": {k: v/total if total else None for k, v in sums.items()},
            "fine_to_mid": sums["2_to_4_px"]/sums["4_to_12_px"] if sums["4_to_12_px"] else None}


def analyze(rgb, valid, *, domain):
    rgb = np.asarray(rgb, dtype=np.float64)
    valid = np.asarray(valid)
    if domain not in ("display-rgb255", "scene-linear-rgb-times255"):
        raise ValueError("explicit supported signal domain required")
    if rgb.ndim != 3 or rgb.shape[-1] != 3 or valid.shape != rgb.shape[:2] or valid.dtype != bool:
        raise ValueError("RGB HxWx3 and boolean HxW validity required")
    if not np.isfinite(rgb).all() or not valid.any():
        raise ValueError("finite RGB and nonempty domain required")
    y = luma(rgb)
    residual, coef = plane_residual(y, valid)
    f, dark = features(residual, valid)
    f["area_bins"] = area_bins(np.asarray(f["areas_px"]), int(valid.sum()))
    receipt = {
        "contract": VERSION, "domain": domain,
        "shape_hw": list(valid.shape), "mm_per_px_provisional": MM_PER_PX,
        "mask": {"valid_pixels": int(valid.sum()), "excluded_pixels": int((~valid).sum())},
        "photometry": photometry(rgb, valid),
        "residual": {"plane_coef_x_y_intercept": coef.tolist(),
                     "std": float(residual[valid].std()),
                     "quantiles_p01_p05_p50_p95_p99": np.percentile(residual[valid], [1, 5, 50, 95, 99]).tolist()},
        "features": f, "anisotropy": anisotropy(residual, valid),
        "density": density(dark, valid), "spectrum": spectrum(residual, valid),
    }
    return receipt, {"luma": y, "residual": residual, "dark": dark, "valid": valid}
