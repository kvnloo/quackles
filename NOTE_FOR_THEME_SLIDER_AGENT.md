# Note for the theme-slider / CSS-match agent

The first frame is no longer a CSS composite. Do not put the bust image, CSS orb, HTML plinths, or arch back on top of the hero.

- Still: `public/poster/frame-{white,cobalt,dark}.jpg` from `blender/build_poster.py`
- HTML only: wordmark, nav, CTA, kicker, headline, specs, coords, manifesto, stamps, globe caption, plinth/footer type, theme slider
- Slider (white → cobalt → dark) stays; it crossfades those three plates via `plateWeights()` in `lib/theme.ts`
- Later chapters (explode / jump / live duck) still fade in with `--p` after the hero still

If you need to touch theme tokens, keep `applyThemeT` / `plateWeights` / `PosterPlates`. Rebuild stills with the blender README, not with CSS set dressing.
