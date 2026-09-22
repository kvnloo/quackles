# Day stone measurement contract — `day-stone/1.0.0`

This is a replacement diagnostic definition, **not** reproduction of the later
historical masked receipts, recovered physical calibration, or reference parity.
The original older unmasked `measure_pores.py` remains untouched and is separately
regression-tested on the immutable Day image against `scalar-scores.json`.
No acceptance tolerances or artistic pass/fail are defined here.

## Input and signal domains

- Reference authority: `calibration/references/day.png`, SHA-256
  `1481b570e247a9420c39a634d9019142d3b03160d07d00cb9051dffcfca27891`.
- Native frame 1024×1536, top-left half-open ROI `(430,1365,900,1505)` =
  470×140. No resize, enhancement, inferred cropping, or color normalization.
- PNG is decoded RGB8. `display-rgb255` is display-encoded channel data;
  Y = .2126R + .7152G + .0722B is **display luma**, not radiometric luminance.
  Native renderer view/look/exposure/gamma remain fixed for the render pair.
- EXR is scene-linear RGB; top-left RGB float32 NPY is an equivalent diagnostic
  extraction. `scene-linear-rgb-times255` applies the identical math to 255×RGB,
  without clipping or transfer. Its -14 threshold therefore means -14/255
  scene-linear. Never mix display/linear tables or call lit reference reflectance.
  Reference has no known inverse scene/display transform; no scene-linear
  reference is invented.
- Pixel units are primary. `0.5403 mm/px` is **provisional convention only** at
  this native crop, not an established dimensional calibration. Diameters and
  spacing multiply pixels by it; area multiplies by its square. Pores/cm² uses
  valid area. Pixels/area counts are always retained.

## Exclusion and fitting

- Unmasked: all ROI pixels valid (explicit contamination control).
- Ink excluded: cast RGB to float first; exclude `(B-R >= 8) AND (B-G >= 4)
  AND (B > .36*(R+G+B))`, dilated once with a 5×5 all-one kernel, outside
  image false. Also exclude the leftmost 12 columns: known hands-print sliver
  plus guard. No erosion, threshold tuning, or recovered-mask claim.
- Shared ink excluded: intersection of all input display-image valid masks.
  **Use this identical domain for paired comparisons**, including emission
  before prints and scene-linear data. The input set is part of identity;
  changing it changes the common domain. Receipts save every mask and SHA.
- Color gating can remove blue noise or miss neutral/dim print fringes. Inspect
  overlays; it is not a semantic ink segmentation oracle. Spectra and boundary
  topology are mask-sensitive. Report unmasked and individual-mask sensitivity.
- Least squares rank-3 plane `ax + by + c`, coordinates integer pixel centers
  beginning at zero; fit only valid samples, subtract across full plane. No blur.

## Photometry and features

- Raw dark occupancy: strict `Y < 64` among valid pixels; not pore occupancy.
- Pore candidate: strict detrended `Y-plane < -14` AND valid. It is an image
  feature proxy, not a physical pore measurement.
- 8-connected components, no area cutoff. Keep truncated boundary components;
  separately count those touching ROI or an excluded pixel via an 8-neighbor
  domain erosion with outside invalid. No hidden border correction.
- Equivalent diameter `2 sqrt(area_px/pi)`, P50/P90/P95 using NumPy's linear
  quantiles. Nearest-centroid Euclidean neighbor spacing median is separate.
  Empty diameter/spacing and single-feature spacing are JSON null.
- Area bins `[1,5), [5,17), [17,33), [33,infinity)` pixels: count, area, fraction
  of all dark area and occupancy contribution. These are not historical mm bins.
- Anisotropy: mean squared adjacent horizontal residual differences / mean
  squared vertical differences. Only pairs with both endpoints valid. Zero or
  absent vertical energy => null; pair counts and both energies are retained.
- Density: 32×32 full tiles anchored at ROI top-left. Discard partial bottom/right
  tiles; keep full tiles only with >=75% valid coverage. Occupancy denominator is
  valid pixels, not rectangular area. Population variance (ddof=0), equal weight
  per retained tile. Retain all tile origins/counts/occupancies/use flags.
- Chromaticity: per-channel valid mean divided by sum of channel means (not mean
  per-pixel chromaticity). All-black gives null. This is encoded-RGB proportion
  for PNG, linear-RGB proportion for EXR, **not** CIE xy.
- Residual population SD and quantiles P1/P5/P50/P95/P99 accompany plane coefficients.

## Spectrum (new descriptive definition)

Fill excluded residual pixels with zero; multiply by separable Hann window; use
2-D FFT squared modulus. Radial wavelength in pixels, DC excluded. Bands are
`[2,4), [4,12), [12,32)` px; shares divide by all non-DC power; fine/mid is first
band / second. Mask edges can inject spectral power. This is **not** historical
`fine_mid`, the old physical-band CLI, an acceptance gate, or an unbiased spectrum.

## Pinned render protocol

Load a fresh immutable white donor for each of beauty, pre-print unit-emission,
and beauty-repeat. Run the isolated 3dc142a checkout's normal Day theme setup.
Do not apply motion: preserve the saved donor camera, as the historical stone
crop scripts did. Keep camera, transforms, maps, projection (6.2/6.2/8.8),
roughness connection, specular .20, normals, CreationMix/ink gate and lights
unchanged. Emit from the socket feeding CreationMix's stone input (not the
printed mix); only replace the stone material output in memory. Do not save a
modified blend. Use the same crop, CPU4, 256 fixed samples, seed, pixel filter,
denoising-off, and saved display transform. Export PNG and scene-linear EXR/NPY.
Separate `Plinth statement` geometry remains visible in emission; pre-print means
before the stone material's CreationMix, not deletion of every printed object.
Native graph/geometry/camera/lighting/source receipts and repeat deltas are
separate evidence from measurement math. Never substitute a stale saved PNG for
a newly executed render. No scale/light/pore/specular sweep is authorized here.

## Reproduction

Use the existing `calibration/venv/bin/python` (NumPy/SciPy/Pillow). System Python
may lack SciPy. From this isolated worktree:

```sh
C=/home/kvn/Documents/Codex/2026-09-16/c/work/calibration
P="$C/venv/bin/python"
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 "$P" -B -m unittest discover   -s blender/validation -p 'test_stone_contract.py' -v
STONE_TEST_WORK="${C%/calibration}" "$P" -B -m unittest discover   -s blender/validation -p 'test_stone_files.py' -v
"$P" -B blender/validation/measure_stone.py   --image "reference=$C/references/day.png"   --image 'candidate=/absolute/path/to/native-crop.png' --out /new/outside-git/folder
```

`measure_stone.py` refuses existing output directories. Unit fixtures establish
math only. Real-file tests prove crop provenance, no input changes, serialization,
and overwrite refusal—not aesthetic fidelity. See evidence `commands.json` for
actual executed commands, exits, TDD red/green records and renderer invocation.

## Repeat-control verification

`verify_stone_evidence.py` reads back hashes, preserved sources and actual decoded
repeat deltas. Its default exit 0 means reporting/provenance succeeded, **not**
bit-exact linear equality. `--require-linear-exact` adds that explicit gate and
returns 1 on a nonidentical linear repeat. The initial exact-equality test and
failure output remain in the outside-Git evidence. No relaxed visual tolerance
replaces the failure. Real render tests validate the reported observation rather
than assuming floating-point equality; decoded PNG equality is checked separately.

```sh
"$P" -B blender/validation/verify_stone_evidence.py \
  --render /evidence/current-render --inventory /evidence/source-inventory.json \
  --active-repo /absolute/original/day-fix --out /new/verification.json
STONE_RENDER_OUTPUT=/evidence/current-render "$P" -B -m unittest discover \
  -s blender/validation -p 'test_stone_render.py' -v
```

## Reuse lesson

Freeze source identity and measurement identity independently. A changed mask,
fit domain, unit conversion, tile coverage rule or spectrum band is a new
measurement—not a renderer regression. Keep the same shared mask for before/after
shading, retain pixels beside provisional units, and inspect a same-seed repeat
before attributing tiny differences to the material. Preserve evidence outside
Git, while versioning only diagnostic code/tests. Do not promote a topology edit
from one phase/crop or mean-matched score.
