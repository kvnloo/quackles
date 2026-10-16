# Q1 unit-test matrix

The Q1 regression checks (`scripts/sequence-contracts.mjs` as committed in C `1b637ed1`) were run against each arm's `lib/sequence/cache.ts`. These are deterministic fixtures: fetch, CacheStorage and bitmaps are mocked, and no browser runs.

- A (v1 `6f2ef5d2`) only accepts bare URLs, so it is run with `Q1_LEGACY_RETAIN=1`.
- On A and B, the existing check "serialize high detail work and count decode reservations" fails by design. That check, as adjusted in C, expects the over-budget equal-priority remainder to wait (`stats().deferred === 2`), and A and B have no `deferred` stat. On its own pre-Q1 version, each arm passes it.
- Each `<arm>.json` is the full report, including per-check evidence such as decode counts and the max decoded + reserved bytes.
