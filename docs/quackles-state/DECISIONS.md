# DECISIONS (append-only)
- D1 (2026-09-30, owner): Blue canonical inspection source = accepted 201MP legacy family. The 1024 plate is a diagnostic reference, not an authority. Hands-poster plate-vs-201MP discrepancy is NOT a blocker.
- D2 (2026-09-30, owner): Frozen Blue contracts — dE<=5 vs accepted source; |dL|<=3; exactly one source family per session; zero HQ requests before first paint; real-hardware frame targets stay OBSERVE until measured on suitable hardware. Never weaken silently.
- D3: 1GP Blue = candidate-1gp/off (dE 35-83 vs control). Assets retained.
- D4: Non-Blue themes currently have only 1GP; status stays production-1gp (unaudited) until the all-five sheet marks each production/candidate/disabled.
- D5 (2026-09-30, engineer): all-five audit applied under D2 — Blue=legacy-201mp production; Day=candidate-1gp (plinth dE16); White/Dark/Night=disabled (visibly different scenes). Only production-* serves tiles; candidates opt in via ?inspectionCandidates=1 (A/B only). Reversible one-line policy edit.
- D6 (2026-09-30, owner rule restated 3x; engineer implements): tier promotion is a settle-time event. While the camera is moving the requested detail tier never rises above the painted tier (or the plate if none). Coverage-escape repaints at the same/lower tier are allowed. Verified by fling-stress-browser (promotionsWhileMoving == 0).
