"""200MP Cycles still of cinematic Blue first frame (nightly lock).

Theme blue, quality-final-cobalt.blend, progress 0, 2:3 poster camera.
Hybrid Cycles: OPTIX GPU + CPU with auto tiles so the 12 GB FB fits.
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import bpy

CAL = Path("/home/kvn/Documents/Codex/2026-09-16/c/work/calibration")
OUT = Path("/mnt/zer0models/quackles-200mp")
sys.path.insert(0, str(CAL))
from cinematic_theme import configure_theme  # noqa: E402
from cinematic_motion import apply_motion, configure_motion, geometry_hash  # noqa: E402

# 11584 x 17376 = 201.323 MP, 2:3 same as nightly first frame.
WIDTH = 11584
HEIGHT = 17376
SAMPLES = 16


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(CAL / "quality-final-cobalt.blend"))
    s = bpy.context.scene
    s.render.engine = "CYCLES"
    configure_theme(s, "blue")
    cyc = s.cycles
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"
    prefs.get_devices()
    selected = []
    for device in prefs.devices:
        # Hybrid: OptiX GPU plus CPU threads. Skip CUDA when OptiX is present.
        use = device.type in ("OPTIX", "CPU")
        device.use = use
        if use:
            selected.append(f"{device.type}:{device.name}")
    if not any(d.startswith("OPTIX:") for d in selected):
        prefs.compute_device_type = "CUDA"
        prefs.get_devices()
        selected = []
        for device in prefs.devices:
            use = device.type in ("CUDA", "CPU")
            device.use = use
            if use:
                selected.append(f"{device.type}:{device.name}")
    print("PROCESS_RENDER_DEVICES", selected, flush=True)
    cyc.device = "GPU"
    s.render.use_persistent_data = False
    # OIDN on ~200MP SIGSEGV'd Blender 5.2 after the hybrid sample pass.
    cyc.use_denoising = False
    cyc.samples = SAMPLES
    cyc.use_adaptive_sampling = True
    cyc.adaptive_threshold = 0.02
    cyc.adaptive_min_samples = 4
    cyc.use_auto_tile = True
    try:
        cyc.tile_size = 128
    except Exception:
        pass
    s.render.resolution_x = WIDTH
    s.render.resolution_y = HEIGHT
    s.render.resolution_percentage = 100
    s.render.image_settings.file_format = "PNG"
    s.render.image_settings.color_mode = "RGB"
    s.render.image_settings.color_depth = "8"
    s.render.threads_mode = "AUTO"
    s.render.use_compositing = False
    s.render.use_sequencer = False
    # Full 200MP write_still SIGSEGV'd Blender 5.2 twice; crop 2x2 then stitch.
    s.render.use_border = True
    s.render.use_crop_to_border = True
    state = configure_motion(s)
    meta = apply_motion(s, state, 0.0)
    path = OUT / "blue-p0-200mp.png"
    print("RENDER_START", WIDTH, HEIGHT, SAMPLES, "quads", flush=True)
    start = time.monotonic()
    tiles = []
    # Blender border: min_y is bottom. Grid is col,row from top-left for montage.
    quads = [
        ("tl", 0.0, 0.5, 0.5, 1.0),
        ("tr", 0.5, 1.0, 0.5, 1.0),
        ("bl", 0.0, 0.5, 0.0, 0.5),
        ("br", 0.5, 1.0, 0.0, 0.5),
    ]
    for name, xmin, xmax, ymin, ymax in quads:
        s.render.border_min_x = xmin
        s.render.border_max_x = xmax
        s.render.border_min_y = ymin
        s.render.border_max_y = ymax
        tile = OUT / f"blue-p0-200mp-{name}.png"
        s.render.filepath = str(tile)
        print("RENDER_QUAD", name, flush=True)
        bpy.ops.render.render(write_still=True)
        tiles.append(tile)
    import subprocess

    subprocess.check_call(
        [
            "magick",
            "(",
            str(OUT / "blue-p0-200mp-tl.png"),
            str(OUT / "blue-p0-200mp-tr.png"),
            "+append",
            ")",
            "(",
            str(OUT / "blue-p0-200mp-bl.png"),
            str(OUT / "blue-p0-200mp-br.png"),
            "+append",
            ")",
            "-append",
            str(path),
        ]
    )
    seconds = time.monotonic() - start
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    receipt = {
        "theme": "blue",
        "progress": 0.0,
        "width": WIDTH,
        "height": HEIGHT,
        "megapixels": round(WIDTH * HEIGHT / 1e6, 3),
        "samples": SAMPLES,
        "seconds": seconds,
        "bytes": path.stat().st_size,
        "sha256": digest,
        "robot_mesh_hash": geometry_hash(state["root"]),
        "path": str(path),
        "engine": "CYCLES",
        "device": "GPU+CPU",
        "devices": selected,
        "tiles": "2x2-crop",
        "blend": str(CAL / "quality-final-cobalt.blend"),
        **{k: meta[k] for k in meta if k in ("progress",)},
    }
    path.with_suffix(".json").write_text(json.dumps(receipt, indent=2) + "\n")
    print("RENDER_OK", json.dumps(receipt), flush=True)


if __name__ == "__main__":
    main()
