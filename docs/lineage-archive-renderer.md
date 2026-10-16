# Archive rendering

The `/lineage` archive uses a fixed-height arithmetic window and one Canvas2D
surface. It consumes the same content-addressed image atlas as the timeline.
This is a rendering change, not a new archive layout or a claim of physical
120 Hz presentation.

## Native and live surfaces

- At rest, a ring of native cards supplies the original typography and controls.
  At the tested 844px height, the ring has 10 mobile, 15 tablet or 25 desktop cards.
  Row heights, responsive column counts, padding and scroll extent are unchanged.
- During scrolling, the canvas draws the visible images and cached labels;
  native card publication waits for a pause. The canvas is opaque over stale
  native labels, not a frozen representation of the previous row. Clicking
  while live resolves the actual row and column. Keyboard navigation explicitly
  materializes its target and uses roving focus; Home, End and filtered navigation
  still reach every version.
- A visually hidden semantic archive retains all matching versions. The original
  no-JavaScript reference/current links and complete public dataset remain intact.
- Geometry is supplied by ResizeObserver and measured during setup, not read
  after card writes on every scroll frame. A single compositor boundary contains
  the scroller; cards do not request individual compositing layers.

## Resources

Atlas and font preparation begins only as the archive approaches the viewport.
Initial offscreen startup fetches no atlas image pages. A Worker loads the actual
local webfont URLs and rasterizes only the current and nearby labels. CSS
`local()` fallback faces are intentionally excluded: trying to load them as Worker
network fonts can reject the whole preparation promise. At most 80 label bitmaps
are retained, and only the text region is rasterized. Discarded and superseded
bitmaps are closed. Image pages are bounded by the shared atlas manifest.

Canvas absence or missing atlas metadata retains a recycled native/CSS-image
path. A cold jump or unavailable Worker may rasterize a missing visible label
on the main thread rather than display an empty label. Prepared continuous
scrolling is separately tested for zero main-thread label rasterization; the
fallback is not claimed to have the same performance qualification.

The timeline additionally rejects glyph batches that cannot contain any visible
scene/stream label. Native details and URL publication require two quiet animation
frames after their existing debounce, so a scheduler pause cannot turn continuous
input into a premature layout-heavy publication. The delayed-frame regression
fails before this guard and passes after it. Pixels, selection and controls are
otherwise unchanged.

## Verification

With the normal local asset mirror and requested Chrome executable configured:

```sh
npm test
npm run build
npm run test:archive:static
npm run test:lineage:static
npm run test:timeline:static
node scripts/timeline-canvas-browser.mjs
node scripts/timeline-settle-browser.mjs
node scripts/timeline-startup-browser.mjs
```

`archive-visual-browser.mjs` compares identical scroll offsets and viewports and
explicitly decodes visible baseline images before capture. Set `VISUAL_VARIANTS`
to the baseline/candidate export array and `ARTIFACTS` to an evidence directory.
`LIVE_SHOTS=1` also captures the live rasterized labels at those same offsets.
Image-region differences from atlas resampling are reported separately from
unchanged native UI pixels; neither comparison is described as pixel identity.

Admission still requires every unchanged frame-work-v2 gate, repeated interleaved
runs and negative controls. A lower p95, successful build or Lighthouse score
alone does not authorize preview integration.
