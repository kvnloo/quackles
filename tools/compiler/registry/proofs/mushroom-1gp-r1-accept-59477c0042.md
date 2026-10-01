# ACCEPT: mushroom-1gp-r1 (mushroom, gp-1gp)

## Master provenance

- identity: `9be1cdcf76f58619001fd1284d95d4a107b7aa4d561d23531fb925f68fcb1db6` (chunked, 25820x38730)
- source: `/mnt/zer0models/quackles-1gp/mushroom/chunks`
- recipe: `render_1gp.py`
- blend: `/mnt/zer0models/project-artifacts/quackles/night-mushroom-rsi/rounds/r03/scene.blend` sha `fcdddb49f3baa23f57b4c738d4c9efec063b8206fe30eb593a2a443b411b6a84`
- edits: — sha —
- renderer: `{'samples': 16, 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti']}`

## Inputs

- plate @repo/public/preview-scene/sequence/hidden/night-moss.png sha `9c1f10a930379e32` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/mushroom/p0000000/gp sha `d08ab98f7239bf77` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | pass | full dE 0.885, dL 0.259, shift [0.0, 0.0] px, edge 0.9829; worst cell dE 2.115 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=1.043 dL<=0.047; 1->2 dE<=0.651 dL<=0.026; 2->3 dE<=0.881 dL<=0.03; 3->4 dE<=0.79 dL<=0.028 |

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `2f3df59d7ebcdc8ce126bd4dc8367146a219dbf2`, 2026-10-01T00:25:40+00:00
