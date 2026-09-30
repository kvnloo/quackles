# CRITICAL_PATH (durable state — update every slice)
head: see `git log -1` on fix/41-day-material-fidelity (last pushed abf9d60 + uncommitted slice 4 in progress) · base nightly c2d84b6
worktrees: wt-day (work) · wt-base (clean baseline c2d84b6, out/ built) · wt-exp (scratch build; removable)
evidence: /mnt/zer0models/project-artifacts/quackles/issue-43-evidence/  · z0: /home/kvn/zer0/z0-quackles (orient/verify; claims.json)
frozen: DECISIONS.md D1-D2. canonical: Blue=legacy-201mp. Day=candidate-1gp, White/Dark/Night=disabled (D5).

## completed
- #43 source-family policy (one family/theme); Blue=201MP; candidates opt-in via ?inspectionCandidates=1
- warm-up: idle-only, bounded, no top tier (idle req 311->12)
- Blue audit matrix + all-five contact sheet; perf traces
- fix: blank hero / stale Blue detail on tile-less themes (base hidden only if detail painted; detail released on theme-set change)
- fix: theme swipe while zoomed no longer held for tile-less target theme (themeDetailReady)
- fix: crossfade Blue<->tile-less theme no longer paints Blue detail at alpha 1 (tiled check, not length)
- perf: sharpPlan ring off (88 -> ~50 interactive requests, visual parity within noise floor; z8 verified vs ground truth)
- independent verifier pass #1 (slice 3): no blank/stale defects; found egg/mushroom bypass + test gap (both handled/queued)
- tests added: inspection-source, warm-plan, request-budget, synced-theme contracts; browsers: source, warm-idle, theme-zoom, theme-switch-stale, blank-frame (per-frame), perf-trace, visual-parity

## known baseline failures (separate track)
- test:inspection:static -> "viewfinder copied the base canvas on camera frames" (reproduces on c2d84b6)

## OBSERVE (unresolved)
- real-hardware frame targets (worst<=25ms, 0 >50ms): headless is vsync-quantized; no ADB device
- physical S25/120Hz; deployed-build verification (F)
- hands-poster plate-vs-201MP: NOT a blocker (D1); 201MP bust-poster top banding artefact = asset defect, logged

## active hypothesis / next three
1. commit+push slice 4 (theme-hold + crossfade fixes, blank-frame E2E); rerun full regression (in progress)
2. mushroom/egg 1GP pyramid bypasses inspection policy -> add to policy + audit its family vs authored look
3. F: verify built/deployed (GitHub Pages nightly URL) -> then G Blue perf/render defects -> H Day (harness ca62d53 kept; recovered f85df1a/3dc142a/0f42a30 available as hist/* refs)
