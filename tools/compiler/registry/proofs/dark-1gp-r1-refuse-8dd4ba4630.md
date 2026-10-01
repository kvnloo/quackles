# REFUSE: dark-1gp-r1 (dark, gp-1gp)

**Promotion refused.**

- plate-vs-master: ['cell [0, 0] dE 41.281 > 10.0 (localized divergence, review)', 'cell [1, 0] dE 35.794 > 10.0 (localized divergence, review)', 'cell [2, 0] dE 17.373 > 10.0 (localized divergence, review)', 'cell [0, 1] dE 41.567 > 10.0 (localized divergence, review)', 'cell [1, 1] dE 26.012 > 10.0 (localized divergence, review)', 'cell [2, 1] dE 20.975 > 10.0 (localized divergence, review)', 'cell [0, 2] dE 30.688 > 10.0 (localized divergence, review)', 'cell [1, 2] dE 24.156 > 10.0 (localized divergence, review)', 'cell [2, 2] dE 31.316 > 10.0 (localized divergence, review)', 'cell [0, 3] dE 27.177 > 10.0 (localized divergence, review)', 'cell [1, 3] dE 20.627 > 10.0 (localized divergence, review)', 'cell [2, 3] dE 20.827 > 10.0 (localized divergence, review)']

## Master provenance

- identity: `a6cfb2f24ed42077c7ed6ad760447052cf2ea917aa9b6d59c3255098dcdb5e0d` (chunked, 25820x38730)
- source: `/mnt/zer0models/quackles-1gp/dark/chunks`
- recipe: `render_1gp.py`
- blend: `/mnt/zer0models/home-offload/kvn/offload-2026-09-21/Documents-Codex/2026-09-16/c/work/calibration/quality-final-white.blend` sha `7b9f0b6dc09542b281d25d52129b6a9c892e8d9639da48403b98de2700e42421`
- edits: — sha —
- renderer: `{'samples': 16, 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti']}`

## Inputs

- plate @repo/public/preview-scene/sequence/cinematic-proof-v2/dark/p0000000-1024.webp sha `d7501ed015ae4ed3` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/dark/p0000000/gp sha `d3a9a16d292ef547` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | **FAIL** | full dE 28.149, dL -9.378, shift [0.02, 0.01] px, edge 0.5358; worst cell dE 41.567 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=1.085 dL<=0.061; 1->2 dE<=0.516 dL<=0.034; 2->3 dE<=0.878 dL<=0.038; 3->4 dE<=0.764 dL<=0.047 |

## Notes

- plate-vs-master: cell [0, 0] dE 41.281 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 0] dE 35.794 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 0] dE 17.373 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 1] dE 41.567 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 1] dE 26.012 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 1] dE 20.975 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 2] dE 30.688 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 2] dE 24.156 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 2] dE 31.316 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 3] dE 27.177 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 3] dE 20.627 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 3] dE 20.827 > 10.0 (localized divergence, review)

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `2f3df59d7ebcdc8ce126bd4dc8367146a219dbf2`, 2026-10-01T00:26:13+00:00
