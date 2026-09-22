"""Read-only source inventory and immutable diagnostic snapshots (not a renderer)."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path


def sha(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--repo", type=Path, required=True)
    p.add_argument("--work", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    a.out.mkdir(parents=True, exist_ok=True)
    inventory = a.out / "source-inventory.json"
    if inventory.exists():
        raise FileExistsError(inventory)
    roots = [a.repo / "blender", a.work / "calibration", a.work / "cinematic"]
    files = set()
    for root in roots:
        # Only direct calibration scripts, the donor, references, and saved
        # cinematic evidence; never traverse environments or other worktrees.
        if root.name == "calibration":
            files.update(root.glob("*.py"))
            files.add(root / "quality-final-white.blend")
            files.update((root / "references").glob("day*"))
        elif root.name == "cinematic":
            files.update((root / "stone-extract").rglob("*"))
        else:
            files.update(root.rglob("*"))
    records = []
    matches = []
    scripts = []
    pattern = re.compile(r"0\.5403|density_variance|fine_mid|binary_dilation|ink.?mask|mask.?ink|mask-reference", re.I)
    for path in sorted(files):
        if not path.is_file() or "__pycache__" in path.parts:
            continue
        records.append({"path": str(path), "size": path.stat().st_size, "sha256": sha(path)})
        if path.suffix in (".py", ".sh", ".ipynb", ".json", ".md", ".txt"):
            text = path.read_text(errors="replace")
            if path.suffix in (".py", ".sh", ".ipynb"):
                scripts.append(str(path))
            hits = [{"line": i, "text": line[:500]} for i, line in enumerate(text.splitlines(), 1) if pattern.search(line)]
            if hits:
                matches.append({"path": str(path), "hits": hits})
    git = {}
    for key, argv in {"head": ["rev-parse", "HEAD"], "status": ["status", "--porcelain=v1", "--untracked-files=all"]}.items():
        cp = subprocess.run(["git", "--no-optional-locks", "-C", str(a.repo), *argv], capture_output=True, text=True, check=True)
        git[key] = cp.stdout
    snapshots = []
    wanted = [a.work / "calibration/quality-final-white.blend", a.work / "calibration/references/day.png"]
    wanted += sorted((a.repo / "blender").glob("*.py"))
    wanted += sorted((a.repo / "blender/assets").glob("T_pedestal_*.png"))
    wanted += sorted((a.work / "cinematic/stone-extract/morph/mosaic").glob("*-s256.png"))
    for path in wanted:
        dest = a.out / "snapshots" / path.relative_to(a.work)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists():
            raise FileExistsError(dest)
        shutil.copy2(path, dest)
        assert sha(path) == sha(dest)
        snapshots.append({"source": str(path), "snapshot": str(dest), "sha256": sha(dest)})
    inventory.write_text(json.dumps({"git": git, "files": records, "snapshots": snapshots}, indent=2) + "\n")
    (a.out / "historical-search.json").write_text(json.dumps({"roots": list(map(str, roots)), "scripts": scripts, "matches": matches, "conclusion": "Exact later masked generator not located in this scope. Existing mask-reference.png is a red pore overlay on RGB, not a binary ink mask. Version a replacement; do not claim historical masked reproduction."}, indent=2) + "\n")
    print(json.dumps({"inventoried": len(records), "snapshots": len(snapshots), "scripts_searched": len(scripts)}))


if __name__ == "__main__":
    main()
