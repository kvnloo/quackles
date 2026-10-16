# Updating the process article

`/process/` is a static server-rendered editorial page. The disclosures are native HTML `details`/`summary`, with no client state or JavaScript requirement.

## Content

- `content/process.ts`: chapter order, anchor IDs, introductory copy, dated deep dives, short owner quotes, production-record labels and public source links.
- `content/process-images.ts`: image IDs, logical public paths, exact encoded dimensions, alt text and captions.
- `app/process/page.tsx`: accessible article, navigation, disclosures and figures.
- `app/globals.css`: scoped `.process-*` styles using the existing poster fonts and cobalt palette. Do not change home styles to restyle the article.

Keep the top-level story short. Put detailed timelines, failed approaches, corrections and comparison galleries inside the chapter disclosures. Keep anchor IDs stable. Native summary markers and visible keyboard focus are intentional.

## Updating Night

Night is explicitly **In progress**, with a snapshot date of October 15, 2026. Do not remove the status merely because a component has a preferred candidate. Check the current owner brief, full integrated render, saved-scene verification and review outcome. Update the chapter, figure caption, date and source label together. A component review is not a whole-scene release; an old screenshot is not the current home page.

## Evidence images

1. Keep source artifacts untouched outside the repository.
2. Copy only selected evidence, using descriptive filenames in `public/process/images/`.
3. Encode WebP at approximately quality 82, maximum width 1600 px, retaining aspect ratio and never enlarging the source.
4. Record the actual encoded dimensions in the image data. All images except the hero are lazy-loaded. The hero is eager/high-priority.
5. Give each image useful alt text and a caption identifying reference/candidate/control and date or round where relevant. Identify resized review sheets as reading aids, not native-pixel proof.
6. Preserve source path/hash and output byte receipts in the private delivery artifact directory, not the public article. Inspect embedded text as well as captions for private paths or identifiers.
7. Keep the total added image weight below 25,000,000 bytes. The content contract checks it.

Figure links open the encoded sheet itself for closer inspection. No lightbox library or new runtime dependency is needed.

## Checks

```sh
npm test
npm run typecheck
npx eslint --no-ignore app/process/page.tsx content/process.ts content/process-images.ts scripts/process-contracts.mjs scripts/process-browser.mjs
PREVIEW_EXPECT=home node --import ./scripts/register-ts-resolve.mjs scripts/preview-config-contracts.mjs
npm run build
ARTIFACTS="$TMPDIR/quackles-process-proof" npm run test:process:static
```

The static test starts and cleans up its own ephemeral Python server. It checks desktop (1440) and mobile (390), opens every disclosure, uses Enter and Space with page JavaScript disabled, decodes every figure, checks dimensions, alt text, lazy loading, overflow, privacy, links, and normal JS hydration. It saves top/deep-dive/gallery screenshots and `browser-results.json`. It uses headless Chromium, not physical-device evidence. Override `CHROME`, `OUT_DIR`, and `ARTIFACTS` as needed.

For a nonempty `NEXT_PUBLIC_BASE_PATH`, build with that variable and mount the resulting export beneath the same prefix in the served directory. Pass both `OUT_DIR` and `NEXT_PUBLIC_BASE_PATH` to the test; it checks the emitted links and images, not just a source helper.

## Editorial safety

- Check primary reports when traces disagree; do not combine unlike critic scores into a progress curve.
- Distinguish preferences, geometry locks, review composites and release acceptance.
- Do not claim phone performance from headless Chromium.
- Keep original third-party attribution and applicable licenses; this article grants no new rights to model, artwork, brand or font assets.
- Public source labels intentionally omit private filesystem and session paths. The delivery report holds the detailed audit trail.
