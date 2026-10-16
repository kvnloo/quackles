# Interactive timeline

`/lineage/` enhances the static archive with a native timeline instrument. The reference/current comparison and full archive remain intact.

- Keyboard-accessible ARIA slider: touch/mouse drag. Left/right steps exactly one archive version, including tied timestamps. Shift+arrows jumps a day; Home/End goes to Blue project v0/latest.
- Five scene swimlanes: one status-coloured tick per artifact; hover/focus previews; arrows within a lane move focus; Enter snaps. Current, kept, rejected and shipped labels are also textual.
- Five medium-image state cards show each scene's latest matching artifact after a 90ms input settle. One WebGL2 canvas (Canvas2D fallback) draws 665 swimlane ticks and six atlas sprites; six text links retain keyboard access to the chronological window ending at the selection. Earlier/Later pages through every matching artifact up to that point. This is not a truncated dataset.
- Existing scene/phase/status/search filters govern both windows and the original complete archive. The archive's ordering control affects the full archive; the time stream always remains chronological.
- Milestone buttons snap to Blue v0, first theme ports, first Night v2 and current review-pick artifacts. They explicitly do not invent owner-approval timestamps: references are undated; review-pick markers use artifact dates. Capture time is not a decision time.
- Play/Pause and 1×/2×/4× transport. Pauses when the document is hidden. Reduced-motion preference removes entry animation; autoplay is always opt-in.
- `?t=ISO` or `#/t/ISO` selects a time. Generated links add `at=scene/version` to disambiguate equal-time artifacts. The original image lightbox permalinks remain supported.

## Build and tests

`python3 scripts/build_lineage_timeline.py` reads only the finite public dataset, writes a content-hashed numeric index and binds it to the dataset SHA-256. `npm run build` includes this step. The runtime hydrates Float64Array times, Uint32Array order and Int32Array scene snapshots; filtered snapshots are computed only when filters change. Input is coalesced with requestAnimationFrame and binary search; the scrub path has no geometry reads or DOM creation. Image slots have fixed dimensions and async decoding; medium images decode serially after settle, with a generation check before each swap (at least 32ms apart); the atlas supplies scrub previews instead of speculative medium prefetch. Runtime module dependencies are fingerprinted by the static-island finalizer.

```sh
npm run test:timeline
# Self-owned ephemeral server + requested rendering engine:
CHROME="$HEADLESS_SHELL" LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" npm run test:timeline:static
# Private JSON config: [{"name":"timeline","directory":"/frozen/export"},
#                       {"name":"bad","directory":"/frozen/export","bad":true}]
CHROME="$HEADLESS_SHELL" LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" \
  ARTIFACTS="$EVIDENCE" npm run test:timeline:work -- "$CONFIG"
```

For asynchronous renderer variants the scrub harness waits for `data-assets-ready=true` after scrolling the slider into view, before CPU throttling/tracing. This is an explicit setup precondition (the previous synchronous implementation had already completed initialization); it does not change the measured window, input tape, thresholds or sample requirements. Cold startup and unprepared input remain separate browser checks.

The scrub harness uses the v2 main-thread union-of-work analyzer, adds input EventDispatch spans, and requires 360 inputs spanning min→max→min instead of the scroll harness's 5760px travel. Thresholds remain p95 ≤4ms / max ≤8.3ms at mobile 4× CPU, zero forced layouts/LoAF/errors, ≥240 frames/callbacks, ≥10 interleaved repeats and the existing repeatability limits. A bad width/offsetWidth loop must fail. The original grid-scroll gate is separately retained. Neither cadence nor callback-only duration is substituted for frame work. No physical120Hz claim is implied.

The local HITL review uses byte-identical timeline/canvas/label modules. Its builder embeds those modules and lossy atlas pages as data URLs, so `file://` needs no module loader or HTTP server. An owned Blob Worker decodes those data URLs locally; it makes no HTTP requests. Local provenance stays local; only the approved public archive supplies the public atlas. The original review HTML is retained separately as the visual baseline.

## Progressive startup

The accessible archive initializes without atlas image requests. The timeline retains its native labels; GPU setup and label preparation start only when the instrument is within 200px of the viewport and an idle callback is available. Image pages load serially, prioritizing the current stream page set. An owned Worker fetches/decodes each page and produces 128-row ImageBitmap strips; the main thread uploads one strip per idle opportunity. Uploads pause for 120ms after input. Browser-font pages are prepared in an OffscreenCanvas Worker only on approach, with bounded-height pages uploaded progressively outside manipulation. Until ready, native text/state semantics remain available. The worker still prepares all labels for a visible instrument, not a per-character glyph cache; startup deferral is not a claim of bounded total font-atlas memory.

The live canvas covers native text instead of toggling its CSS opacity. This removes the first-drag text-layer transition without changing settled typography. Uniform submission and the five-state input array are reused rather than allocated per frame.

## Locked design proof

The layout and interaction reference is `093c556`, not an opportunity for a redesign. `scripts/timeline-design-lock.mjs` compares the public and local baseline/candidate at identical start/midpoint/end timestamps, desktop 1440 and mobile 390, including exact caption/date/count geometry. Preserve unaligned before/after PNGs and unmasked pixel differences. Expected differences are confined to rasterized ticks/rail, GPU image minification and the explicitly requested medium-resolution settled hero images; do not call a geometry pass pixel identity. Live-manipulation coverage separately verifies that not-yet-preserved slots visibly clear while the medium images remain unchanged.

## Sprite atlas renderer

`LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" python3 scripts/build_lineage_atlas.py` builds seven 2048×2048 quality-74 WebP pages with at-most-180×240 thumbnail cells and two-pixel gutters, totaling 2,770,470 bytes for 665 entries. These are scrub/stream previews; settled hero cards retain medium sources. The complete page set has an executable 3 MB transfer budget. This is intentionally lossy, not pixel identity; identical-T design comparisons remain mandatory. Each page and the UV/date/theme/status manifest is content-hashed. The manifest binds to the exact public archive hash. Regular builds use these committed artifacts; they do not read private image sources. `test_lineage_atlas.py` verifies every entry, UV bounds, nonempty crop, page identity and decoded RGB crop equality to its content-bound manifest hash. GPU mipmapping avoids aliasing when atlas sprites are minified.

The scrub rail and thumb share the same canvas; the overlaid ARIA slider adds no per-frame style/layout writes. One compositor boundary surrounds the instrument; no card owns a compositing hint. Native captions/counts publish after interaction; medium image decodes are serialized before the canvas yields to the native images. During sustained input, cached browser-font label atlases draw live captions, counts and scene metadata, avoiding text layout and texture uploads on the hot path. WebGL2 uses immutable per-page instance buffers. Time, stream endpoint and reduced motion are uniforms; filtering updates buffers once. Shader age controls sprite opacity/scale without DOM animations. Canvas2D paints the same live stream/state window when WebGL2 is unavailable. DPR-aware backing size changes only through ResizeObserver. Context loss pauses draws; restoration re-decodes images and rebuilds label pages, rather than reusing potentially invalid GPU-backed ImageBitmaps. No continuous idle rendering loop.

Pointer samples use getCoalescedEvents when available and one scheduled frame; the ARIA slider has touch-action:none, standard keyboard semantics, and exact timestamp-tie stepping. Other pointer moves are passive. Canvas scene, timestamp and count feedback is immediate; the human-reading caption and slider aria values are throttled to 120ms and flushed on settle. Live state uses atlas pixels rather than freezing until release. Medium images and DOM semantic details settle after 90ms without input or at pointer release, with generation-guarded serial decoding; a held pointer prevents premature image publication. Settled text remains native DOM for exact typography. The renderer and input share one animation-frame scheduler, avoiding duplicate draws. There are no per-artifact DOM tick elements, transforms, will-change layers or image decodes on the canvas input path.

Run `CHROME="$HEADLESS_SHELL" LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" node scripts/timeline-canvas-browser.mjs` to verify both real WebGL2 and forced Canvas2D at DPR2. Performance admission remains a separate repeated trace gate; functionality is not an admission.
