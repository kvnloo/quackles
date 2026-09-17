# First-frame Blender studio

The landing hero is a **Cycles still**, not CSS set dressing. This folder rebuilds that still.

## What is in the scene

- Official Microduck (`public/robot/mjlab/microduck.glb`) assembled from `kinematics.json` (MJCF Z-up, classic cream materials).
- Cream cyclorama + alcove arch, cobalt Apollo bust panel, limestone plinths, glass orb, cobalt square frame, Creation-of-Adam print, leaf.
- Three lighting plates: **white** (poster cream), **cobalt**, **dark**.

## Rebuild

Blender 4.2.x on `$PATH` (install: `~/.local/blender-4.2.23`, symlink `~/.local/bin/blender`).

```bash
python3 blender/prepare_textures.py
PATH="$HOME/.local/bin:$PATH" blender --background --python blender/build_poster.py -- \
  --plate all --samples 48 --res 430 932
python3 blender/export_jpeg.py
```

Outputs:

- `blender/out/frame-{white,cobalt,dark}.png`
- `public/poster/frame-{white,cobalt,dark}.jpg` (and `.png`)
- `blender/poster_studio.blend` (gitignored)

Layout inspect (fast):

```bash
PATH="$HOME/.local/bin:$PATH" blender --background --python blender/build_poster.py -- \
  --plate white --samples 16 --res 430 932
```

Generated limestone PBR (`T_limestone_{albedo,roughness,normal}.png`) plus `plinth_look.py` UV-prints the Creation fingers onto the limestone. Cinematic renders import that from `calibration/cinematic_theme.py`.

Quarry PBR maps live in `blender/assets/` (gitignored, `quarry_wall_*`). If they are missing the script falls back to procedural limestone.
