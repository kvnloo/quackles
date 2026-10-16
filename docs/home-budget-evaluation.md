# Repair 7 home evaluation (local-only; not admitted)

## Scope

The overnight D-D6 decision permits experiments, not blanket adoption. `perf/motion-decode-eval` forward-ports the existing motion-decode line to the site integration. `perf/home-frame-budget` owns the independent I18 upload-budget experiment. Neither changes camera/art/zoom limits or publishes anything.

## Motion-decode hypothesis

The moving decode queue can evict resident tiles even though it admits only one decoder. That trades useful residency for moving work and creates re-decodes. The new executable contract fills a two-tile cache, allows a third moving decode, and requires existing tiles to remain resident until settlement. RED: one eviction. GREEN: zero moving evictions and one settled eviction, with normal progress retained.

The guard uses spare decoded capacity only during motion. This is an experiment, **not a successful D-D6 fix**: the matched local replay reduced re-decodes and long frames but lost the HQ p90 advantage. Do not merge it as a win.

## I18 hypothesis

The existing renderer drains detail until frameStart+6ms, underlay until +9ms and floor until +11ms. Each drain permits at least one upload even past its deadline. Separate drain allowances therefore do not form one frame budget.

The independent branch uses one shared +4ms deadline and at most one guaranteed upload across all surfaces after that deadline. Empty surfaces do not consume the progress allowance. Tests cover the common deadline, one-upload overrun and non-starvation. No resolution or cache budget is lowered. This bounds scheduling, not an individual browser upload's execution time.

## I16 measurement disagreement remains open

The existing verifier's `gp_metrics` derives I16 from **only the detail canvas's bounding rectangle and visibility** (`analyze.py`, lines 522–531). Its sampler does not capture the floor or underlay at all. The product intentionally retains a painted whole-image floor and underlay; the separate GP harness samples those layers and reports zero plate-edge/blank frames in the same builds, but uses a different input tape. Thus neither result proves the other wrong for an identical journey.

Do not stretch the detail canvas or change the old assertion to manufacture a pass. The next diagnostic must sample actual per-layer painted coverage on the **same** verifier journey, retaining the old I16 beside a versioned floor-aware result. I16 is not fixed or closed here.

## Evidence interpretation

Historical 1221.5→390.2ms HQ p90 was a single SwiftShader run. Repair 7 repeats both arms with chrome-headless-shell153.0.8010.12 and actual ANGLE/OpenGL hardware identity. Historical and new numbers are separate cohorts. Existing verifier I16–I19 retains its original 412×915/DPR2.625/CPU4/fast4g contract. The home frame-work experiment uses the unchanged v2 union analyzer with a separately named pinch/pan/wheel/theme input tape at390×844/DPR1/CPU4, not the lineage scroll-distance gate. No physical120Hz claim is possible.

Raw replay, verifier and home trace evidence is retained in the private performance lane under `repair7-*`. Final numbers and exact source identities are in that lane's READY and report. Any held candidate remains isolated; integration is not an experiment branch.
