# RFC-004 — Registered Cycles anchor handoff

**Status:** FUTURE CHALLENGER / BLOCKED BY RFC-000 + RFC-003  
**Tracking:** #46

## Hypothesis

Use real-time 3D for motion, then transition into an exact Cycles inspection source at a few authored hero/macro anchors.

```text
real-time scene
-> approach anchor
-> registration threshold
-> depth/world-position assisted reprojection
-> exact Cycles inspection
```

Because Blender owns camera, depth and world-position ground truth, test this as a measurable registration problem.

## Kill gate

Reject if blind A/B exposes the transition, camera freedom feels artificially constrained, reversibility breaks, or virtual-textured real-time materials get close enough that the special path is not worth its complexity.
