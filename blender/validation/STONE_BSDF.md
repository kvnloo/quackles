# Day stone BSDF contribution diagnostic

Local diagnostic only. No production material, texture, camera, geometry, light,
world, compositor, scene file, preference or deployed-asset edits are performed.
Load current source from the pinned base in an isolated worktree. Never infer a
production shader adjustment merely from a leave-one-out image.

## Capture and algebra

`render_stone_bsdf.py` performs one CPU4 Cycles crop (470x140 inside the pinned
1024x1536 camera, 256 samples, seed 1729, no denoising/adaptive sampling). It calls
real ViewLayer `use_pass_diffuse_*`, `use_pass_glossy_*`, transmission, emission,
environment and Cycles volume pass properties. It retains the donor compositor.

Blender 5.2 API details verified by execution:

- Set `image_settings.media_type = 'MULTI_LAYER_IMAGE'` before assigning
  `file_format = 'OPEN_EXR_MULTILAYER'`. Use 32-bit ZIP and interleaved channels
  for this explicit reader; do not silently treat the first multipart image as
  the complete pass set.
- EXR channels use full names such as `ViewLayer.Diffuse Direct.R`, not guessed
  `DiffDir` abbreviations. The reader selects an exact layer and exact channels.
- The actual compositor is `scene.compositing_node_group`; `scene.node_tree`
  misses it. Preserve and export Composite separately from ViewLayer Combined.
- `view_layer.update()` settles newly created light/object transforms before
  pre/post render locks. Keep the unresolved legacy snapshot as separate
  provenance; do not filter out matrix changes or add a tolerance.
- JSON-round-trip graph comparisons need canonical serialization because live
  tuples become JSON lists. Only the verified worktree-root relocation is
  allowed; all source image bytes are compared before relocating paths.

Scene-linear radiance reconstruction is:

```
Diffuse Color * (Diffuse Direct + Diffuse Indirect)
+ Glossy Color * (Glossy Direct + Glossy Indirect)
+ Transmission Color * (Transmission Direct + Transmission Indirect)
+ Emission + Environment + Volume Direct + Volume Indirect
```

These terms reconstruct **ViewLayer Combined**, not a nonlinear display sum or
an arbitrary compositor. Current stone subsurface, transmission, coat, sheen
and emission weights are zero; transmission, emission, visible environment and
volume outputs are retained as measured zero controls, not assumed missing.
An Environment pass of zero does not mean there is no world illumination.
Direct is not synonymous with sun; indirect is not synonymous with world.

`prepare_stone_bsdf.py` preserves actual raw passes, weights the lighting passes
by their own colors in float64, and writes float32 isolated terms and linear
leave-one-out arrays. It retains the float64 reconstruction residual separately.
`without-*` is pixel contribution removal, **not a physically rerendered shader**:
changing a Principled control can redistribute energy and cannot be inferred
from a subtraction alone. Color passes include closure weights; Diffuse Color
is not asserted to equal pre-print unit-emission albedo.

## Measurement and display contract

The prior `day-stone/1.0.0` shared mask is read and hash-checked unchanged:
`4e4ea9cb0b036c094b98c80e6b441e8abc6bc3e997c89cf9ea3ad77cca132468`;
58,152 valid pixels. Never regenerate it using dim or decolored pass images.
The original fixed plane-fit, -14 residual threshold, connectivity, component
boundary treatment and spatial units remain unchanged in both documented signal
domains. There is no linearized reference or aesthetic tolerance. Dim pass
component counts can vanish because the threshold is absolute. P95, gradient
energy ratios and display chromaticities are not additive.

`display_stone_bsdf.py` uses actual Blender image export with the captured
Khronos PBR Neutral / None / exposure 0 / gamma 1 / sRGB configuration. All
arrays use the same conversion, no gain, exposure normalization or new grade.
The legacy PNGs are retained separately. Test generated-image PNG roundtrips:
`save_render` is not guaranteed to match a rendered PNG bit-for-bit even when
scene view settings match. Keep exact failures and raw deltas; do not silently
relax the assertion. The current run observed one-code-value differences.

`measure_stone_bsdf.py` reuses the existing tested measurement contract and emits
full linear/display receipts, planes, overlays, native side-by-sides and a
fixed-axis diagnostic graph. Use linear ratio-of-channel-means for energy/color
attribution; near-black standalone display pass colors can be misleading.
`verify_stone_bsdf.py` reads back hashes, current source, pass reconstruction and
raw exact-control records. Its default success means evidence integrity, **not
bit-exact reconstruction or visual parity**. The three `--require-*-exact`
options retain nonzero exits for the actual observed failures.

## Reproduce

With `W` the isolated worktree, `E` a new outside-Git evidence root, `P` the
prior visual-measurement root and `PY` the existing calibration SciPy/OIIO venv:

```sh
# Existing directories are refused; never overwrite another evidence run.
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python "$W/blender/validation/render_stone_bsdf.py" -- \
  --donor "$DONOR" --donor-sha256 "$DONOR_SHA256" \
  --prior "$P/current-render/render-receipt.json" \
  --ocio-config /usr/share/blender/5.2/datafiles/colormanagement/config.ocio \
  --out "$E/render"
"$PY" -B blender/validation/prepare_stone_bsdf.py --render "$E/render" --prior "$P" --out "$E/prepared"
blender --background --factory-startup --threads 4 --python-exit-code 1 \
  --python "$W/blender/validation/display_stone_bsdf.py" -- --prepared "$E/prepared" --out "$E/display"
"$PY" -B blender/validation/measure_stone_bsdf.py --prepared "$E/prepared" --display "$E/display" --out "$E/measurements"
"$PY" -B blender/validation/verify_stone_bsdf.py --root "$E"
STONE_BSDF_OUTPUT="$E" OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
  "$PY" -B -m unittest discover -s blender/validation -p 'test_stone_bsdf_*.py' -v
```

The completed run's `RESULTS.md`, `SUMMARY.json`, `commands.json` and `logs/`
retain literal commands, actual exits, failures, image/graph hashes and findings.
The scripts assume trusted local receipts and are not an authenticity system.
Single-ROI, single-seed ablations do not separate Monte Carlo variance from
converged spatial irradiance, identify the contributing emitter, establish
held-out phases, or prove artistic acceptance.
