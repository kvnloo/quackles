# Home plate editor

The separate `/studio/` WebGL page was retired. Editing lives on the existing home page; the authored Blender plate, current poster chrome and inspection camera remain the renderer. No GLB approximation is mounted. The archived GLB/camera utilities and their unit tests remain available for provenance, not as an editor UI.

## Use

```sh
npm run build
python3 -m http.server 43217 --bind 127.0.0.1 --directory out
# http://127.0.0.1:43217/
```

Click **Edit**, then hover/click a scene part (or use the labelled Part selector). The existing inspection spring frames its rendered mask bounds. Adjust tint/amount/tone instantly, or describe a material and optionally upload a reference before **Generate image edit**. **Apply** commits only the selected part. **Show before / Show after** compares the plate; **Revert part** removes that part's edits. **Done**, **Close** or Escape returns to the unzoomed home. The narrow mobile panel scrolls independently.

Per-theme part edits extend the existing version-1 theme JSON. JSON and generated PNG blobs commit atomically to IndexedDB (`quackles.plate-editor.v1`), with read-back verification. Reload and theme switches restore edits. There is no new account, server API, cloud save or export/import UI. A copied JSON record alone does not include its referenced IndexedDB patch blobs.

## Masks and plate provenance

```sh
/usr/bin/python blender/export_part_masks.py
# Or: --theme day
```

This launches Blender with a sanitized HOME/PATH, `--background --factory-startup`, Cycles CPU and six threads. Every theme opens, renders and exits without saving the locked blend. The exporter verifies the source SHA before/after, overrides only rendering materials for an opaque Object Index pass, and keeps the camera/geometry untouched. System Python needs OpenImageIO, numpy and Pillow. Blender 5.2 calls the EXR pass `Object Index`; older builds may call it `IndexOB`.

`public/editor/{day,white,blue,dark,night}/mask.png` is an indexed PNG at the **shipped base plate resolution, 1024 × 1536**. Its palette maps index N to RGB(N,N,N) for lossless browser lookup. `parts.json` records object names, visible-pixel bounds/counts, camera parameters, donor hash and plate hash. The fourteen semantic groups include head, body, legs/feet, eye, plinth, step/print, labels, sphere, ball ledge, grey block, rear blocks, arch, poster wall and background. Occluded parts have null bounds and are omitted from the selector (White has no visible arch pixels).

**Alignment boundary:** the home manifest still loads `cinematic-proof-v2/.../p0000000-1024.webp`. Those are earlier beauty plates, not freshly rendered r101 beauty plates. The owner-specified r101 scenes share an identical camera across all five themes, but later geometry/material edits can differ from the earlier beauty. Masks use that locked camera as requested; no hand-painted correction or replacement beauty was introduced. The indexed silhouette and bounds are exact for the locked scene render, not a claim of pixel identity for changed geometry in the earlier plate.

Existing deep-zoom tile loading remains untouched. Edits are base-plate-resolution patches, not freshly rendered gigapixel pyramids; at extreme zoom an edited part has the patch's resolution while unedited surroundings retain the original detail renderer.

## Local harness

Entering Edit checks the configured loopback ComfyUI endpoint. The small connection status opens endpoint details. Image data is sent only by **Generate image edit**. No password, API key or subscription token is collected.

- Preferred: `CodexChatGPTImage` through the retained `ComfyAdapter`. Input 1 is a plate crop plus margin; input 2 is the corresponding white-on-black mask, with an optional uploaded texture below it. The prompt identifies both. Crops match supported output aspect ratios rather than stretching an arbitrary rectangle.
- Fallback when ChatGPT is not installed: SDXL `VAEEncodeForInpaint`, the real binary mask, Canny conditioning and an installed canny SDXL ControlNet. Missing prerequisites fail before submission. This fallback graph is unit-tested; the live acceptance run uses ChatGPT.
- Returned pixels are clipped to the selected rendered ID with a two-pixel **inward-only** feather. No alpha is written outside that ID, including holes and other objects inside the bounding box.

Jobs submit once. There is no automatic retry or provider switch after a submission. **Stop waiting** aborts client waiting, not a server job already queued; inspect ComfyUI before retrying. Generative material editing cannot guarantee perfect silhouette/texture fidelity inside its permitted mask.

ComfyUI must allow the page's origin (CORS and browser Local Network Access rules apply). Do not expose its unauthenticated endpoint to the internet. The acceptance workflow attaches to the owner's existing `127.0.0.1:8188` process and never restarts it.

## Verification

```sh
npm test
npm run typecheck
npx eslint components/editor components/overlay/Landing.tsx components/sequence/HeroInspection.tsx components/sequence/SequenceFrame.tsx lib/editor lib/harness lib/studio/theme.ts
npm run build
PREVIEW_EXPECT=home node --import ./scripts/register-ts-resolve.mjs scripts/preview-config-contracts.mjs
BASELINE_OUT=/absolute/base-build/out npm run test:editor:static
```

The smoke owns ephemeral loopback servers and isolated headless Chromium, then closes both. Screenshots are explicitly **EMULATION**, not hardware-GPU evidence. It covers real mask hover/click, camera framing, instant tint, comparison, IndexedDB reload, revert/Escape, all five theme masks and mobile layout. Real shipped deep-zoom assets are routed to their existing asset host. Normal-home comparison excludes only the newly requested Edit control.

With explicit generation approval:

```sh
BASELINE_OUT=/absolute/base-build/out node scripts/editor-smoke.mjs --live
```

This additionally submits one real ChatGPT edit **from the actual home editor**, reads ComfyUI history back, applies the patch, then reads the saved theme/blob from IndexedDB. A pre-existing `generation-attempt.json` blocks reruns; do not delete the guard to bypass the two-generation budget. Artifacts default to `/mnt/zer0models/project-artifacts/quackles/process/theme-engine/v2/`; use `ARTIFACTS` to override.
