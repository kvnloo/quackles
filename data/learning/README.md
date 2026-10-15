# Learning corpus

## Rebuild

Python standard library only; no network or inference calls. Point these environment variables at the read-only source inventory and finished offline eval directory:

```sh
python3 scripts/learning/pipeline.py --history "$HISTORY_JSON" --evals "$EVALS_DIR"
npm run test:learning
npm run build
ARTIFACTS="$RECEIPTS_DIR" LIGHTHOUSE=1 npm run test:learning:static
```

The repo carries a sanitized SQLite snapshot and content-hashed public exports, so normal site builds do not require private source access. Re-ingestion requires `rounds.jsonl`, `analysis.json` and `owner_labels.jsonl`. Read the source's `schema.md` before refreshing; unsupported schema changes must be reviewed, not guessed. No directory polling or models run during a site build.

## Units and storage

`scenes`, `nodes`, `edges`, `artifacts`, `node_artifacts`, `judgments`, `owner_labels`, `prompts`, `methods`, `change_classes`, `lessons`, `sources`, `analyses`. Foreign keys are enabled. Stable keys, source hashes, unique artifact hashes, scene/outcome/method/date indexes and dictionary/set joins keep ingestion bounded and deterministic.

- `artifact-observation` is a deduplicated image inventory entry, not an experiment. Near-duplicate views retain their exact hashes.
- `attempt`, `component-attempt`, `integration-attempt` retain the evaluation tree's explicit units. These are reconstructed records, not a guarantee that every subvariant was recovered.
- `baseline-rejudge` is context, excluded from attempt keep rates.
- `case-study` records a sourced process decision, excluded from attempt rates.
- Edges require explicit source lineage. No parent is inferred from consecutive filenames. Unresolved parents are counted in the build receipt.
- Automated kept/rejected, current/shipped and scoped owner acceptance are different concepts.
- Curated source-backed case fields override the matching eval node ID, not create a duplicate attempt.
- `analyses` stores an allowlisted projection of the offline analysis with its original source hash. Its primary-cohort denominator is not the entire discovery tree. Change-class groups overlap. Calibration has three distinct pairs, not one independent observation per repeated vote.

`public/data/learning/manifest.json` points to the small aggregate, on-demand explorer, year/undated partitions, source table and explicit edges. Every listed file has SHA-256 and byte length. Related rows are indexed once in dictionaries during export. The explorer builds Set indexes, intersects matching IDs and renders bounded batches; it never fetches the full corpus until requested.

## Privacy and attribution

Raw paths, native session IDs, transcripts, credentials and oracle files never enter public output. The allowlist comes before export; the scrubber redacts paths, emails, local URLs and secret patterns before clipping text. Native owner labels are ingested as withheld-quote metadata; only owner-reviewed curated excerpts may be published. The current curated owner quote is the r90 stair-only lock: “the new step is perfect, we can lock that in”. It requires owner review before publication. No whole-scene approval is implied.

Prompt kinds distinguish exact blind-review excerpts, rules, lock constraints and **editorial-method-summary** paraphrases. A prompt `hash` is the complete prompt's SHA-256 when a pinned primary prompt is available; otherwise it hashes the curated excerpt. Its source row distinguishes these cases. No claim of full transcript coverage is made. Long excerpts are bounded; public derivative images are only the already-audited process comparisons, not unreviewed screenshots from logs.

## Static route boundary

`app/learn/page.tsx` is a server-only, classic-navigation document. `postbuild` removes Next hydration/bootstrap scripts **only from `out/learn/index.html`**, retaining CSS, JSON-LD and the standalone progressive enhancement. Do not introduce React client components or Next client navigation to this route without changing the boundary and remeasuring. Other routes and RSC payloads are untouched. Use normal anchors when linking to `/learn/`.

The unoptimized dev server includes framework scripts; performance receipts must target the real static export. The production route has no animation loop. Native scrolling/disclosures work without JS. A 4x-CPU emulation and interaction-event durations are measured, not a claim that physical 120 Hz hardware was tested.

## Integration

Merge with `feat/geo-seo` and the lineage lane before publication. The site guide and lineage links intentionally target those companion artifacts. GEO's prebuild assembles root `llms-full.txt` from this branch's learning text. Keep both GEO prebuild and learning postbuild hooks. Run the combined static browser suite after merging. No push or deployment is part of this lane.
