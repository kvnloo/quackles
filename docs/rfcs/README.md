# Quackles RFC progression

This directory records the progression from the **current production product** to the long-term magical Quackles experience.

## Prime directive

**Finish the current Quackles product before changing its base design.**

Issue #41 remains the production authority. Until #41 closes, `nightly` is optimized as the existing plate-first product. Post-production renderer experiments may be documented, but must not displace #41 or become the default path.

## Progression

| Stage | RFC / issue | Purpose | Promotion condition |
|---|---|---|---|
| 0 | [RFC-000](000-production-graduation.md) / #41 | Make current design production-ready | deployed + real-device + visual + state-machine acceptance |
| 0A | #43 | Source-family correctness / stable 201MP control | one source family; no mixed-master zoom |
| 1 | [RFC-001](001-canonical-1gp-compiler.md) / #44 | Build correct 1GP sources from one master | Blue beats accepted 201MP control |
| 2 | [RFC-002](002-invisible-refinement-runtime.md) / #45 | Make 1GP refinement perceptually invisible | continuity + latency + memory gates |
| 3 | [RFC-003](003-blue-realtime-3d-virtual-texture.md) / #42 | Blue real-time mesh + streamed surface detail | Blue vertical slice beats controls |
| 4 | [RFC-004](004-cycles-anchor-hybrid.md) / #46 | Optional exact-Cycles macro anchors inside 3D | handoff survives blind A/B |
| 5 | [RFC-005](005-gaussian-neural-challengers.md) / #47 | Splat/neural appearance challengers | wins meaningful Pareto dimension |
| 6 | [RFC-006](006-magical-renderer-graduation.md) / #48 | Graduate heterogeneous renderer | invisible switching + production evidence |

## Controls

- **A0:** accepted ~201/250MP Quackles experience.
- **A1:** future corrected canonical 1GP hierarchy.
- **B+:** real-time / virtual-texture / hybrid / neural challengers.

A new renderer does not win because it is newer. It must preserve or improve first-frame beauty, interaction, mobile behavior and macro fidelity while adding capability.

## Governing laws

1. Last correct visual stays visible until a better complete visual is ready.
2. Camera movement owns the frame budget.
3. Higher resolution does not imply higher authority.
4. One master owns one refinement hierarchy.
5. Stale asynchronous work never affects pixels.
6. Heavy refinement does not become visible during active motion.
7. Blender remains canonical unless evidence proves otherwise.
8. The HQ robot never becomes a visibly worse proxy.
9. Offline expense is acceptable; visitor-time expense is not.
10. Every new architecture must beat a known control.
11. Representation switches must be perceptually invisible.
