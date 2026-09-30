# Inspection (deep zoom) — how it works and what is guaranteed

This is the current truth for the hero inspection path. Older 3-theme / R3F notes and the historical mixed 201 MP + 1 GP ladder are **superseded**; do not resurrect them.

## One authored source per theme
`lib/sequence/inspection-source.ts` holds `INSPECTION_POLICY`: per theme `{ selected, status, revision }`. Statuses: `production-201-250mp`, `production-1gp`, `candidate-1gp`, `disabled`. **Only `production-*` serves tiles.** Candidates serve only with `?inspectionCandidates=1` (A/B). The policy is applied once when the manifest loads, so a zoom session can never interleave two masters (issue #43). The selected source and revision are exposed in `window.__QUACKLES_SEQUENCE__.getState().inspectionSources` (including the hidden mushroom pyramid). To change a theme: edit `selected`/`status`, bump `revision`, run the contracts below.
Current verdicts (frozen contracts: dE <= 5, |dL| <= 3 against the accepted source; one family per session): Blue = 201 MP legacy family; Day = candidate (plinth diverges); White/Dark/Night = disabled (their 1 GP renders are visibly different scenes); mushroom egg = production 1 GP. Themes without a source are plate-limited (~1.7x zoom).

## Loading and promotion rules
- No HQ/DZI request before first paint + a settle delay; then bounded, selected-family-only warm-up of one lower tier (never the top tier).
- Requests are exactly the tiles covering the painted buffer (viewport + 40% margin); no extra ring unless a device profile opts in.
- **Tier promotion is a settle-time event**: while the camera moves the requested tier never rises above the painted tier (`requestedDetailWidth`). Never blank the current image; the base plate stays visible as a persistent underlay; detail is published atomically (all tiles decoded) and released when the visible theme set changes or when zoom no longer needs it.
- The detail canvas is placed with an integer layout box plus a transform (`detail-placement.ts`) because browsers pixel-snap box geometry before an ancestor zoom transform (a 0.5 css px snap became ~4 px at 8x).
- Sharp lock dissolves in over 160 ms on first appearance (instant under reduced motion) because the 1024 plate and the master are independent renders registered only to ~0.35 plate px.

## Guarantees and where they are tested (all `npm run …` unless noted)
Unit/contract (Node): `test:inspection-source`, `test:warm-plan`, `test:request-budget`, `test:synced-theme`, `test:motion-quality`, `test:wiring` (static guards), plus `node scripts/detail-placement-contracts.mjs`, `lock-fade-contracts.mjs`.
Real browser (desktop Chromium, not device evidence): `scripts/blank-frame-browser.mjs` (per-frame blank/stale), `fling-stress-browser.mjs`, `wheel-zoom-browser.mjs`, `touch-input-browser.mjs` (CDP multi-touch), `scroll-state-browser.mjs`, `ui-stability-browser.mjs`, `profile-browser.mjs`, `lock-fade-browser.mjs`, `theme-zoom/theme-switch-stale/inspection-source/warm-idle-browser.mjs`, and `scripts/inspection-audit/` (audit matrix, camera-coherence, lock-shift, perf-trace, visual-parity). Day plate noise/authored-look: `python3 -m unittest scripts/day-fidelity/*.py`.

## Known limits / open questions
- No physical-device evidence exists (no ADB device); frame-time targets (worst <= 25 ms, 0 frames > 50 ms) are unmeasured (headless is vsync-locked).
- A 1x horizontal swipe leaves the theme at a fractional blend (decision D11 open in `docs/quackles-state/DECISIONS.md`).
- Plate <-> 201 MP master registration (~0.35 plate px) and the 201 MP bust-poster banding are asset-level.
- `test:inspection:static` has a pre-existing later failure ("viewfinder copied the base canvas") on the clean baseline.
- Simulator handoff (issue #41 item 4) is not implemented in the landing path.
