"""Actual Blender display transform for stored linear diagnostic arrays; no render."""
import argparse
import json
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_stone_diagnostic import sha, props


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepared", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    manifest_path = args.prepared / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    rp = manifest["render_receipt"]
    assert sha(rp["path"]) == rp["sha256"]
    render = json.loads(Path(rp["path"]).read_text())
    scene = bpy.context.scene
    color = render["locks_before"]["color"]
    scene.display_settings.display_device = color["display"]
    for name, val in color["view"].items():
        setattr(scene.view_settings, name, val)
    scene.render.dither_intensity = render["locks_before"]["render"]["dither_intensity"]
    scene.render.image_settings.media_type = "IMAGE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.color_management = "FOLLOW_SCENE"
    args.out.mkdir(parents=True, exist_ok=False)
    report = {"manifest": {"path": str(manifest_path), "sha256": sha(manifest_path)},
              "script_sha256": sha(Path(__file__)), "blender": bpy.app.version_string,
              "build_hash": bpy.app.build_hash.decode(), "color": color,
              "dither_intensity": scene.render.dither_intensity, "outputs": {}}
    for name, row in manifest["arrays"].items():
        assert sha(row["path"]) == row["sha256"]
        rgb = np.load(row["path"], allow_pickle=False)
        assert rgb.shape == (140, 470, 3) and np.isfinite(rgb).all()
        image = bpy.data.images.new(name, width=470, height=140, alpha=True, float_buffer=True)
        image.colorspace_settings.name = "Linear Rec.709"
        image.alpha_mode = "PREMUL"
        rgba = np.ones((140, 470, 4), np.float32)
        rgba[:, :, :3] = rgb[::-1]
        image.pixels.foreach_set(rgba.ravel())
        path = args.out / (name+".png")
        image.save_render(str(path), scene=scene)
        report["outputs"][name] = {"path": str(path), "sha256": sha(path), "linear_sha256": row["sha256"], "colorspace": image.colorspace_settings.name}
        bpy.data.images.remove(image)
    (args.out / "display-receipt.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print("DISPLAY_DONE", len(report["outputs"]), "native size; no normalization")


if __name__ == "__main__":
    main()
