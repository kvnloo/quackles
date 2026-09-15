# First-frame Blender studio

The landing hero is a **Cycles still**, not CSS set dressing. This folder rebuilds that still.

## What is in the scene

- Official Microduck (`public/robot/mjlab/microduck.glb`) assembled from `kinematics.json` (MJCF Z-up, classic cream materials).
- Cream cyclorama, Roman arch, cobalt bust panel (Apollo Belvedere duotone), limestone plinths, glass orb, cobalt square frame, Creation-of-Adam print, leaf.
- Three lighting plates: **white** (poster cream), **cobalt**, **dark**.

## Rebuild

Blender 4.2.x on `$PATH` (this agent installed `~/.local/blender-4.2.23`).

```bash
python3 blender/prepare_textures.py
blender --background --python blender/build_poster.py -- --plate all --samples 96 --res 860 1864
```

Outputs:

- `blender/out/frame-{white,cobalt,dark}.png`
- copied to `public/poster/frame-{white,cobalt,dark}.jpg`
- `blender/poster_studio.blend`

Preview a layout pass:

```bash
blender --background --python blender/build_poster.py -- --plate white --samples 24 --res 430 932 --inspect
```
