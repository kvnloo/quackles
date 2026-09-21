# Quackles review policy

Quackles uses cheap/free models as **scouts**, not judges.

## Free / OpenRouter model lane

Allowed:
- inventory branches, files, commits and artifacts
- run deterministic tests and benchmarks
- collect screenshots and measurements
- summarize diffs without choosing a winner
- generate candidate implementation branches for later review

Not authoritative for:
- deciding which visual candidate best matches a locked reference
- declaring Day/reference parity
- choosing motion choreography
- choosing simulator architecture
- deciding that audio/haptics are good
- promoting a recovery branch
- merge readiness
- deleting recovered work

A free-model conclusion such as "looks good", "pixel perfect", "done", or "best" is evidence-free until independently checked.

## Required visual gate

Pages deploys all active comparison branches under `/compare/`.

After each successful Pages deployment, `.github/workflows/visual-review.yml`:
1. captures each candidate at identical mobile viewport and scroll positions,
2. assigns blind letter codes,
3. makes zoomed crop views for reference-critical regions,
4. uploads the blind pack separately from the branch map.

Review the blind pack before opening the map.

For Day, compare against the locked reference whenever it is available in Git.

## Merge rule

Visual or architectural changes should land only after:
- deterministic CI/build checks,
- branch comparison deployment,
- blind visual sanity review when relevant,
- attribution after blind scoring,
- human/ChatGPT review of meaningful regressions and tradeoffs.

Commit existence is not product acceptance.
