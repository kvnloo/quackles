# RFC-003 spike results: Blue hero parity, real-time vs plate

**Status:** research spike, `preview/rfc-003-realtime`. Production is unchanged.
**Umbrella:** #42
**Code:** `scripts/rfc-003-spike/`
**Evidence:** `/mnt/zer0models/project-artifacts/quackles/process/analysis/rfc-003/` (`results.json`, `side-by-side-*.png`, `dE-*.png`, `captures/`, `export/`)

## Question

Can a three.js render of the Blender Blue scene match the Blue hero p0000000 at the same framing? When the camera zooms, can streamed surface detail match the Cycles 201MP view?

The control is the shipped 1024 plate plus the accepted 201MP pyramid.

## What was built

1. **`blender_export.py`, a headless export of `preserved/proofs-v2-scenes/blue-cinematic.blend`.**
   - It exports the camera exactly: PosterCam, 38.96 mm lens, 24 mm sensor (horizontal fit), vfov 49.59°, and the world matrix converted to Y-up.
   - It renders a Cycles reference and a robot visibility mask from the same camera.
   - It decimates the robot from 797k to 247k triangles, then applies each part's modifier stack.
   - It joins the robot and the set into one mesh each. Per-part Object and Generated coordinates are frozen into attributes, so procedural shading is unchanged.
   - It bakes COMBINED lighting (64 spp, saved through Khronos PBR Neutral) and albedo. The robot gets an 8K atlas, baked as 2×2 tiles because an 8K float bake runs out of RAM on this host. The set gets a 4K atlas.
   - It writes Draco GLBs, lights, material scalars and the HDRI.
2. **`build_vt.py`** builds the virtual texture. It cuts the robot atlas into 256 px pages with 4 px gutters: L0 is 8K (32×32 pages), L1 is 4K, and a resident 2K base sits underneath.
3. **`index.html` + `main.mjs`** render in three.js r186 with these modes:
   - `bake`: unlit, baked lighting, with a 2K, 4K or 8K resident atlas.
   - `bake&vt=1`: the C1 prototype. It has a 32×32 page table, a 12×12-slot cache, and a 1/8-resolution feedback pass. Fallback goes page, then parent page, then resident base. It uploads at most 2 pages per frame and drops stale pages.
   - `pbr`: B1 live lighting. Baked albedo plus Principled scalars, RectAreaLights from the Blender lights, the HDRI for specular, the flat world colour for diffuse, and Neutral tone mapping.
   - `mask` and `density`: for silhouette IoU and texel-density measurement.
4. **`capture.mjs` + `analyze.py`** take the measurements. They run in Chromium on hardware ANGLE/Vulkan (RTX 3080 Ti). Scoring uses scene-match `score.py` regions plus per-pixel CIE76 ΔE.

The saved scene is the plate's source: Cycles of the saved scene vs the plate gives region ΔE **1.1**.

## Full frame (1024×1536, vs shipped plate)

| Variant | region ΔE | robot px ΔE | background px ΔE | robot mean-colour ΔE |
|---|---|---|---|---|
| Control: 201MP downsampled | 4.2 | 3.9 | 5.4 | 1.8 |
| Cycles, saved scene, 64 spp | 1.1 | 5.0 | 1.6 | 3.5 |
| **B: baked lighting, 2K robot** | 4.5 | **13.8** | 3.5 | 4.3 |
| B: baked, 8K robot | 4.5 | 13.6 | 3.5 | 4.5 |
| B1: live PBR | 16.4 | 18.6 | 9.4 | 8.3 |

- **Silhouette IoU**, three.js robot vs the Blender mask at the same camera: **0.993**. The camera match is solved, and decimating to 247k triangles costs almost nothing.
- **Baked regions vs the plate:**
  - Plinth, prints, wall and blue block are at or under 1.4.
  - Head shell 10, joints 12.5, glass orb 17.8.
  - The error sits where the look is view-dependent: glass refraction, metal and lens specular, shell sheen. COMBINED baking evaluates those from the surface normal, not from the camera.
- **B1, live PBR, is worse than B on every region.**
  - Robot ΔE 18.6. This matches the sim-parity lane's 16–36.
  - three.js area lights cast no shadows.
  - Procedural roughness and bump collapse to scalars.
  - This exporter also loses emission on the prints (hands 77, orb 70). That inflates B1's region mean, but its robot number stands on its own.

## Zoom 8× (128×192 plate px → 1024×1536, vs the 201MP crop of the same rect)

| Rect | Variant | robot ΔE | ΔE (4 px blur) | SSIM(L) | detail energy vs 201MP |
|---|---|---|---|---|---|
| head | plate upscaled (no pyramid) | 6.1 | 3.6 | 0.65 | 0.05 |
| head | baked 2K | 9.4 | 7.7 | 0.62 | 0.28 |
| head | baked 8K resident | 8.7 | 7.5 | 0.69 | 0.36 |
| head | **C1 VT 8K streamed** | 8.8 | 7.5 | 0.68 | 0.37 |
| body | plate upscaled | 7.2 | 4.0 | 0.53 | 0.04 |
| body | baked 8K resident | 16.4 | 14.8 | 0.50 | 0.32 |
| body | **C1 VT 8K streamed** | 16.8 | 15.0 | 0.48 | 0.30 |

**C1 VT 8K streamed:**
- It matches the 8K resident atlas from a 2K resident base. It does not beat it.
- The head zoom settled in 1.9 s with 95 pages (355 KB). The 201MP control needs 20 tiles (8.9 MB) for the same rect.
- On the body zoom the view wanted 269 pages, against 144 slots. The rest fell back to L1, which is invisible at this size.

**Texel density:**
- At the hero framing the 8K atlas gives **0.35 texels per 201MP pixel** (median).
- 1:1 needs about a **23.5K** atlas. For the worst 10% of pixels it needs **28K**. That is a 16 to 32K virtual atlas, so 4 to 16× the pages built here.

**Visible gap** (`side-by-side-zoom-*.png`):
- Lettering and halftone now resolve, and they are much sharper than the upscaled plate.
- The metal hip reads matte instead of brushed.
- The lens and shell sheen are wrong.
- These are colour and gloss errors, not resolution errors. ΔE stays 2× the control's at every atlas size.

## Frame time (430×932 CSS, DPR 2, touch, 4× CPU throttle)

| Variant | GPU ms p50 / p95 | rAF p95 (60 Hz headless vsync) |
|---|---|---|
| baked 2K / 8K | 0.15 / 0.19 | 16.7 |
| C1 VT | 0.18 / 0.20 | **33.3** (feedback `readPixels` stall) |
| B1 PBR (543k tris) | 2.55 / 2.92 | 16.7 |

**Caveats:**
- GPU time was measured on a desktop RTX 3080 Ti. It is not a phone number.
- Headless vsync is 60 Hz, so 120 Hz frame pacing is unmeasured.
- The VT hitch is real. The synchronous feedback readback drops frames, which breaks "camera movement owns the frame budget". It needs async PBO readback before any device test.

**Bytes:**
- robot.glb 2.3 MB, set.glb 0.14 MB.
- Robot atlas: 2K PNG 1.9 MB, 8K PNG 15 MB.
- VT L0+L1 pages: 1,280 WebP pages, 2.9 MB.
- KTX2/Basis was not tested.

## What blocks parity

1. **Baked GI is single-view at best.**
   - COMBINED bakes from the normal, so specular, refraction and sheen are wrong even at the hero pose.
   - These regions cost ΔE 10–18: head shell, joints, orb.
   - A view-correct bake works only for the hero camera, and that is the plate.
2. **Live lighting is further off (B1).**
   - Area-light shadows, procedural roughness and bump, transmission and Cycles GI are not reproduced.
   - ΔE ~19 on the robot.
   - This is the same failure mode as PR #9, which the owner rejected.
3. **Materials.**
   - The CAL-* metals and satins are procedural (noise, bevel and bump), and they collapse to scalars in glTF.
   - Matching them needs a baked roughness/normal per page group. That is RFC-003's "atomic page group", and it was not built here.
4. **The print.**
   - The robot's pigment artwork is a 1024×1536 projected PNG (`white.png`, `Artwork` UV).
   - Cycles at 201MP shows that source magnified. No atlas can add authored detail the source does not have.
   - Macro fidelity on the shells is capped by the print, not by the renderer.
5. **Texel budget.**
   - Parity at 201MP needs a 16–32K virtual atlas, plus page-group normals and roughness.
   - Baking that on this shared host is GPU- and RAM-bound. CPU baking would take about 7.5 min per sample at 8K.

## Recommendation

**No-go for RFC-003 as a hero or zoom replacement. Go for a narrow follow-up.**

Against the control (plate + 201MP), the best real-time variant is baked lighting:
- Robot ΔE is 13.6, against the control's 3.9.
- Zoom ΔE is about 2× the plate-upscaled baseline.
- Detail energy is 0.37×.

That makes the HQ robot a visibly worse proxy (law 8), and no architecture here beats its control (law 10). The VT machinery works and is byte-efficient (about 25× fewer bytes than the pyramid per zoom). It cannot fix gloss and GI errors.

Worth keeping:
- The exact camera export (IoU 0.993).
- The join and coordinate-freeze bake path.
- The VT prototype, as the substrate for RFC-004 (Cycles anchor). There the plate and pyramid stay authoritative at the hero pose, and real-time only covers off-hero motion, with an invisible handoff.

Before re-opening:
- Bake view-independent channels only (albedo, roughness, normal), as a page group.
- Async feedback readback.
- A 16K+ virtual atlas.
- A phone GPU measurement on the S25.
