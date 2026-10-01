"""Promotion ledger (one master per theme) and the manifest invariant."""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from .store import Hasher, Refused, all_masters, load_ledger, load_master, local, now, portable, save_ledger, sha_of

TILE_SUFFIX = re.compile(r"^(\d+)/\{x\}_\{y\}\.webp$")


def promote(reg, proof_path, *, supersede: str | None = None) -> dict:
    """Promotion never trusts the proof file: the gate is re-run on the proof's inputs
    and only a fresh ACCEPT, matching the proof's hashes, is written to the ledger."""
    from .gate import verify

    reg, proof_path = Path(reg), Path(proof_path)
    proof = json.loads(proof_path.read_bytes())
    if proof.get("verdict") != "ACCEPT":
        raise Refused(f"proof verdict is {proof.get('verdict')}: " + "; ".join(proof.get("reasons", [])))
    m = load_master(reg, proof["master"]["id"])
    if m["sha256"] != proof["master"]["sha256"]:
        raise Refused("master registry identity differs from the proof's master")
    inputs = {i["kind"]: local(i["path"]) for i in proof["inputs"]}
    params = proof.get("params", {})
    fresh = verify(reg, m["id"], plate=inputs.get("plate"), pyramid=inputs.get("pyramid"), out_dir=proof_path.parent,
                   samples=params.get("samples", 6), floor_width=params.get("floor_width", 1024))
    if fresh["verdict"] != "ACCEPT":
        raise Refused("re-verification refused: " + "; ".join(fresh["reasons"]))
    claimed = {(i["kind"], i["path"]): i["sha256"] for i in proof["inputs"]}
    if any(claimed.get((i["kind"], i["path"])) != i["sha256"] for i in fresh["inputs"]):
        raise Refused("derivatives changed after the proof")
    theme = m["theme"]
    ledger = load_ledger(reg)
    cur = ledger.get(theme)
    if cur and cur["master_id"] != m["id"] and supersede != cur["master_id"]:
        raise Refused(f"theme '{theme}' is owned by master {cur['master_id']}; promoting {m['id']} would mix two source "
                      f"families. Re-run with supersede='{cur['master_id']}' to replace the whole hierarchy.")
    same = cur if cur and cur["master_id"] == m["id"] else None
    new_paths = {i["path"] for i in fresh["inputs"]}
    derivs = [d for d in (same["derivatives"] if same else []) if d["path"] not in new_paths]
    for i in fresh["inputs"]:
        rec = next(d for d in m["derivatives"] if d["path"] == i["path"])
        derivs.append({k: rec.get(k) for k in ("kind", "url", "sha256", "width", "height", "levels", "tileSize", "path")})
    fresh_path = Path(fresh["proof_path"])
    ref = {"path": portable(fresh_path), "sha256": hashlib.sha256(fresh_path.read_bytes()).hexdigest()}
    entry = {"master_id": m["id"], "master_sha256": m["sha256"], "family": m["family"], "derivatives": derivs,
             "proofs": (same.get("proofs", []) if same else []) + [ref], "promoted_at": now()}
    if cur and cur["master_id"] != m["id"]:
        entry["supersedes"] = cur["master_id"]
    ledger[theme] = entry
    save_ledger(reg, ledger)
    return entry


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*.*?\*/", " ", text, flags=re.S)
    return re.sub(r"//[^\n]*", "", text)


def parse_policy(ts_path) -> dict:
    """INSPECTION_POLICY + HIDDEN_POLICY from lib/sequence/inspection-source.ts ->
    {theme: (selected, status)}. Comments are stripped; each block must be declared
    exactly once and name each theme once."""
    text = _strip_comments(Path(ts_path).read_text())
    out = {}
    for name in ("INSPECTION_POLICY", "HIDDEN_POLICY"):
        decls = [mm.start() for mm in re.finditer(rf"^\s*(?:export\s+)?const\s+{name}\b", text, flags=re.M)]
        if not decls:
            continue
        if len(decls) > 1:
            raise Refused(f"{ts_path}: {name} declared {len(decls)} times")
        block = text[decls[0]:]
        block = block[: block.index("};")]
        rows = re.findall(r'(\w+):\s*\{\s*selected:\s*(null|"[^"]*")\s*,\s*status:\s*"([^"]+)"', block)
        for t, sel, st in rows:
            if t in out:
                raise Refused(f"{ts_path}: policy row for '{t}' appears twice")
            out[t] = (None if sel == "null" else sel.strip('"'), st)
    if not out:
        raise Refused(f"{ts_path}: INSPECTION_POLICY not found")
    return out


def _runtime_family(v: dict) -> str | None:
    if "tiles" not in v:
        return None
    return "gp-1gp" if "/gp/" in v["tiles"]["urlTemplate"] else "legacy-201mp"


def _served(v, pol) -> bool:
    fam = _runtime_family(v)
    if fam is None or pol is None:
        return True
    selected, status = pol
    return status.startswith("production") and fam == selected


def hidden_frames(path) -> list[dict]:
    """hidden-pyramids.json ({scene: {frameId, variants}}) as manifest-shaped frames."""
    body = json.loads(Path(path).read_text())
    return [{"id": f"hidden:{scene}:{v.get('frameId')}", "assets": {scene: v.get("variants", [])}} for scene, v in body.items()]


def check_manifest(reg, manifest, *, policy=None, root=None, hidden=None) -> dict:
    """Every frame/theme ladder that serves tiles must come from ONE promoted master:
    tiles = that master's promoted pyramid levels; plate = that master's promoted
    plate (hash-checked). Plate-only ladders are outside the invariant."""
    reg = Path(reg)
    if not isinstance(manifest, dict):
        manifest = json.loads(Path(manifest).read_text())
    pol = parse_policy(policy) if policy else None
    pyramids, plates = [], {}
    for m in all_masters(reg):
        for d in m["derivatives"]:
            if d.get("url") and d["kind"] == "pyramid":
                pyramids.append((d["url"].strip("/"), m["id"], d))
            elif d.get("url"):
                plates.setdefault(d["url"].lstrip("/"), set()).add(m["id"])
    ledger = load_ledger(reg)
    problems, ladders = [], 0
    h = Hasher()
    for theme, entry in sorted(ledger.items()):
        for ref in entry.get("proofs", []):
            proof = local(ref["path"])
            if not proof.exists() or hashlib.sha256(proof.read_bytes()).hexdigest() != ref["sha256"]:
                problems.append({"frame": None, "theme": theme, "rule": "proof-integrity",
                                 "detail": f"promotion proof {ref['path']} is missing or was edited after promotion"})
    frames = list(manifest["frames"]) + (hidden_frames(hidden) if hidden else [])
    for frame in frames:
        for theme, variants in frame["assets"].items():
            vs = [v for v in variants if _served(v, pol.get(theme) if pol else None)]
            tiles = [v for v in vs if "tiles" in v]
            where = {"frame": frame["id"], "theme": theme}
            if not tiles:
                plate_masters = set()
                for v in vs:
                    if "url" in v:
                        plate_masters |= plates.get(v["url"].lstrip("/"), set())
                if len(plate_masters) > 1:
                    problems.append({**where, "rule": "one-family", "masters": sorted(plate_masters),
                                     "detail": f"plates from different masters {sorted(plate_masters)} in one ladder"})
                continue
            ladders += 1
            masters = set()
            for v in tiles:
                tpl = v["tiles"]["urlTemplate"].lstrip("/")
                hit = []
                for base, mid, d in pyramids:
                    mm = TILE_SUFFIX.match(tpl[len(base) + 1:]) if tpl.startswith(base + "/") else None
                    if mm:
                        hit.append((mid, d, int(mm.group(1))))
                if not hit:
                    problems.append({**where, "rule": "promoted-source", "detail": f"tiles {tpl} have no registered master"})
                    continue
                for mid, d, lv in hit:
                    masters.add(mid)
                    levels = d.get("levels") or []
                    if lv >= len(levels) or list(levels[lv]) != [v["width"], v["height"]]:
                        problems.append({**where, "rule": "promoted-source",
                                         "detail": f"{tpl}: level {lv} at {v['width']}x{v['height']} is not a level of {mid}"})
            for v in vs:
                if "url" in v:
                    masters |= plates.get(v["url"].lstrip("/"), set())
            if len(masters) > 1:
                problems.append({**where, "rule": "one-family", "masters": sorted(masters),
                                 "detail": f"one ladder mixes source families {sorted(masters)}"})
                continue
            owner = ledger.get(theme)
            mid = next(iter(masters), None)
            if mid is None:
                continue
            if not owner or owner["master_id"] != mid:
                problems.append({**where, "rule": "promoted-source", "detail": f"{mid} is not the promoted master for {theme}"
                                 + (f" (promoted: {owner['master_id']})" if owner else "")})
                continue
            prom = {d.get("url", "").lstrip("/"): d for d in owner["derivatives"] if d.get("url")}
            for v in tiles:
                base = v["tiles"]["urlTemplate"].lstrip("/").rsplit("/", 2)[0]
                if base.lstrip("/") not in prom:
                    problems.append({**where, "rule": "promoted-source", "detail": f"pyramid {base} is registered but not promoted"})
            for v in (v for v in vs if "url" in v):
                d = prom.get(v["url"].lstrip("/"))
                if d is None:
                    problems.append({**where, "rule": "plate-provenance", "detail": f"plate {v['url']} is not a promoted derivative of {mid}"})
                    continue
                if v.get("sha256") and v["sha256"] != d["sha256"]:
                    problems.append({**where, "rule": "plate-provenance", "detail": f"manifest sha {v['sha256'][:12]} != promoted {d['sha256'][:12]}"})
                if root is not None:
                    f = Path(root) / v["url"].lstrip("/")
                    if not f.exists() or h.file(f) != d["sha256"]:
                        problems.append({**where, "rule": "plate-provenance", "detail": f"{f} does not hash to the promoted plate"})
    h.save()
    return {"ok": not problems, "ladders_with_tiles": ladders, "policy": bool(pol), "problems": problems}
