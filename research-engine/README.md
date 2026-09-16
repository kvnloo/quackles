# Research engine

This directory is self-contained and uses only the Python standard library. Run it from any working directory:

```sh
python3 /path/to/research-engine/ab_loop.py validate
python3 /path/to/research-engine/ab_loop.py frontier
python3 /path/to/research-engine/ab_loop.py frontier --json
```

Record a measured result before revising the next A round:

```sh
python3 /path/to/research-engine/ab_loop.py record M01 tested-pass \
  --result "DPR 1.5 reduced repeated misses without visible edge loss" \
  --evidence "path/to/result.json"
python3 /path/to/research-engine/ab_loop.py advance A \
  --note "Update the pixel-cost branch from M01"
```

`validate` fails if a concept lacks either retrieved evidence or an explicit failed-search record, if graph references are broken, if experiment statuses are invalid, or if the A/B history does not alternate with a status snapshot before each A round.

`frontier` emits the unresolved experiments in priority order plus mechanism and adjacent-domain queries. It does not claim that a query result validates the project; measured outcomes belong in `experiment-queue.tsv`.

The CLI reads and updates the graph, evidence, queue, and state files beside `ab_loop.py`. Copy or extract the whole directory; no project-relative paths are required to run it. Evidence paths recorded inside the queue are provenance strings and do not have to exist for structural validation.

`material-frontier.md` is the bounded Blender-to-browser texture follow-up. `spatial-frontier.md` records the current camera, jump, touchdown-triggered explode and real-set departure contract, including the eight-checkpoint M16 proof and M17 atlas comparison. `rounds.md` preserves six A/B research rounds and labels baseline code observations separately from measured candidates. Research support, implementation status and measured project outcomes remain separate.
