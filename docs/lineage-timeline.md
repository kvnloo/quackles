# Interactive timeline

`/lineage/` enhances the static archive with a native timeline instrument. The reference/current comparison and full archive remain intact.

- Native range: touch/mouse drag. Left/right steps exactly one archive version, including tied timestamps. Shift+arrows jumps a day; Home/End goes to Blue project v0/latest.
- Five scene swimlanes: one status-coloured tick per artifact; hover/focus previews; arrows within a lane move focus; Enter snaps. Current, kept, rejected and shipped labels are also textual.
- Five recycled state cards show each scene's latest matching artifact at the selected capture. Six recycled stream cards expose a chronological window ending at the selection. Earlier/Later pages through every matching artifact up to that point. This is not a truncated dataset.
- Existing scene/phase/status/search filters govern both windows and the original complete archive. The archive's ordering control affects the full archive; the time stream always remains chronological.
- Milestone buttons snap to Blue v0, first theme ports, first Night v2 and current review-pick artifacts. They explicitly do not invent owner-approval timestamps: references are undated; review-pick markers use artifact dates. Capture time is not a decision time.
- Play/Pause and 1×/2×/4× transport. Pauses when the document is hidden. Reduced-motion preference removes entry animation; autoplay is always opt-in.
- `?t=ISO` or `#/t/ISO` selects a time. Generated links add `at=scene/version` to disambiguate equal-time artifacts. The original image lightbox permalinks remain supported.

## Build and tests

`python3 scripts/build_lineage_timeline.py` reads only the finite public dataset, writes a content-hashed numeric index and binds it to the dataset SHA-256. `npm run build` includes this step. The runtime hydrates Float64Array times, Uint32Array order and Int32Array scene snapshots; filtered snapshots are computed only when filters change. Input is coalesced with requestAnimationFrame and binary search; the scrub path has no geometry reads or DOM creation. Image slots have fixed dimensions and async decoding; nearby thumbnails are prefetched with a bounded cache. Runtime module dependencies are fingerprinted by the static-island finalizer.

```sh
npm run test:timeline
# Self-owned ephemeral server + requested rendering engine:
CHROME="$HEADLESS_SHELL" LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" npm run test:timeline:static
# Private JSON config: [{"name":"timeline","directory":"/frozen/export"},
#                       {"name":"bad","directory":"/frozen/export","bad":true}]
CHROME="$HEADLESS_SHELL" LINEAGE_ASSETS="$LOCAL_ASSET_CHECKOUT" \
  ARTIFACTS="$EVIDENCE" npm run test:timeline:work -- "$CONFIG"
```

The scrub harness uses the v2 main-thread union-of-work analyzer, adds input EventDispatch spans, and requires 360 inputs spanning min→max→min instead of the scroll harness's 5760px travel. Thresholds remain p95 ≤4ms / max ≤8.3ms at mobile 4× CPU, zero forced layouts/LoAF/errors, ≥240 frames/callbacks, ≥10 interleaved repeats and the existing repeatability limits. A bad width/offsetWidth loop must fail. The original grid-scroll gate is separately retained. Neither cadence nor callback-only duration is substituted for frame work. No physical120Hz claim is implied.

The shared local HITL edition embeds the dependency-free runtime and CSS into HTML; it requires no module loader, fetch, build server or framework at runtime. Local provenance/source files are not published by this route.
