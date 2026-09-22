"""One pinned current-source render, real Cycles passes, no shader intervention."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from render_stone_diagnostic import ROI, digest, graph, props, sha, snapshot, stone_materials, value

BASE = "0f42a301013c8430bb2e4f253fd668ab89e67594"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--donor", type=Path, required=True)
    parser.add_argument("--donor-sha256", required=True)
    parser.add_argument("--prior", type=Path, required=True)
    parser.add_argument("--ocio-config", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index("--")+1:])
    root = Path(__file__).resolve().parents[2]
    if args.out.resolve().is_relative_to(root):
        raise ValueError("evidence must be outside repository")
    assert sha(args.donor) == args.donor_sha256
    subprocess.run(["git", "-C", str(root), "diff", "--exit-code", BASE, "--", ".", ":(exclude)blender/validation"], check=True)
    sources = {str(p): sha(p) for p in sorted((root / "blender").rglob("*")) if p.is_file() and "validation" not in p.relative_to(root).parts and "__pycache__" not in p.parts}
    prior = json.loads(args.prior.read_text())
    assert prior["donor_sha256"] == args.donor_sha256
    prior_root = str(Path(next(iter(prior["sources"]))).parent.parent)
    for old_path, expected in prior["sources"].items():
        assert sha(root / Path(old_path).relative_to(prior_root)) == expected
    args.out.mkdir(parents=True, exist_ok=False)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root / "blender"))
    import cinematic_theme
    assert Path(cinematic_theme.__file__).resolve().is_relative_to(root)
    bpy.ops.wm.open_mainfile(filepath=str(args.donor))
    scene = bpy.context.scene
    camera_before = value(scene.camera.matrix_world)
    cinematic_theme.configure_theme(scene, "day")
    assert camera_before == value(scene.camera.matrix_world)
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 256
    scene.cycles.seed = 1729
    scene.cycles.use_animated_seed = False
    scene.cycles.use_denoising = False
    scene.cycles.use_adaptive_sampling = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = 4
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1536
    scene.render.resolution_percentage = 100
    scene.render.use_border = True
    scene.render.use_crop_to_border = True
    x0, y0, x1, y1 = ROI
    scene.render.border_min_x = x0/1024
    scene.render.border_max_x = x1/1024
    scene.render.border_min_y = (1536-y1)/1536
    scene.render.border_max_y = (1536-y0)/1536
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    materials = stone_materials()
    locked = snapshot(scene, materials)
    old_lock = prior["stages"][0]["locks"]
    relocated = json.loads(json.dumps(old_lock).replace(prior_root, str(root)))
    report = {
        "source_base": BASE, "head_at_render": subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(),
        "donor": str(args.donor), "donor_sha256": args.donor_sha256,
        "prior_receipt": {"path": str(args.prior), "sha256": sha(args.prior)},
        "root_relocation": {"from": prior_root, "to": str(root), "all_source_bytes_verified": True},
        "prior_locks_raw_equal": locked == old_lock,
        "prior_locks_raw_sha256": digest(old_lock),
        "prior_locks_equal_after_root_relocation": digest(locked) == digest(relocated),
        "locks_before": locked, "locks_before_sha256": digest(locked),
        "material_interventions": [], "sources": sources,
        "stone_graph_sha256": {name: digest(g) for name, g in locked["stone_graphs"].items()},
        "blender": bpy.app.version_string, "build_hash": bpy.app.build_hash.decode(),
        "script_sha256": sha(Path(__file__)), "helper_sha256": sha(Path(__file__).with_name("render_stone_diagnostic.py")),
        "roi_xyxy": ROI,
        "actual_compositor_5_2": graph(scene.compositing_node_group),
    }
    (args.out / "before.json").write_text(json.dumps(report, indent=2)+"\n")
    assert report["prior_locks_equal_after_root_relocation"], "scene lock drift"
    # Blender 5.2 stores the compositor on compositing_node_group, not node_tree.
    # Preserve it, export Composite separately, and reconstruct pre-compositor Combined.
    report["locks_before_dependency_update"] = locked
    bpy.context.view_layer.update()
    locked = snapshot(scene, materials)
    report["locks_before"] = locked
    report["locks_before_sha256"] = digest(locked)
    layer = bpy.context.view_layer
    pass_names = ["use_pass_combined", "use_pass_emit", "use_pass_environment"]
    pass_names += [f"use_pass_{family}_{kind}" for family in ("diffuse", "glossy", "transmission") for kind in ("direct", "indirect", "color")]
    for name in pass_names:
        setattr(layer, name, True)
    # Cycles volumes are separate additive terms, not Transmission.
    for name in ("use_pass_volume_direct", "use_pass_volume_indirect"):
        setattr(layer.cycles, name, True)
    report["pass_api"] = {name: getattr(layer, name) for name in pass_names}
    report["cycles_pass_api"] = props(layer.cycles, ("use_pass_volume_direct", "use_pass_volume_indirect"))
    report["layer"] = layer.name
    report["ocio_config"] = str(args.ocio_config)
    report["ocio_config_sha256"] = sha(report["ocio_config"])
    report["compositor_sha256"] = digest(report["actual_compositor_5_2"])
    report["compositor_after_pass_enable"] = graph(scene.compositing_node_group)
    png = args.out / "composite.png"
    scene.render.filepath = str(png)
    start = time.monotonic()
    bpy.ops.render.render(write_still=True)
    report["render_seconds"] = time.monotonic()-start
    result = bpy.data.images["Render Result"]
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    composite = args.out / "composite.exr"
    result.save_render(str(composite), scene=scene)
    scene.render.image_settings.media_type = "MULTI_LAYER_IMAGE"
    scene.render.image_settings.file_format = "OPEN_EXR_MULTILAYER"
    scene.render.image_settings.use_exr_interleave = True
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "ZIP"
    exr = args.out / "passes.exr"
    result.save_render(str(exr), scene=scene)
    report["multilayer_format"] = props(scene.render.image_settings, ("media_type", "file_format", "color_depth", "exr_codec", "use_exr_interleave"))
    scene.render.image_settings.media_type = "IMAGE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    report["locks_after"] = snapshot(scene, materials)
    report["compositor_after_render"] = graph(scene.compositing_node_group)
    report["outputs"] = {p.name: {"path": str(p), "sha256": sha(p)} for p in (png, exr, composite)}
    (args.out / "after.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    assert report["locks_after"] == locked, [k for k in locked if report["locks_after"][k] != locked[k]]
    assert report["compositor_after_render"] == report["compositor_after_pass_enable"]
    assert all(sha(p) == expected for p, expected in sources.items())
    assert sha(args.donor) == args.donor_sha256
    (args.out / "render-receipt.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
    print("BSDF_CAPTURE_DONE", report["render_seconds"], report["stone_graph_sha256"], flush=True)


if __name__ == "__main__":
    main()
