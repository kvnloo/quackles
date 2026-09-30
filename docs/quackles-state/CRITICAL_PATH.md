# CRITICAL_PATH (durable state — update every slice)
head: 64c1789 on fix/41-day-material-fidelity (pushed) · base nightly c2d84b6
worktrees: wt-day (work) · wt-base (clean baseline c2d84b6, out/ built) · wt-exp (scratch build; removable)
evidence: /mnt/zer0models/project-artifacts/quackles/issue-43-evidence/ 
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

- D6 settle-time promotion (fling 166->34 req, 0 promotions while moving; wheel: sharp lock ~= baseline, blank 18->0); hidden mushroom policy; as-deployed-config build + live-baseline receipts
- z2/z4 D6-vs-pre parity diffs explained by ground truth (D6 closer)

## active hypothesis / next three
1. minor pre-existing: no downgrade repaint after zoom-out (oversized tier stays painted) -> small TDD fix; held-touch pan untested (needs device)
2. Day (H): cause of plinth fine-scale excess ESTABLISHED = render noise (denoising OFF) (D10). BLOCKED on recovering the exact invocation of the shipped Day look (4 recipes tried, none match); leads in FINDINGS.md. Then: same scene + --denoise/higher spp, validate with day-stone/1.0.0 on held-out phases. No Day thresholds frozen (proposal in FINDINGS)
3. #41 items 3-5 after Blue is stable: reversible state machine acceptance, simulator handoff, docs cleanup; real-device OBSERVE
posted: receipts on #43 (slices 1-2 and 3-6, head e84d009); #41 progress comment (older)
