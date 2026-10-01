"""Human report for a proof."""
from __future__ import annotations


def _fmt(v):
    return f"`{v}`" if v is not None else "—"


def render(proof: dict) -> str:
    m = proof["master"]
    L = [f"# {proof['verdict']}: {m['id']} ({m['theme']}, {m['family']})", ""]
    if proof["verdict"] == "REFUSE":
        L += ["**Promotion refused.**", ""] + [f"- {r}" for r in proof["reasons"]] + [""]
    L += ["## Master provenance", "",
          f"- identity: `{m['sha256']}` ({m['kind']}, {m['width']}x{m['height']})",
          f"- source: {_fmt(m['source'])}",
          f"- recipe: {_fmt(m['recipe'].get('id'))}",
          f"- blend: {_fmt((m['blend'] or {}).get('path'))} sha {_fmt((m['blend'] or {}).get('sha256'))}",
          f"- edits: {_fmt((m['edits'] or {}).get('path'))} sha {_fmt((m['edits'] or {}).get('sha256'))}",
          f"- renderer: {_fmt(m['renderer'])}", "", "## Inputs", ""]
    for i in proof["inputs"]:
        L.append(f"- {i['kind']} {i['path']} sha `{i['sha256'][:16]}` status {i['status']}")
    L += ["", "## Checks", "", "| check | result | key metrics |", "|---|---|---|"]
    for c in proof["checks"]:
        mt = c["metrics"]
        if c["name"] == "plate-vs-master" and "full" in mt:
            f = mt["full"]
            key = f"full dE {f['dE']}, dL {f['dL']}, shift {f['shift_px']} px, edge {f['edge_corr']}; worst cell dE {mt['worst_cell']['dE']}"
        elif c["name"] == "pyramid-nesting":
            key = "; ".join(f"{p['levels'][0]}->{p['levels'][1]} dE<={p['worst_dE']} dL<={p['worst_abs_dL']}" for p in mt.get("pairs", []))
        elif c["name"] == "pyramid-level0" and "worst_dE" in mt:
            key = f"worst sampled tile dE {mt['worst_dE']} ({len(mt['tiles'])} tiles)"
        else:
            key = ""
        L.append(f"| {c['name']} | {'pass' if c['pass'] else '**FAIL**'} | {key} |")
    notes = [(c["name"], d) for c in proof["checks"] for d in ([c["detail"]] if isinstance(c["detail"], str) else c["detail"] or [])]
    if notes:
        L += ["", "## Notes", ""] + [f"- {n}: {d}" for n, d in notes]
    L += ["", f"Contract: {proof['contract']}", f"Tool head: {_fmt(proof['tool']['git_head'])}, {proof['created_at']}", ""]
    return "\n".join(L)
