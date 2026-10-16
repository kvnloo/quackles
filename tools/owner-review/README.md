# Local owner review

This HITL owner-review tool feeds the Blender meta-learning loop. This directory
is the source of truth for its runtime; dream-loop's `scripts/` copy is a
synchronized mirror. Portions derive from dream-loop, with the original MIT
license and attribution reproduced in [LICENSE](LICENSE).

Requires Python 3.10+ and a browser. The server, catalog, validation and synthetic
fixture use the Python standard library. It binds only to loopback and never
opens a browser, renderer or model process. Labels and artifacts stay local.

From the quackles repository root:

```sh
npm run owner-review:fixture -- --data "${XDG_CACHE_HOME:-$HOME/.cache}/owner-review-demo"
npm run owner-review -- --data "${XDG_CACHE_HOME:-$HOME/.cache}/owner-review-demo" --no-watch
npm run test:owner-review
```

The demo refuses to overwrite a nonempty folder. Its labels, receipts and generated red image are entirely synthetic.
No private images, labels, quotes or seed mappings are bundled.

To review existing data, set `OWNER_REVIEW_DATA` or pass `--data`. The default is
`$XDG_CACHE_HOME/owner-review`, falling back to `$HOME/.cache/owner-review`.
Data is external to the repository. Expected inputs are `rating-catalog.json`,
`ledger.json`, and producer/owner JSONL logs in `events/`. Receipt paths and image
hashes come from these inputs. Existing catalog images remain hash checked.

By default the server polls three producer lanes every 15 minutes for four hours.
`OWNER_REVIEW_ARTIFACTS` overrides the artifact root, otherwise it is the data
folder's sibling `night-v2`. LOOK and CLEAR require separate rendered evidence.
Crops are SVG viewports of the hash-bound PNG, JPEG or WebP source, with no pixel
resampling. `--no-watch` serves a catalog without polling or importing lanes.
The optional meta-loop CLI accepts `OWNER_REVIEW_EVALS` or `--evals` for historical
intake. Judge packet preparation is a dream-loop extension requiring its optional
`ab_judge` helper; the review server never calls it.

Chat labels use `source=chat-backfill`, `status=backfilled`, the original UTC
`timestamp`, verbatim `quote`, and a `source_receipt` containing nonempty strings
`kind`, `path`, `session_id`, `message_id`. They require `mapping_confidence`
`high|medium|low`, a `mapping_evidence` list, a nonempty `aspect`, `defect_id` as a
string or null, and `stars=null`. Scope is `trial|component|element`. Trial IDs
must identify real trials, or be null with element scope. Verdicts are
`accept|reject|maybe|lock|direction`; pairwise evidence is optional.

Browse **From chat** or **Element evidence** to see the date and quote. Enter
confirms the prefilled verdict and aspect. Confirmation appends an `owner-ui`
event, retains scope, quote, receipt and mapping, records `confirmed_from` and
`source_timestamp`, and keeps stars null unless the owner selects a rating.
Ordinary UI ratings still require 1–5 stars. Existing labels without an aspect
use `overall`. UI decisions supersede chat labels for the same trial and aspect
regardless of ingestion order. All distinct events remain in append-only history.

Only trial-scoped decisions update trial acceptance. `owner_aspects` in each
mechanism's payoff records descriptive counts for component or bound element
feedback. Unbound labels are in `owner-evidence.json`, with `element_only` counts
and `unbound_labels`, and never contribute to a mechanism or recipe promotion.
Distinct unbound receipts remain separate; a confirmation supersedes its own
source receipt. Pairwise evidence is prefilled when present, including when the
comparison has no catalog image. Quote-only confirmation leaves optics unset.

The tests use disposable synthetic data. Set `OWNER_REVIEW_BROWSER_MODULE` to a
local `playwright-core` module and `OWNER_REVIEW_CHROME` to an owned headless
Chromium binary to include the optional browser regression. No live data or
server is used by the suite.

After changing this source, synchronize and check the dream-loop mirror:

```sh
python3 tools/owner-review/sync_mirror.py --mirror "$DREAM_LOOP_TREE" --write
python3 tools/owner-review/sync_mirror.py --mirror "$DREAM_LOOP_TREE" --check
```

The mirror includes the archive-grounded `dream` planner and read-only ingestion
contract. Preserve concurrent dream-loop changes when synchronizing; run both
suites after merging. This tool does not search chat history or automatically
restart existing services.
