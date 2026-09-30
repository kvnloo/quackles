# RFC-006 — Magical renderer graduation

**Status:** NORTH STAR  
**Tracking:** #48  
**Blocked by:** production graduation + evidence from RFC-001 through RFC-005

## Goal

Graduate only representations that make the experience feel simpler to the visitor.

```text
first frame      -> exact authored plate
hero inspection  -> canonical gigapixel pyramid
motion / orbit   -> resident real-time mesh
macro 3D         -> streamed virtual surface detail
special macro    -> optional exact Cycles anchor
appearance       -> optional proven neural/splat residual
low-end fallback -> canonical plate
```

The visitor never sees a renderer switch.

## Graduation laws

1. last correct visual remains visible
2. camera owns frame budget
3. resolution is not authority
4. one master owns one refinement hierarchy
5. stale work cannot affect pixels
6. heavy refinement cannot interrupt motion
7. Blender remains canonical unless evidence wins
8. HQ robot identity cannot degrade
9. spend offline compute to save visitor time
10. every representation beats a known control
11. representation switches are perceptually invisible

## Evidence

Graduation requires exact-head reproducibility, visual evidence, deterministic browser acceptance, physical-device traces, network/decode/GPU/memory receipts, forward/reverse interaction evidence and no regression to the production control.
