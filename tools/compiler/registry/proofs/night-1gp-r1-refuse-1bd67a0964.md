# REFUSE: night-1gp-r1 (night, gp-1gp)

**Promotion refused.**

- plate-vs-master: ['cell [0, 0] dE 44.341 > 10.0 (localized divergence, review)', 'cell [1, 0] dE 38.627 > 10.0 (localized divergence, review)', 'cell [2, 0] dE 33.346 > 10.0 (localized divergence, review)', 'cell [0, 1] dE 44.585 > 10.0 (localized divergence, review)', 'cell [1, 1] dE 29.791 > 10.0 (localized divergence, review)', 'cell [2, 1] dE 34.698 > 10.0 (localized divergence, review)', 'cell [0, 2] dE 33.179 > 10.0 (localized divergence, review)', 'cell [1, 2] dE 24.243 > 10.0 (localized divergence, review)', 'cell [2, 2] dE 31.505 > 10.0 (localized divergence, review)', 'cell [0, 3] dE 19.349 > 10.0 (localized divergence, review)', 'cell [1, 3] dE 16.619 > 10.0 (localized divergence, review)', 'cell [2, 3] dE 16.901 > 10.0 (localized divergence, review)']

## Master provenance

- identity: `65f506a6d2c9e699ddcdca8eb8ecdb568e8a374a44c3dd927b597f7e4ffdd4e3` (chunked, 25820x38730)
- source: `/mnt/zer0models/quackles-1gp/night/chunks`
- recipe: `render_1gp.py`
- blend: `/mnt/zer0models/home-offload/kvn/offload-2026-09-21/Documents-Codex/2026-09-16/c/work/calibration/quality-final-white.blend` sha `7b9f0b6dc09542b281d25d52129b6a9c892e8d9639da48403b98de2700e42421`
- edits: — sha —
- renderer: `{'samples': 16, 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti']}`

## Inputs

- plate @repo/public/preview-scene/sequence/cinematic-proof-v2/night/p0000000-1024.webp sha `0bdcc8f84e36b146` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/night/p0000000/gp sha `2d41a25496ea1e56` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | **FAIL** | full dE 30.599, dL -18.791, shift [-0.67, -0.02] px, edge 0.2041; worst cell dE 44.585 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=0.972 dL<=0.2; 1->2 dE<=0.544 dL<=0.016; 2->3 dE<=0.714 dL<=0.035; 3->4 dE<=0.771 dL<=0.049 |

## Notes

- plate-vs-master: cell [0, 0] dE 44.341 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 0] dE 38.627 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 0] dE 33.346 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 1] dE 44.585 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 1] dE 29.791 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 1] dE 34.698 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 2] dE 33.179 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 2] dE 24.243 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 2] dE 31.505 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 3] dE 19.349 > 10.0 (localized divergence, review)
- plate-vs-master: cell [1, 3] dE 16.619 > 10.0 (localized divergence, review)
- plate-vs-master: cell [2, 3] dE 16.901 > 10.0 (localized divergence, review)

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `2f3df59d7ebcdc8ce126bd4dc8367146a219dbf2`, 2026-10-01T00:26:22+00:00
