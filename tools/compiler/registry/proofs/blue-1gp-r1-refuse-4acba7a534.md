# REFUSE: blue-1gp-r1 (blue, gp-1gp)

**Promotion refused.**

- plate-vs-master: ['cell [0, 0] dE 106.529 > 10.0 (localized divergence, review)', 'cell [1, 0] dE 92.143 > 10.0 (localized divergence, review)', 'cell [2, 0] dE 43.393 > 10.0 (localized divergence, review)', 'cell [0, 1] dE 106.858 > 10.0 (localized divergence, review)', 'cell [1, 1] dE 44.047 > 10.0 (localized divergence, review)', 'cell [2, 1] dE 38.135 > 10.0 (localized divergence, review)', 'cell [0, 2] dE 76.226 > 10.0 (localized divergence, review)', 'cell [1, 2] dE 48.944 > 10.0 (localized divergence, review)', 'cell [2, 2] dE 71.199 > 10.0 (localized divergence, review)', 'cell [0, 3] dE 57.769 > 10.0 (localized divergence, review)', 'cell [1, 3] dE 56.237 > 10.0 (localized divergence, review)', 'cell [2, 3] dE 54.866 > 10.0 (localized divergence, review)']

## Master provenance

- identity: `e33b9847c04d86d15a3792364728c050fad49eb9e7eedc6d32c6168bb7e4c9eb` (chunked, 25820x38730)
- source: `/mnt/zer0models/quackles-1gp/blue/chunks`
- recipe: `render_1gp.py`
- blend: `/mnt/zer0models/home-offload/kvn/offload-2026-09-21/Documents-Codex/2026-09-16/c/work/calibration/quality-final-white.blend` sha `7b9f0b6dc09542b281d25d52129b6a9c892e8d9639da48403b98de2700e42421`
- edits: — sha —
- renderer: `{'samples': 16, 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti']}`

## Inputs

- plate @repo/public/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp sha `05dbf7c61873d604` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/blue/p0000000/gp sha `639b2d3670ed1920` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | **FAIL** | full dE 66.362, dL 4.48, shift [0.0, 0.01] px, edge 0.6373; worst cell dE 106.858 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=0.971 dL<=0.071; 1->2 dE<=0.892 dL<=0.034; 2->3 dE<=0.91 dL<=0.035; 3->4 dE<=0.819 dL<=0.057 |

## Notes

- plate-vs-master: cell [0, 0] dE 106.529 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 0] dE 92.143 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 0] dE 43.393 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 1] dE 106.858 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 1] dE 44.047 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 1] dE 38.135 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 2] dE 76.226 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 2] dE 48.944 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 2] dE 71.199 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 3] dE 57.769 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 3] dE 56.237 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 3] dE 54.866 > 10.0 (localized divergence, review)

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `74ea4ef8278f423814956c8213256b654ed80602`, 2026-10-01T00:40:37+00:00
