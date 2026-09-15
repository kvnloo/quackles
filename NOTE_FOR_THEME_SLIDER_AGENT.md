# Note for the theme / CSS-match agent

The first frame is the R3F duck on a sticky stage, not a CSS composite. Do not put the bust image, CSS orb, HTML plinths, or arch back on top of the hero.

- Theme is **exactly three states**: White / Poster / Dark (default Poster = cobalt `#0000f2` on paper `#f2f2f2`)
- `ThemeControl` lerps CSS vars + 3D lights over 360ms via `animateThemeTo` / `applyThemeT` / `lightsAt`
- Tokens were pulled from the live Hermes Agent site, not from memory
- Later chapters (explode / jump) still fade in with `--p` after the hero still

If you need to touch theme tokens, keep `applyThemeT` / `plateWeights` / `PosterPlates`. Rebuild stills with the blender README, not with CSS set dressing.
