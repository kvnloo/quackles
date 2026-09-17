# Water (feat/water only)

Stay on `feat/water`. Do not merge to `nightly` or `nightly-source` until a human says so.

`scripts/blender/add_water_plane.py` adds a refractive pool under the plinth, marks the mesh as a Cycles MNEE caustic caster, and the plinth/floor as receivers. It does not run in CI.

Process: one class per render (water geom XOR MNEE flags XOR sun). 12 GB GPU: MNEE + 48 samples, not 200MP.
