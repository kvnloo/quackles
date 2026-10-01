# ACCEPT: blue-201mp (blue, legacy-201mp)

## Master provenance

- identity: `f8741314b53f9cda63128dde769e88efb0165987a1bcb8377a48b64a548b6f7c` (single, 11584x17376)
- source: `/mnt/zer0models/quackles-200mp/blue-p0-200mp.png`
- recipe: `blender/render_blue_200mp.py@72b0786`
- blend: `/mnt/zer0models/home-offload/kvn/offload-2026-09-21/Documents-Codex/2026-09-16/c/work/calibration/quality-final-cobalt.blend` sha `2e4535af8943c264c9834e05e15bf07b20c1dfe9ab2a2dd9195001d4c8ca706e`
- edits: — sha —
- renderer: `{'engine': 'CYCLES', 'device': 'GPU+CPU', 'devices': ['CPU:Intel Core i9-10900KF CPU @ 3.70GHz', 'OPTIX:NVIDIA GeForce RTX 3080 Ti'], 'samples': 16, 'tiles': '2x2-crop', 'seconds': 1730.0895943420473, 'robot_mesh_hash': 'a81d06107f23d84afb65f99403b8bea27f82df697ac94a8e47ac16258820b38a'}`

## Inputs

- plate @repo/public/preview-scene/sequence/cinematic-proof-v2/blue/p0000000-1024.webp sha `05dbf7c61873d604` status claimed
- pyramid /mnt/zer0models/quackles-1gp/assets-repo/blue/p0000000 sha `04a6e691b4c896d1` status claimed

## Checks

| check | result | key metrics |
|---|---|---|
| master-integrity | pass |  |
| provenance | pass |  |
| one-family | pass |  |
| plate-vs-master | pass | full dE 4.929, dL -0.893, shift [0.0, 0.0] px, edge 0.8882; worst cell dE 20.171 |
| pyramid-geometry | pass |  |
| pyramid-level0 | pass | worst sampled tile dE 0.0 (6 tiles) |
| pyramid-nesting | pass | 0->1 dE<=1.179 dL<=0.211; 1->2 dE<=1.409 dL<=0.153; 2->3 dE<=1.167 dL<=0.143 |

## Notes

- plate-vs-master: cell [2, 0] dE 14.366 > 10.0 (localized divergence, review)
- plate-vs-master: cell [0, 3] dE 20.171 > 10.0 (localized divergence, review)

Contract: {'plate_dE_max': 5.0, 'plate_abs_dL_max': 3.0, 'plate_shift_px_max': 1.0, 'plate_aspect_tol': 0.005, 'cell_dE_report': 10.0, 'level0_dE_max': 1.0, 'nest_dE_max': 2.5, 'nest_abs_dL_max': 1.0, 'nest_reduce': 4, 'nest_shift_px_max': 0.5, 'shift_min_luma_std': 4.0, 'compare_width': 384}
Tool head: `74ea4ef8278f423814956c8213256b654ed80602`, 2026-10-01T00:42:09+00:00
