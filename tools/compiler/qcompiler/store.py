"""Registry layout, content hashing (with a stat-keyed cache) and portable paths.

registry/
  masters/<id>.json   provenance manifest + its derivatives (hash, parent)
  proofs/<id>-<n>.json + .md   verification proofs and human reports
  promoted.json       one promoted master per theme (the family ledger)
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
REPO_TAG = "@repo/"
LEVEL_DIR = re.compile(r"^\d+$")


class Refused(Exception):
    """The gate refuses. `reasons` is a list of human-readable strings."""

    def __init__(self, *reasons: str):
        self.reasons = list(reasons)
        super().__init__("; ".join(reasons))


def now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def git_head() -> str | None:
    try:
        return subprocess.run(["git", "-C", str(REPO), "rev-parse", "HEAD"], capture_output=True, text=True,
                              check=True).stdout.strip()
    except Exception:
        return None


def portable(p: Path | str) -> str:
    p = Path(p).resolve()
    try:
        return REPO_TAG + str(p.relative_to(REPO))
    except ValueError:
        return str(p)


def local(s: str) -> Path:
    return REPO / s[len(REPO_TAG):] if s.startswith(REPO_TAG) else Path(s)


# ---- hashing ---------------------------------------------------------------
def _cache_file() -> Path:
    root = Path(os.environ.get("QC_CACHE", Path.home() / ".cache" / "quackles-compiler"))
    root.mkdir(parents=True, exist_ok=True)
    return root / "hash-cache.json"


class Hasher:
    """sha256 of files, memoised on (size, mtime_ns, inode) like git's index."""

    def __init__(self):
        self.path = _cache_file()
        try:
            self.cache = json.loads(self.path.read_text())
        except Exception:
            self.cache = {}
        self.dirty = False

    def file(self, p: Path) -> str:
        p = Path(p).resolve()
        st = p.stat()
        key = str(p)
        stamp = [st.st_size, st.st_mtime_ns, st.st_ino]
        hit = self.cache.get(key)
        if hit and hit[:3] == stamp:
            return hit[3]
        h = hashlib.sha256()
        with open(p, "rb") as f:
            for block in iter(lambda: f.read(1 << 22), b""):
                h.update(block)
        digest = h.hexdigest()
        self.cache[key] = stamp + [digest]
        self.dirty = True
        return digest

    def tree(self, root: Path) -> tuple[str, int]:
        """Hash of a tile pyramid: numeric level dirs only (a nested `gp/` family is
        a different derivative). Returns (sha256, file count)."""
        root = Path(root)
        lines = []
        for level in sorted((d for d in root.iterdir() if d.is_dir() and LEVEL_DIR.match(d.name)), key=lambda d: int(d.name)):
            for f in sorted(level.iterdir()):
                if f.is_file():
                    lines.append(f"{level.name}/{f.name}\t{self.file(f)}")
        return hashlib.sha256("\n".join(lines).encode()).hexdigest(), len(lines)

    def save(self):
        if self.dirty:
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.cache))
            tmp.replace(self.path)
            self.dirty = False


def sha_of(kind: str, path: Path, hasher: Hasher) -> str:
    return hasher.tree(path)[0] if kind == "pyramid" else hasher.file(path)


# ---- registry IO -----------------------------------------------------------
def master_path(reg: Path, mid: str) -> Path:
    return Path(reg) / "masters" / f"{mid}.json"


def load_master(reg: Path, mid: str) -> dict:
    p = master_path(reg, mid)
    if not p.exists():
        raise Refused(f"master '{mid}' is not registered")
    return json.loads(p.read_text())


def save_master(reg: Path, m: dict) -> None:
    p = master_path(reg, m["id"])
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(m, indent=1) + "\n")


def all_masters(reg: Path) -> list[dict]:
    d = Path(reg) / "masters"
    return [json.loads(p.read_text()) for p in sorted(d.glob("*.json"))] if d.exists() else []


def load_ledger(reg: Path) -> dict:
    p = Path(reg) / "promoted.json"
    return json.loads(p.read_text()) if p.exists() else {}


def save_ledger(reg: Path, ledger: dict) -> None:
    (Path(reg) / "promoted.json").write_text(json.dumps(ledger, indent=1, sort_keys=True) + "\n")
