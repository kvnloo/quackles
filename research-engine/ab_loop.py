#!/usr/bin/env python3
"""Small local A/B research-loop driver. Standard library only.

Examples:
  python ab_loop.py validate
  python ab_loop.py frontier
  python ab_loop.py frontier --json
  python ab_loop.py record M01 tested-pass --result "..." --evidence path
  python ab_loop.py advance A --note "Revise the graph from results"
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import urlparse

DATA = Path(__file__).resolve().parent
GRAPH = DATA / "concept-graph.json"
EVIDENCE = DATA / "evidence.tsv"
EXPERIMENTS = DATA / "experiment-queue.tsv"
STATE = DATA / "research-state.json"

STATUSES = {"untested", "running", "tested-pass", "tested-fail", "inconclusive"}
ADJACENT = {
    "mobile": ["human-computer interaction", "signal processing", "mobile GPU architecture"],
    "blender": ["optics", "material science", "Monte Carlo sampling", "visual perception"],
    "cross-domain": ["sampling theory", "psychophysics", "experimental design"],
}


def read_tsv(path: Path) -> tuple[list[str], list[dict[str, str]]]:
    with path.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f, delimiter="\t")
        return list(reader.fieldnames or []), list(reader)


def write_tsv(path: Path, fields: list[str], rows: list[dict[str, str]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields, delimiter="\t", lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def load() -> tuple[dict, list[dict[str, str]], list[str], list[dict[str, str]], dict]:
    graph = json.loads(GRAPH.read_text(encoding="utf-8"))
    _, evidence = read_tsv(EVIDENCE)
    fields, experiments = read_tsv(EXPERIMENTS)
    state = json.loads(STATE.read_text(encoding="utf-8"))
    return graph, evidence, fields, experiments, state


def validate() -> list[str]:
    graph, evidence, _, experiments, state = load()
    errors: list[str] = []
    evidence_ids = {row["id"] for row in evidence}
    if len(evidence_ids) != len(evidence):
        errors.append("duplicate evidence id")
    for row in evidence:
        parsed = urlparse(row["source_url"])
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            errors.append(f"invalid source URL for {row['id']}")

    nodes = {node["id"]: node for node in graph.get("nodes", [])}
    if len(nodes) != len(graph.get("nodes", [])):
        errors.append("duplicate graph node id")
    source_status = graph.get("source_status", {})
    for node_id in nodes:
        coverage = source_status.get(node_id)
        if not coverage:
            errors.append(f"concept has no source or failed-search record: {node_id}")
            continue
        if coverage.get("status") == "sourced":
            refs = coverage.get("evidence", [])
            if not refs:
                errors.append(f"sourced concept has no evidence ids: {node_id}")
            for ref in refs:
                if ref not in evidence_ids:
                    errors.append(f"concept {node_id} references missing evidence {ref}")
        elif coverage.get("status") == "failed-search":
            if not coverage.get("query") or not coverage.get("reason"):
                errors.append(f"failed-search lacks query/reason: {node_id}")
        else:
            errors.append(f"unknown source status for {node_id}")

    for edge in graph.get("edges", []):
        for endpoint in ("from", "to"):
            if edge.get(endpoint) not in nodes:
                errors.append(f"edge has missing {endpoint}: {edge}")
        if edge.get("other") and edge["other"] not in nodes:
            errors.append(f"edge has missing other node: {edge['other']}")
        for ref in edge.get("evidence", []):
            if ref not in evidence_ids:
                errors.append(f"edge references missing evidence {ref}")

    experiment_ids = set()
    for row in experiments:
        if row["id"] in experiment_ids:
            errors.append(f"duplicate experiment id {row['id']}")
        experiment_ids.add(row["id"])
        if row["status"] not in STATUSES:
            errors.append(f"invalid experiment status {row['id']}={row['status']}")

    history = state.get("history", [])
    expected = "A"
    for item in history:
        if item.get("phase") != expected:
            errors.append(f"history is not alternating at round {item.get('round')} phase {item.get('phase')}")
        if item.get("phase") == "A" and "experiment_status_snapshot" not in item:
            errors.append(f"A round lacks experiment status snapshot: {item.get('round')}")
        expected = "B" if expected == "A" else "A"
    if len([h for h in history if h.get("phase") == "A"]) < 3:
        errors.append("fewer than three A/B rounds recorded")
    return errors


def frontier(as_json: bool) -> int:
    graph, _, _, experiments, _ = load()
    unresolved = [row for row in experiments if row["status"] in {"untested", "running", "inconclusive"}]
    rank = {"P0": 0, "P1": 1, "P2": 2}
    unresolved.sort(key=lambda row: (rank.get(row["priority"], 9), row["id"]))
    outgoing: dict[str, list[str]] = defaultdict(list)
    for edge in graph["edges"]:
        outgoing[edge["from"]].append(f"{edge['relation']} {edge['to']}")
        outgoing[edge["to"]].append(f"{edge['from']} {edge['relation']} this")
    payload = []
    for row in unresolved:
        domain = row["domain"]
        mechanism = row["hypothesis"].rstrip(".")
        neighbors = ADJACENT.get(domain, ADJACENT["cross-domain"])
        refs = set(re.findall(r"[WB]\d{2}", row.get("evidence", "")))
        related_nodes = [
            node_id
            for node_id, coverage in graph.get("source_status", {}).items()
            if refs.intersection(coverage.get("evidence", []))
        ]
        dependency_edges = sorted({context for node_id in related_nodes for context in outgoing.get(node_id, [])})
        concepts = ", ".join(related_nodes[:4]) or mechanism
        payload.append({
            "id": row["id"],
            "priority": row["priority"],
            "status": row["status"],
            "hypothesis": row["hypothesis"],
            "queries": [
                f"{concepts} primary source mechanism",
                f"{concepts} {neighbors[0]} experiment",
                f"{concepts} {neighbors[1]} measurement confounder",
            ],
            "related_concepts": related_nodes,
            "unresolved_dependency_edges": dependency_edges,
        })
    if as_json:
        print(json.dumps(payload, indent=2))
    else:
        for item in payload:
            print(f"{item['priority']} {item['id']} [{item['status']}] {item['hypothesis']}")
            if item["unresolved_dependency_edges"]:
                print(f"  edges: {'; '.join(item['unresolved_dependency_edges'][:5])}")
            for query in item["queries"]:
                print(f"  query: {query}")
    return 0


def record(exp_id: str, status: str, result: str, evidence_path: str) -> int:
    if status not in STATUSES - {"untested"}:
        raise SystemExit(f"record status must be one of: {', '.join(sorted(STATUSES - {'untested'}))}")
    _, _, fields, experiments, state = load()
    row = next((candidate for candidate in experiments if candidate["id"] == exp_id), None)
    if not row:
        raise SystemExit(f"unknown experiment: {exp_id}")
    row["status"] = status
    if result:
        row["pass_rule"] = f"{row['pass_rule']} RESULT: {result}"
    if evidence_path:
        row["evidence"] = f"{row['evidence']};{evidence_path}".strip(";")
    write_tsv(EXPERIMENTS, fields, experiments)
    state.setdefault("experiment_events", []).append({
        "id": exp_id,
        "status": status,
        "result": result,
        "evidence": evidence_path,
        "before_next_a": state["current_round"] + 1,
    })
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(f"recorded {exp_id}={status}")
    return 0


def advance(phase: str, note: str) -> int:
    _, _, _, experiments, state = load()
    expected = "A" if state["current_phase"] == "B" else "B"
    if phase != expected:
        raise SystemExit(f"next phase must be {expected}")
    next_round = state["current_round"] + 1 if phase == "A" else state["current_round"]
    item = {"round": next_round, "phase": phase, "note": note}
    if phase == "A":
        events = [event for event in state.get("experiment_events", []) if event.get("before_next_a") == next_round]
        if not events:
            raise SystemExit("record at least one experiment result/status before advancing to another A round")
        item["experiment_status_snapshot"] = dict(Counter(row["status"] for row in experiments))
    state["history"].append(item)
    state["current_phase"] = phase
    state["current_round"] = next_round
    STATE.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    print(f"advanced to {next_round}{phase}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate and advance a source-backed A/B research loop")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("validate")
    f = sub.add_parser("frontier")
    f.add_argument("--json", action="store_true")
    r = sub.add_parser("record")
    r.add_argument("id")
    r.add_argument("status")
    r.add_argument("--result", required=True)
    r.add_argument("--evidence", required=True)
    a = sub.add_parser("advance")
    a.add_argument("phase", choices=["A", "B"])
    a.add_argument("--note", required=True)
    args = parser.parse_args()
    if args.command == "validate":
        errors = validate()
        if errors:
            for error in errors:
                print(f"ERROR {error}")
            return 1
        print("research engine valid")
        return 0
    if args.command == "frontier":
        return frontier(args.json)
    if args.command == "record":
        return record(args.id, args.status, args.result, args.evidence)
    return advance(args.phase, args.note)


if __name__ == "__main__":
    raise SystemExit(main())
