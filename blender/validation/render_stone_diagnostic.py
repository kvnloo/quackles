"""Pinned, bounded Day stone output-closure diagnostic. Run only in headless Blender.

No source asset writes, scene save, preference save, sweep, motion or light edits.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time

import bpy
import numpy as np

BASE = "3dc142aaa6085b1ffdb9fa21c41d3de9461ed134"
ROI = (430, 1365, 900, 1505)
EXPECTED = {
    "T_pedestal_albedo.png": "6dc14f579a71ca2df8c8b42838e38a08c0c2cd3bd0a39aa662005b5ea3141023",
    "T_pedestal_roughness.png": "12647c4ed3d058b45c032368a033d3b5c098e02e5d5251997457dd9fd8f2f0a3",
}


def sha(path):
    with open(path, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, allow_nan=False).encode()).hexdigest()


def value(v):
    if isinstance(v, (str, float, int, bool)) or v is None:
        return v
    try:
        return [value(x) for x in v]
    except TypeError:
        return getattr(v, "name", str(type(v)))


def props(obj, names):
    return {name: value(getattr(obj, name)) for name in names if hasattr(obj, name)}


def graph(tree):
    if tree is None:
        return None
    nodes = []
    for n in sorted(tree.nodes, key=lambda n: n.name):
        row = {"name": n.name, "type": n.bl_idname,
               "properties": props(n, ("operation", "blend_type", "interpolation", "extension", "projection", "projection_blend", "vector_type", "clamp", "use_clamp", "distribution", "subsurface_method", "is_active_output", "target")),
               "inputs": [{"name": s.name, "identifier": s.identifier, "default": value(s.default_value) if hasattr(s, "default_value") else None} for s in n.inputs],
               "outputs": [{"name": s.name, "identifier": s.identifier, "default": value(s.default_value) if hasattr(s, "default_value") else None} for s in n.outputs]}
        if n.type == "TEX_IMAGE" and n.image:
            image = n.image
            path = Path(bpy.path.abspath(image.filepath))
            row["image"] = {"name": image.name, "filepath": str(path), "size": list(image.size), "colorspace": image.colorspace_settings.name,
                            "external_sha256": sha(path) if path.is_file() else None,
                            "packed_sha256": hashlib.sha256(bytes(image.packed_file.data)).hexdigest() if image.packed_file else None}
        if n.type == "VALTORGB":
            row["ramp"] = {"interpolation": n.color_ramp.interpolation, "elements": [(e.position, list(e.color)) for e in n.color_ramp.elements]}
        if n.type == "GROUP":
            row["group"] = graph(n.node_tree)
        nodes.append(row)
    links = sorted((l.from_node.name, l.from_socket.identifier, l.to_node.name, l.to_socket.identifier) for l in tree.links)
    return {"nodes": nodes, "links": links}


def mesh_hash(mesh):
    h = hashlib.sha256()
    for collection, field, width, dtype in ((mesh.vertices, "co", 3, np.float32), (mesh.loops, "vertex_index", 1, np.int32)):
        data = np.empty(len(collection)*width, dtype=dtype)
        collection.foreach_get(field, data)
        h.update(data.tobytes())
    for layer in mesh.uv_layers:
        data = np.empty(len(layer.data)*2, dtype=np.float32)
        layer.data.foreach_get("uv", data)
        h.update(layer.name.encode())
        h.update(data.tobytes())
    return h.hexdigest()


def stone_materials():
    hero = bpy.data.objects["Hero limestone"]
    materials = list({slot.material.name: slot.material for slot in hero.material_slots if slot.material}.values())
    if not materials:
        raise AssertionError("hero has no material")
    for m in materials:
        nt = m.node_tree
        assert nt and "PedestalStone" in nt.nodes, m.name
        bs = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
        assert abs(bs.inputs["Specular IOR Level"].default_value-.2) < 1e-7
        assert bs.inputs["Roughness"].is_linked
        assert not bs.inputs["Normal"].is_linked
        assert bs.inputs["Metallic"].default_value == 0
        assert bs.inputs["Emission Strength"].default_value == 0
        assert "CreationMix" in nt.nodes and "CreationInkOnly" in nt.nodes
        gate = nt.nodes["CreationInkOnly"]
        assert abs(gate.inputs["From Min"].default_value-.62) < 1e-7
        assert abs(gate.inputs["From Max"].default_value-.92) < 1e-7
        scales = {"X": [], "Y": [], "Z": []}
        for n in nt.nodes:
            if n.type == "MATH" and n.operation == "MULTIPLY" and n.inputs[0].is_linked:
                source = n.inputs[0].links[0].from_socket
                if source.node.type == "SEPXYZ" and source.name in scales:
                    scales[source.name].append(n.inputs[1].default_value)
        assert all(scales.values()), scales
        for axis, values in scales.items():
            assert all(abs(x-({"X": 6.2, "Y": 6.2, "Z": 8.8}[axis])) < 1e-6 for x in values), scales
        for name, colorspace in (("PedestalStone", "sRGB"), ("PedestalRough", "Non-Color")):
            image = nt.nodes[name].image
            path = Path(bpy.path.abspath(image.filepath))
            assert sha(path) == EXPECTED[path.name]
            assert image.colorspace_settings.name == colorspace
        output = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
        assert output.inputs["Surface"].links[0].from_node == bs
    return materials


def snapshot(scene, mats):
    cam = scene.camera
    hero = bpy.data.objects["Hero limestone"]
    return {
        "camera": {"name": cam.name, "matrix_world": value(cam.matrix_world),
                   "data": props(cam.data, ("type", "lens", "sensor_width", "sensor_height", "sensor_fit", "shift_x", "shift_y", "clip_start", "clip_end", "ortho_scale")),
                   "dof": props(cam.data.dof, ("use_dof", "focus_distance", "focus_object", "aperture_fstop", "aperture_blades", "aperture_ratio", "aperture_rotation"))},
        "objects": {o.name: {"matrix": value(o.matrix_world), "hide_render": o.hide_render,
                    "visible_camera": o.visible_camera, "materials": [slot.material.name if slot.material else None for slot in o.material_slots]} for o in scene.objects},
        "hero_geometry_sha256": mesh_hash(hero.data),
        "hero_modifiers": [{"name": m.name, "type": m.type, **props(m, ("levels", "render_levels", "strength", "show_render"))} for m in hero.modifiers],
        "stone_graphs": {m.name: graph(m.node_tree) for m in mats},
        "lights": {o.name: {"matrix": value(o.matrix_world), "data": props(o.data, ("type", "energy", "color", "angle", "shape", "size", "size_y", "use_shadow")), "graph": graph(o.data.node_tree)} for o in scene.objects if o.type == "LIGHT"},
        "world": graph(scene.world.node_tree),
        "compositor": graph(getattr(scene, "node_tree", None)),
        "image_settings": props(scene.render.image_settings, ("file_format", "color_mode", "color_depth", "color_management")),
        "film": props(scene, ("frame_current", "frame_subframe")),
        "render": props(scene.render, ("engine", "resolution_x", "resolution_y", "resolution_percentage", "threads_mode", "threads", "filter_size", "use_border", "use_crop_to_border", "border_min_x", "border_max_x", "border_min_y", "border_max_y", "film_transparent", "use_compositing", "use_sequencer", "dither_intensity")),
        "cycles": props(scene.cycles, ("device", "samples", "seed", "use_animated_seed", "use_denoising", "use_adaptive_sampling", "pixel_filter_type", "max_bounces", "diffuse_bounces", "glossy_bounces", "transmission_bounces", "transparent_max_bounces", "sample_clamp_direct", "sample_clamp_indirect")),
        "color": {"view": props(scene.view_settings, ("view_transform", "look", "exposure", "gamma", "use_curve_mapping", "use_white_balance", "temperature", "tint")), "display": scene.display_settings.display_device},
    }


def emission(mats):
    changes = []
    for material in mats:
        nt = material.node_tree
        before = graph(nt)
        output = next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL" and n.is_active_output)
        old = output.inputs["Surface"].links[0]
        removed = (old.from_node.name, old.from_socket.identifier, old.to_node.name, old.to_socket.identifier)
        source = nt.nodes["CreationMix"].inputs[1].links[0].from_socket
        node = nt.nodes.new("ShaderNodeEmission")
        node.name = "DiagnosticPreprintUnitEmission"
        node.inputs["Strength"].default_value = 1.0
        nt.links.new(source, node.inputs["Color"])
        nt.links.remove(old)
        nt.links.new(node.outputs["Emission"], output.inputs["Surface"])
        after = graph(nt)
        assert [n for n in after["nodes"] if n["name"] != node.name] == before["nodes"]
        expected_links = set(before["links"])-{removed}
        expected_links |= {(source.node.name, source.identifier, node.name, node.inputs["Color"].identifier), (node.name, node.outputs["Emission"].identifier, output.name, output.inputs["Surface"].identifier)}
        assert set(after["links"]) == expected_links
        changes.append({"material": material.name, "preprint_source": [source.node.name, source.identifier], "removed_surface_link": removed, "strength": 1., "before_graph_sha256": digest(before), "after_graph_sha256": digest(after)})
    return changes


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--donor", type=Path, required=True)
    p.add_argument("--donor-sha256", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--check-only", action="store_true")
    a = p.parse_args(sys.argv[sys.argv.index("--")+1:])
    root = Path(__file__).resolve().parents[2]
    a.out = a.out.absolute()
    if a.out.is_relative_to(root):
        raise ValueError("render output must be outside Git")
    assert sha(a.donor) == a.donor_sha256, "donor hash mismatch"
    subprocess.run(["git", "-C", str(root), "diff", "--exit-code", BASE, "--", "blender", ":(exclude)blender/validation"], check=True, capture_output=True)
    sources = {str(path): sha(path) for path in sorted((root / "blender").rglob("*")) if path.is_file() and "validation" not in path.relative_to(root).parts and "__pycache__" not in path.parts}
    a.out.mkdir(parents=True, exist_ok=False)
    sys.dont_write_bytecode = True
    sys.path.insert(0, str(root / "blender"))
    import cinematic_theme
    assert Path(cinematic_theme.__file__).resolve().is_relative_to(root)
    report = {"base_commit": BASE, "head_at_render": subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip(),
              "blender": bpy.app.version_string, "build_hash": bpy.app.build_hash.decode(),
              "script_sha256": sha(Path(__file__)), "donor": str(a.donor), "donor_sha256": a.donor_sha256,
              "sources": sources, "roi_xyxy": ROI, "check_only": a.check_only, "stages": []}
    baseline = None
    for stage in (("preflight",) if a.check_only else ("beauty", "emission", "beauty-repeat")):
        bpy.ops.wm.open_mainfile(filepath=str(a.donor))
        scene = bpy.context.scene
        camera_before = value(scene.camera.matrix_world)
        cinematic_theme.configure_theme(scene, "day")
        assert camera_before == value(scene.camera.matrix_world), "theme changed donor camera"
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
        mats = stone_materials()
        locked = snapshot(scene, mats)
        if baseline is None:
            baseline = locked
        assert locked == baseline, f"lock drift before {stage}"
        row = {"stage": stage, "locks_sha256": digest(locked), "locks": locked, "intervention": []}
        if stage == "emission":
            row["intervention"] = emission(mats)
            after = snapshot(scene, mats)
            assert {k: v for k, v in locked.items() if k != "stone_graphs"} == {k: v for k, v in after.items() if k != "stone_graphs"}
        (a.out / f"{stage}-before.json").write_text(json.dumps(row, indent=2)+"\n")
        if not a.check_only:
            path = a.out / f"{stage}.png"
            scene.render.filepath = str(path)
            start = time.monotonic()
            bpy.ops.render.render(write_still=True)
            row["seconds"] = time.monotonic()-start
            result = bpy.data.images["Render Result"]
            scene.render.image_settings.file_format = "OPEN_EXR"
            scene.render.image_settings.color_depth = "32"
            scene.render.image_settings.color_mode = "RGB"
            scene.render.image_settings.exr_codec = "ZIP"
            exr = a.out / f"{stage}-linear.exr"
            result.save_render(str(exr), scene=scene)
            linear = bpy.data.images.load(str(exr), check_existing=False)
            w, h = linear.size
            assert (w, h) == (470, 140), (w, h)
            rgba = np.empty(w*h*4, dtype=np.float32)
            linear.pixels.foreach_get(rgba)
            rgb = rgba.reshape(h, w, 4)[::-1, :, :3].copy()
            assert np.isfinite(rgb).all()
            npy = a.out / f"{stage}-linear.npy"
            np.save(npy, rgb, allow_pickle=False)
            bpy.data.images.remove(linear)
            row["outputs"] = {p.name: {"path": str(p), "sha256": sha(p)} for p in (path, exr, npy)}
        report["stages"].append(row)
        (a.out / "render-receipt.json").write_text(json.dumps(report, indent=2, allow_nan=False)+"\n")
        print("STONE_STAGE", stage, row.get("seconds"), flush=True)
    assert sha(a.donor) == a.donor_sha256
    assert all(sha(Path(path)) == expected for path, expected in sources.items())
    print("STONE_DONE", len(report["stages"]), "sources unchanged", flush=True)


if __name__ == "__main__":
    main()
