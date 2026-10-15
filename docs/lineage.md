# Public lineage archive

`/lineage/` is a static, progressively enhanced artifact viewer: references and exact current picks are server-rendered; the chronological archive uses a bounded DOM window and a small native ES module. This is not a live mirror of private review files.

## Rebuild a reviewed snapshot

Requires Python 3 + Pillow. Supply all private locations explicitly; never check the input files or their locations into this repository.

```sh
python3 scripts/build_lineage.py \
  --history "$PRIVATE_HISTORY" --current "$PRIVATE_CURRENT" \
  --references "$PRIVATE_REFERENCE_MAP" \
  --assets "$ASSET_CHECKOUT/lineage/v1"
```

`PRIVATE_REFERENCE_MAP` is a local JSON object mapping `day`, `white`, `blue`, `dark`, `night` to their locked reference images. The builder checks that CURRENT matches the history's digest and that all scene counts agree. It emits:

- `public/lineage/history-v1.<digest>.json`: minified, content-addressed schema-1 snapshot.
- `public/lineage/manifest.json`: dataset hash, counts and byte budgets.
- `content/lineage.json`: small server-rendered header manifest.
- `lineage/v1/<digest>.webp` in **quackles-assets**, not this site: 288/576-long-edge thumbs and 1024-long-edge medium derivatives. Filenames hash the encoded bytes; metadata is not copied.

Projection is allowlisted: theme, version, date, finite date-source/phase/status labels, source hash prefix, synthesized short caption, image keys and dimensions. Private paths, subjects, reports, occurrences and free-form notes never enter the public dataset. Unknown source/phase categories fail rather than copying text. Generation is deterministic for fixed inputs and Pillow/WebP versions. Audit source changes and regenerate before updating a snapshot; do not silently relabel old versions.

Current images may be a near-identical later occurrence of an earlier archive representative. The current lightbox loads the **exact CURRENT image** while explaining that its archive date and hash identify the earliest retained representative. `/lineage/#/day/current` is distinct from `/lineage/#/day/v42`. Rejected and unknown experiments remain visible. File mtime is explicitly not a creation receipt.

## Build / host

```sh
npm test
npm run build
# Same-origin Vercel rewrite or local mirror instead of the default Pages host:
NEXT_PUBLIC_ASSET_ORIGIN='' npm run build
# Optional GitHub Pages site prefix:
NEXT_PUBLIC_BASE_PATH=/quackles NEXT_PUBLIC_ASSET_ORIGIN='' npm run build
```

`assetPath` scopes route links, module and dataset paths. `getAssetOrigin` chooses the image host. Default image host: `https://kvnloo.github.io/quackles-assets`; same-origin builds use the existing `/quackles-assets/*` hosting convention. Publish the image-repository commit before publishing the page. No new files can be fetched from Pages until that independent publication happens.

The mandatory npm `postbuild` finalizer removes the Next runtime **only from `out/lineage/index.html`**, inlines that page's built CSS to avoid a mobile critical-path round trip, and content-hashes the standalone module. This route contains no client components, Next links or React-owned interactions. **Keep all incoming links as ordinary `<a>` document navigations, never Next `<Link>` / router.push.** Other routes and their runtime are untouched. Do not bypass npm's postbuild with a bare `next build`; `npm dev` is not the static performance artifact. If adopting a strict CSP, permit the generated inline CSS by hash.

## Verify

```sh
LINEAGE_ASSETS="$ASSET_CHECKOUT" npm run test:lineage
LINEAGE_ASSETS="$ASSET_CHECKOUT" ARTIFACTS="$EVIDENCE" npm run test:lineage:static
# Install Lighthouse outside the project; do not alter the lockfile for audit tooling.
npm install --prefix "$TMPDIR/lineage-audit" lighthouse
LINEAGE_ASSETS="$ASSET_CHECKOUT" ARTIFACTS="$EVIDENCE" \
  AUDIT_MODULES="$TMPDIR/lineage-audit/node_modules" node scripts/lineage-lighthouse.mjs
```

Browser tests own and close ephemeral loopback servers and headless Chromium instances. The server mirrors the local asset checkout, with gzip for text; it does not pretend that unpushed assets exist on the public CDN. Tests exercise filters, ordering, empty states, exact current images, bounded DOM size, keyboard traversal, cold deep links, modal navigation, route JavaScript bytes, screenshot geometry and the process-page callout. Lighthouse uses its default simulated mobile network/4× CPU settings and gates LCP <2 seconds / CLS 0. Scroll traces record both rAF wall-clock intervals and callback CPU work under 4× CPU slowdown; these are different metrics. Do not turn a low callback cost into a 120 Hz/device pass.

Images below the current window are not mounted. Ordinary scrolling only changes the DOM on row boundaries; retained cards keep their decoded images. CSS layout/paint containment bounds invalidation. The list reserves its full height, has fixed card/image geometry and exposes total positions to assistive technology. Arrow keys, Page Up/Down, Home/End traverse the full result set; Enter opens a native modal dialog and Escape returns focus. Medium images load only on inspection.
