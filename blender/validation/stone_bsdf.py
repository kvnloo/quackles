"""Linear BSDF pass algebra; never add display-encoded pass images."""
import numpy as np


def contributions(passes):
    required = [f"{f} {k}" for f in ("Diffuse", "Glossy", "Transmission") for k in ("Color", "Direct", "Indirect")]
    required += ["Emission", "Environment", "Volume Direct", "Volume Indirect"]
    if not all(n in passes for n in required):
        raise ValueError("missing required actual pass")
    arrays = [np.asarray(passes[n]) for n in required]
    shape = arrays[0].shape
    if len(shape) != 3 or shape[-1] != 3 or any(a.shape != shape or not np.isfinite(a).all() for a in arrays):
        raise ValueError("finite, equally shaped HxWx3 passes required")
    terms = {}
    for family in ("Diffuse", "Glossy", "Transmission"):
        color = np.asarray(passes[family+" Color"], dtype=np.float64)
        for kind in ("Direct", "Indirect"):
            terms[f"{family.lower()}-{kind.lower()}"] = color*np.asarray(passes[family+" "+kind], dtype=np.float64)
    for name in ("Emission", "Environment", "Volume Direct", "Volume Indirect"):
        terms[name.lower().replace(" ", "-")] = np.asarray(passes[name], dtype=np.float64)
    return terms, np.sum(list(terms.values()), axis=0)


def ablations(terms):
    total = np.sum(list(terms.values()), axis=0)
    variants = {"reconstructed": total}
    for name in terms:
        variants["without-"+name] = total-terms[name]
    for group in ("diffuse", "glossy", "direct", "indirect"):
        selected = [v for name, v in terms.items() if group in name.split("-")]
        variants[group] = np.sum(selected, axis=0) if selected else np.zeros_like(total)
        variants["without-"+group] = total-variants[group]
    return variants


def energy_budget(terms, combined, valid):
    from stone_contract import luma
    denominator = float(luma(combined)[valid].mean())
    report = {}
    for name, data in terms.items():
        mean = float(luma(data)[valid].mean())
        report[name] = {"mean_linear_luma": mean, "luma_share": mean/denominator if denominator else None}
    return report
