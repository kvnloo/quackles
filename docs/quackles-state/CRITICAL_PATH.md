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

## S+ PROGRAMME (owner directive 2026-09-30: keep working autonomously, push to nightly per milestone, owner steers occasionally)
Operating loop per milestone: orient -> reproduce+measure -> RED test -> smallest fix -> focused+full regression -> real-browser E2E -> visual/network/memory evidence -> BLIND + adversarial verifier -> fix findings -> commit -> push nightly (fast-forward only; never main/dev; never force) -> verify LIVE -> receipt -> next.
Status (nightly = f046dcd+; live deploy BLOCKED: repo var PAGES_RUNNER=self-hosted, no runner online; deploy for c2d84b6 worked earlier):
- M1 DONE: Blue source integrity, no blank/stale, settle-time promotion, request budget, underlay, warm-up.
- M2 DONE: Day hero denoise (noise-only fix, blind-verified); noise contract now covers all 5 themes (80 plates; only Day hero was noisy).
- M3 DONE (verifiers #5/#6 in flight): camera placement no longer pixel-snapped (path spread 4.92->0.63 px); lock dissolve 160ms. Open: plate<->master registration (asset-level), camera settles ~0.0008 focus short of target.
- M4 DONE (characterization): CDP multi-touch pinch/pan/held/gesture-conflict all pass. Open D11 (fractional resting theme after swipe).
- M5 characterized: scroll story solid (0 blank, monotonic, reversible). SIM not mounted (#41 item 4).
- M6 DONE: UI chrome 0 px deviation, CLS 0; viewfinder deliberate 1.5% scale.
- M7 DONE (forced hints, not device): profiles/budgets/authored composition identical/lifecycle.
- M8 DONE: Lighthouse 100x4 (desktop+mobile), LCP 131ms/CLS 0 under mobile emu.
- M10 partial: README refreshed + docs/INSPECTION.md; simulator docs untouched.
Next candidates (need owner steer or big cost): M9 simulator handoff contract; deep-zoom sources for Day/White/Dark/Night (would need new 201MP-class renders + hosting = large/irreversible, owner OK first); D8/D11 decisions; PAGES_RUNNER; real-device evidence.

## LESSONS / STANDING REGRESSION SET (added 2026-09-30)
Two of my own fixes regressed and were caught only by independent/adversarial measurement: (1) transform placement broke on container resize (fixed 077d8a9), (2) snapping camera arrival at the loose tolerance popped 5 px in the last frame (fixed 36dfbc4). Standing set to run before EVERY push: blank-frame, fling, wheel, touch, scroll-state, theme-zoom, theme-switch-stale, inspection-source, warm-idle, lock-fade, resize-placement, camera-arrival, profiles + all Node contracts + `camera-paths`/`camera-coherence.py` (gate <=1.0 px) when camera/placement code changes. Prefer adversarial verification BEFORE pushing camera/placement/render changes (deploy is currently blocked so nothing reached users).
Status update: camera final = two-stage arrival, exact-converge, resize-safe, dissolve-on-lock. Verifier #7 (adversarial on 077d8a9/36dfbc4) in flight.

UPDATE: CI `verify` (test:inspection:static on GitHub-hosted runners) green on nightly since 00628f4; only `pages` deploy is blocked (PAGES_RUNNER=self-hosted, 0 runners).

## OVERNIGHT PLAN (owner directive 2026-09-30 night: "match the REFERENCE images precisely; fix Blender scenes; GP experiments; lift existing pieces from branches/history; surgical polish; parallel experiments; fix every issue ever described")
Findings so far:
- Scene audit (overnight/scene-audit): Day theme is TWO scenes: hero p0000000 = 2026-09-25 gloss-split recipe (light grey wall), poses p0080000..p1000000 = 2026-09-16 recipe (dark-brown wall, cream sandstone). Reference Day = dark charcoal wall + grey stone + BLUE contour print on the robot shell. All shipped robots print the shell contour black (every reference shows blue). Night hero near-black vs reference dim-readable scene.
- 1GP masters (quackles-1gp/render_1gp.py) used the canonical-set theme code (clean 6b7eeb1 / dirty day-fix) which renders white/blue/dark/night as the SAME grey studio -> the "wrong scene" 1GP. Donor blends quality-final-{white,cobalt,dark}.blend per theme restore themed looks (and the blue shell print) but are not yet reference-matched.
- GP render cost: 1536^2 crop at 1GP scale = ~7 s @16spp GPU-only -> full 1GP ~1 h/theme (old hybrid CPU+GPU 5x5 chunks took ~2 h). Denoise/spp/seam experiment: overnight/gp-exp.
Lanes running (archaeology): branches/lift-list, scene/reference-match, camera/scroll/story, simulator+haptics, requirements ledger (local-only).
Integration order: (1) per-theme reference-matched scene recipes -> 16 poses x 5 themes at 1024 denoised (consistency test per theme) -> ship; (2) GP masters from the SAME recipes (correct donor, denoised, seam-safe) -> pyramids -> source policy production-1gp per theme only after the frozen contract (dE<=5 vs accepted plate) passes; (3) camera/story/sim lifts from the lift lists, each behind the standing regression set; (4) ledger sweep: every requirement -> status + evidence.

## STATUS 2026-09-30 late (nightly 64c200f)
Shipped since the overnight plan:
- Scenes: all 5 themes x 36 plates from per-theme reference-matched recipes (D16); one follow-cam path (D15 resolved); Day pitted stone (3 blind critic rounds, 4/10 -> 5.5-6/10); dense plates in the fast camera spans (worst pair diff Blue 73 -> 52).
- Scroll/zoom (scripts/scroll-feel-browser.mjs): hero gesture latch (carry-over zoom 14.6x -> 1.0), two-stage smoothing (roughness 0.114 -> 0.014), resize keeps progress, true zoom reversal.
- Theme store never indexes out of range (fixed intermittent 'reading filter' page error).
- Haptics: forward-only once-per-crossing, touch-only, opt-out; dormant audio deleted.
- Poster: Hermes structure, links, /process; legible hints on every plate.
- Simulator: native MuJoCo/ONNX behind ?sim=1 (lazy, flag-off +1.2 KB gzip, 0 sim requests). Blocked from default-on by visual parity (robot dE 32-44) -> lane sim-parity running.
Open owner decisions: D8, D11, D14, D17 (Night brief), D18 (print colour). Not possible here: physical-device acceptance (#41 item).
Next: sim parity; explode-span 0.01 plates; stone vein web + Dark/White pored plinths; GP masters from the final recipes (RFC-001 / #44).
