# Bounded material-transfer frontier

This preserves the Round 5 follow-up for the visible detail drop between the authored Blender hero and the live robot. The current Round 6 real-set export broadens the proof to set geometry and materials; see `spatial-frontier.md`. M15 remains a bounded head-material experiment, while M16 validates the complete requested motion and M17 compares set texture layouts. A historical theme-map crossfade below is a residency option, not permission to fade the whole scene during departure.

## Dependency path

1. **Procedural and camera-projected pigment → mesh-space UVs.** Cycles baking requires a UV map and image target. Camera projection is tied to a view; the local invariant to prove is that the baked result remains registered when each rigid part articulates.
2. **Mesh-space UVs → portable PBR images.** Bake Diffuse with only Color enabled so studio illumination is not baked and then lit a second time in Three. Keep roughness/metallic as current scalars for the first proof; add a packed linear map only if spatial variation survives review.
3. **Portable images → glTF material inputs.** Blender's exporter recognizes Principled Base Color image input and glTF's green-roughness/blue-metallic packing. Arbitrary procedural branches should not be assumed to bake automatically.
4. **glTF inputs → Three color parity.** Base color is sRGB; roughness, metallic and tangent normals are data textures. Wrong annotation will wash out or darken the calibrated handoff.
5. **Texture fidelity → asset cost.** Normalize island scale, inspect stretch and mip margins, then choose resolution from phone screen-space evidence. Add KTX2 only after the uncompressed visual baseline passes because transcoding adds a separate cold phase.
6. **Theme delivery → crossfade residency.** Full pre-baked theme maps are simple but multiply resident base-color memory. An ink-mask design can reuse content, but core glTF has no arbitrary two-layer theme compositor; that path needs a custom runtime shader and its own compilation test.

Primary support: [Blender Cycles baking](https://docs.blender.org/manual/en/5.0/render/cycles/baking.html), [Blender glTF materials](https://docs.blender.org/manual/en/4.0/addons/import_export/scene_gltf2.html), [glTF 2.0 material semantics](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html), [Three texture color spaces](https://threejs.org/docs/pages/Texture.html), [Blender UV editing](https://docs.blender.org/manual/en/4.5/modeling/meshes/uv/editing.html), and [Three KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html).

## Options

| Option | Benefit | Cost and risk | Recommendation |
|---|---|---|---|
| 512² head-shell base-color proof | Tests the highest-salience print, seams, articulation and color pipeline with one tile. RGBA decoded upper bound is 1 MiB. | Does not prove whole-body atlas packing or roughness fidelity. | **Run first.** |
| One 1024² base-color atlas, shared current MR scalars | Broadest visible pigment gain with one map and a 4 MiB RGBA decoded baseline. One shared atlas can preserve same-material batching. | Unique UV work; small labels may compete for texels. | Promote only after the head proof. |
| Three full 1024² theme base-color maps | Simple theme switching and exact per-theme paint. Base-color decoded baseline is 12 MiB before any shared MR/normal maps; a crossfade may require two maps simultaneously. | Highest residency and upload pressure; three bakes to maintain. | Use only if themes change pigment shapes, not just tint. |
| Shared neutral base plus one/two ink masks | Lowest duplicated theme content and enables runtime tinting. | Requires custom layer compositing beyond core glTF, adds shader variants/compile risk, and can break the current simple material path. | Research after a full-map baseline proves value. |
| Per-part texture/decal materials | Local resolution and easy replacement of one graphic. | More materials and texture bindings can undo batching and complicate seams. | Avoid unless one isolated decal cannot fit the shared atlas. |

KTX2 is a packaging treatment rather than the first experiment. It may reduce transfer and GPU residency by transcoding to supported compressed formats, but the WASM/transcode path and quality must be measured cold and warm.

The local host exposes an RTX 3080 Ti and Blender OptiX when queried outside the restricted sandbox (`work/calibration/host-gpu-evidence.txt`; the final render log records the OptiX device). That can shorten bake/render iteration, but it is only setup evidence: it does not prove headless Chrome is hardware accelerated and does not validate the target phone. No driver or user preference change is part of this frontier.

## Smallest proof experiment: M15

**Control:** current live head material.

**Treatment:** without changing the head mesh, create one mesh-space UV set and bake only the authored head-shell material color into a 512×512 sRGB image. Keep current metallic/roughness scalars, geometry, camera, lights, exposure, DPR and batching.

Test the calibrated rest pose plus a head-yaw and head-pitch pose. Save control/treatment captures in randomized order at 430 and 360 CSS pixels. Record encoded bytes, physical decoded dimensions, texture count, draw calls/triangles, cold ready time, first visible frame, and seam pixels at mip distance.

Pass only if:

- the print stays attached through both articulated poses;
- paired review prefers the treatment at normal phone size;
- the proof adds no draw call and no mesh/hash change;
- decoded cost is at most 1 MiB for the tile;
- cold and first-visible measurements show no material regression.

If it fails registration, fix UV/bake coordinates before changing compression or resolution. If it passes visually but regresses cold load, test predecode/upload and KTX2 as separate experiments. If it passes both, expand to one white-theme atlas before designing theme masks.
