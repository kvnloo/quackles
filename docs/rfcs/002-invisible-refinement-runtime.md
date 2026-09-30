# RFC-002 — Perceptually invisible refinement runtime

**Status:** POST-PRODUCTION / BLOCKED BY RFC-000  
**Tracking:** #45  
**Depends on:** RFC-001

## Product contract

The user perceives only `same correct image -> sharper correct image`. Loading is never a visible state.

```text
MOVING
-> SEMANTIC_SETTLE
-> FINAL_GENERATION_READY
-> FOCUS_ACQUIRE
-> ATOMIC_PUBLISH
-> SHARP_LOCK
```

Treat `fetch -> persistent compressed cache -> decode -> staging -> GPU upload -> GPU residency -> visual publication` as separate measured budgets.

## Experiments

- 256 / 512 / 1024 tile sweep
- browser-native decode vs worker `ImageDecoder` / WebCodecs
- selected-source intent-aware warm-up
- pointer, scroll and authored-shot prediction
- stale fetch/decode/upload rejection
- byte-bounded decoded cache
- fixed GPU atlas/page IDs only if measurements justify it
- HTTP cache vs revisioned CacheStorage on repeat visits

## Contracts

Last correct visual remains visible; camera motion owns the budget; no upward refinement publication during motion; stale generations never affect pixels; no top-tier eager warm-up; no blank/partial publication.

## References

- https://www.w3.org/TR/webcodecs/
- https://openseadragon.github.io/examples/tilesource-dzi/
- https://www.rfc-editor.org/rfc/rfc9110.html

## Keep gate

Improve a meaningful Pareto dimension without regressing first frame, interaction tails, continuity, memory, wasted bytes or time-to-sharp.
