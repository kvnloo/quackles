# REFUSE: day-1gp-r1 (day, gp-1gp)

**Promotion refused.**

- plate-vs-master: ['cell [0, 0] dE 68.633 > 10.0 (localized divergence, review)', 'cell [1, 0] dE 63.101 > 10.0 (localized divergence, review)', 'cell [0, 1] dE 67.994 > 10.0 (localized divergence, review)', 'cell [1, 1] dE 29.481 > 10.0 (localized divergence, review)', 'cell [0, 2] dE 45.114 > 10.0 (localized divergence, review)', 'cell [1, 2] dE 29.499 > 10.0 (localized divergence, review)', 'cell [2, 2] dE 40.523 > 10.0 (localized divergence, review)', 'cell [0, 3] dE 30.002 > 10.0 (localized divergence, review)', 'cell [1, 3] dE 24.563 > 10.0 (localized divergence, review)', 'cell [2, 3] dE 23.933 > 10.0 (localized divergence, review)']

## Master provenance

- identity: `8510fc0310bad2d7caa5c2e2ce928471ab46f4e2c48ce6ad0e1dd46172f1786c` (chunked, 25820x38730)
- source: `/mnt/zer0models/quackles-1gp/day/chunks`
- recipe: `render_1gp.py`
- blend: `/mnt/zer0models/home-offload/kvn/offload-2026-09-21/Documents-Codex/2026-09-16/c/work/calibration/quality-final-white.blend` sha `7b9f0b6dc09542b281d25d52129b6a9c892e8d9639da48403b98de2700e42421`
- edits: — sha —
- renderer: `{'samples': 16, 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti']}`

## Inputs

- plate @repo/public/preview-scene/sequence/cinematic-proof-v2/day/p0000000-1024.webp sha `e29f6f7f35995607` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/day/p0000000/gp sha `55ba52cdfa3d2630` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | **FAIL** | full dE 36.312, dL -34.273, shift [0.0, 0.0] px, edge 0.754; worst cell dE 68.633 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=1.051 dL<=0.076; 1->2 dE<=0.901 dL<=0.034; 2->3 dE<=1.363 dL<=0.034; 3->4 dE<=1.123 dL<=0.054 |

## Notes

- plate-vs-master: cell [0, 0] dE 68.633 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 0] dE 63.101 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 1] dE 67.994 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 1] dE 29.481 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 2] dE 45.114 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 2] dE 29.499 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 2] dE 40.523 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 3] dE 30.002 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 3] dE 24.563 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 3] dE 23.933 > 10.0 (localized divergence, review)

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `2f3df59d7ebcdc8ce126bd4dc8367146a219dbf2`, 2026-10-01T00:25:49+00:00
