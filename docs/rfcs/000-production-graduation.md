# RFC-000 — Production graduation gate

**Status:** ACTIVE  
**Tracking:** #41; #43 is a stabilization dependency  
**Design authority:** current plate-first Quackles

## Decision

Do not change the base product architecture yet. The current experience must become a clean, reproducible production control before post-production rendering research can influence the default site.

## Required closure

#41 owns the detailed ledger. Graduation requires reference-quality authored scenes/materials; stable source-family selection; reversible `INSPECT -> JUMP -> EXPLODE -> REASSEMBLE -> SIM`; deterministic simulator handoff; bounded deep zoom with no blank/stale/mid-motion promotion; physical-device acceptance; exact deployed-SHA verification; and current docs/evidence.

## Freeze

While this RFC is active: `nightly` remains the production line; #42 and RFC-004/005 are not production rewrites; do not scale a new renderer across themes; do not replace the HQ robot with a proxy; do not grant 1GP authority merely because it is larger.

## Exit

Close #41 only with an exact-head production receipt. That build becomes the control against which the magic programme is judged.
