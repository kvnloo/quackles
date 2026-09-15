# Note for the theme / CSS-match agent

Hero first frame is a **Blender Cycles plate** (`public/poster/frame-*.jpg`). Do not put the bust image, CSS orb, HTML plinths, or arch back as DOM set dressing.

- Theme is **exactly three states**: White / Poster / Dark (default Poster = cobalt `#0000f2` on paper `#f2f2f2`)
- `ThemeControl` lerps CSS vars + 3D lights over 360ms via `animateThemeTo` / `applyThemeT` / `lightsAt`
- Tokens were pulled from the live Hermes Agent site, not from memory
- R3F (ACES, antialias, dpr `[1, 2]`) takes over for explode / jump via `--p`
- Keep `applyThemeT` / `plateWeights` / `PosterPlates`. Rebuild stills with the blender README.

No Try Micro Duck iframe.
