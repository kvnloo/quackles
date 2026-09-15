#!/usr/bin/env python3
"""Assemble the Microduck poster studio in Blender and render phone plates.

Run via:
  blender --background --python blender/build_poster.py -- --plate white --samples 48
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector
from bpy_extras.object_utils import world_to_camera_view

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
ASSETS = HERE / "assets"
OUT = HERE / "out"
PUBLIC = ROOT / "public" / "poster"
GLB = ROOT / "public" / "robot" / "mjlab" / "microduck.glb"
KIN = ROOT / "public" / "robot" / "mjlab" / "kinematics.json"

COBALT = (0.118, 0.216, 1.0)
CREAM = (0.90, 0.86, 0.81)
PAPER = (0.86, 0.82, 0.76)
STONE = (0.72, 0.66, 0.58)
INK = (0.03, 0.045, 0.12)

# Classic cream Microduck (sRGB hex -> assigned as Blender base colors).
MESH_MATS = {
    "top_head_shell.stl": ("#e4d5c0", 0.52, 0.0),
    "bottom_head_shell.stl": ("#e4d5c0", 0.52, 0.0),
    "face_part.stl": ("#1a1a1e", 0.28, 0.12),
    "noenoeil.stl": ("#2a2a2e", 0.28, 0.08),
    "lens.stl": ("#05060a", 0.05, 0.0),
    "m12_lens_holder.stl": ("#1d1d1f", 0.45, 0.25),
    "soft_mouth_top.stl": ("#8a7a6a", 0.5, 0.0),
    "jaw.stl": ("#8a7a6a", 0.42, 0.0),
    "jaw_soft.stl": ("#8a7a6a", 0.5, 0.0),
    "trunk_base.stl": ("#e4d5c0", 0.52, 0.0),
    "left_shell.stl": ("#e4d5c0", 0.52, 0.0),
    "right_shell.stl": ("#e4d5c0", 0.52, 0.0),
    "upper_leg_left.stl": ("#3a3a3e", 0.48, 0.08),
    "upper_leg_right.stl": ("#3a3a3e", 0.48, 0.08),
    "hip_l.stl": ("#8b8b90", 0.5, 0.2),
    "foot_left.stl": ("#e4d5c0", 0.5, 0.0),
    "foot_right.stl": ("#e4d5c0", 0.5, 0.0),
    "ankle_left.stl": ("#e4d5c0", 0.5, 0.0),
    "ankle_right.stl": ("#e4d5c0", 0.5, 0.0),
    "sole_left.stl": ("#e56b1a", 0.55, 0.0),
    "sole_right.stl": ("#e56b1a", 0.55, 0.0),
    "xl330.stl": ("#1d1d1f", 0.45, 0.3),
    "leg.stl": ("#8b8b90", 0.5, 0.25),
    "seeed_bearing__configuration_default.stl": ("#1d1d1f", 0.45, 0.3),
    "yaw2roll.stl": ("#1d1d1f", 0.45, 0.3),
    "bearing_roll.stl": ("#1d1d1f", 0.45, 0.3),
    "neck.stl": ("#8b8b90", 0.5, 0.2),
    "np_f970.stl": ("#1d1d1f", 0.45, 0.3),
    "pcb__raspberry_pi_zero_2_w.stl": ("#1d1d1f", 0.45, 0.3),
    "elec_rpi_robot_hat_pcb.stl": ("#1d1d1f", 0.45, 0.3),
    "banana_pcb_locker.stl": ("#1d1d1f", 0.45, 0.3),
    "speaker.stl": ("#1d1d1f", 0.45, 0.3),
    "upper_leg_rigidity_plate.stl": ("#8b8b90", 0.5, 0.2),
    "yaw_roll_motion.stl": ("#8b8b90", 0.5, 0.2),
    "neck_pitch.stl": ("#8b8b90", 0.5, 0.2),
    "motor_support.stl": ("#8b8b90", 0.5, 0.2),
    "power_support.stl": ("#8b8b90", 0.5, 0.2),
    "seeed_bearing__configuration__22x16x4.stl": ("#8b8b90", 0.5, 0.2),
}

DEFAULT_POSE = {
    "left_hip_yaw": 0.0,
    "left_hip_roll": -0.087266,
    "left_hip_pitch": -0.457924,
    "left_knee": -0.004940,
    "left_ankle": 0.452984,
    "neck_pitch": 0.349066,
    "head_pitch": 0.349066,
    "head_yaw": 0.0,
    "head_roll": 0.0,
    "right_hip_yaw": 0.0,
    "right_hip_roll": 0.087266,
    "right_hip_pitch": 0.457924,
    "right_knee": 0.004940,
    "right_ankle": -0.452984,
}

# Upright 3/4 poster stance — Microduck silhouette, planted on the plinth.
STANDING = {
    **DEFAULT_POSE,
    "left_hip_pitch": -0.10,
    "right_hip_pitch": 0.10,
    "left_knee": 0.14,
    "right_knee": -0.14,
    "left_ankle": -0.06,
    "right_ankle": 0.06,
    "neck_pitch": 0.18,
    "head_pitch": 0.06,
    "head_yaw": -0.35,
}

PLINTH_TOP = 0.125


def srgb_to_lin(c: float) -> float:
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgba(h: str) -> tuple[float, float, float, float]:
    h = h.lstrip("#")
    r, g, b = int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255
    return (srgb_to_lin(r), srgb_to_lin(g), srgb_to_lin(b), 1.0)


def q_wxyz(q) -> Quaternion:
    return Quaternion((float(q[0]), float(q[1]), float(q[2]), float(q[3])))


def look_at(obj, target, up="Y"):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", up).to_euler()


def link(obj, coll):
    if obj.name not in coll.objects:
        coll.objects.link(obj)
    for c in list(obj.users_collection):
        if c != coll:
            c.objects.unlink(obj)
    return obj


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        if mat.users == 0:
            bpy.data.materials.remove(mat)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    return scene


def principled(name, color, roughness=0.45, metalness=0.0, **kw):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if isinstance(color, str):
        rgba = hex_rgba(color)
    elif len(color) == 3:
        rgba = (*color, 1.0)
    else:
        rgba = tuple(color)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    if "Metallic" in bsdf.inputs:
        bsdf.inputs["Metallic"].default_value = metalness
    if "transmission" in kw and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = kw["transmission"]
    if "ior" in kw and "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = kw["ior"]
    if "alpha" in kw and "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = kw["alpha"]
        mat.blend_method = "BLEND" if kw["alpha"] < 1 else "OPAQUE"
    if "emission" in kw and "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = kw["emission"]
        bsdf.inputs["Emission Strength"].default_value = kw.get("emission_strength", 1.0)
    return mat


def load_image(path: Path):
    img = bpy.data.images.load(str(path), check_existing=True)
    img.colorspace_settings.name = "sRGB"
    return img


def image_mat(name, path: Path, *, alpha=False, roughness=0.55, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = load_image(path)
    tex.location = (-400, 0)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if emission > 0 and "Emission Color" in bsdf.inputs:
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emission
    if alpha:
        nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
        mat.blend_method = "BLEND"
        if hasattr(mat, "shadow_method"):
            mat.shadow_method = "CLIP"
    return mat


def stone_mat(name="Stone"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (1.6, 1.6, 1.6)
    diff = nt.nodes.new("ShaderNodeTexImage")
    diff.image = load_image(ASSETS / "quarry_wall_diff_2k.jpg")
    nor = nt.nodes.new("ShaderNodeTexImage")
    nor.image = bpy.data.images.load(str(ASSETS / "quarry_wall_nor_gl_2k.jpg"), check_existing=True)
    nor.image.colorspace_settings.name = "Non-Color"
    nor.interpolation = "Cubic"
    rough = nt.nodes.new("ShaderNodeTexImage")
    rough.image = bpy.data.images.load(str(ASSETS / "quarry_wall_rough_2k.jpg"), check_existing=True)
    rough.image.colorspace_settings.name = "Non-Color"
    nmap = nt.nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.55
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 28.0
    noise.inputs["Detail"].default_value = 10.0
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.36, 0.32, 0.26, 1)
    ramp.color_ramp.elements[1].color = (0.58, 0.52, 0.44, 1)
    nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
    nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    factor = mix.inputs.get("Factor") or mix.inputs[0]
    factor.default_value = 0.55
    a_in = mix.inputs.get("A") or mix.inputs.get("Color1") or mix.inputs[6]
    b_in = mix.inputs.get("B") or mix.inputs.get("Color2") or mix.inputs[7]
    mix_out = mix.outputs.get("Result") or mix.outputs.get("Color") or mix.outputs[2]
    quarry = ASSETS / "quarry_wall_diff_2k.jpg"
    if quarry.exists():
        nt.links.new(mapping.outputs["Vector"], diff.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], nor.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], rough.inputs["Vector"])
        nt.links.new(diff.outputs["Color"], a_in)
        nt.links.new(ramp.outputs["Color"], b_in)
        nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        nt.links.new(rough.outputs["Color"], bsdf.inputs["Roughness"])
        nmap.inputs["Strength"].default_value = 0.82
    else:
        nt.links.new(ramp.outputs["Color"], a_in)
        b_in.default_value = (0.50, 0.45, 0.38, 1)
        factor.default_value = 0.2
    bc = nt.nodes.new("ShaderNodeBrightContrast")
    bc.inputs["Bright"].default_value = -0.14
    bc.inputs["Contrast"].default_value = 0.22
    nt.links.new(mix_out, bc.inputs["Color"])
    nt.links.new(bc.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.78
    return mat


def box_uv(obj, scale=1.4):
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    for poly in me.polygons:
        n = poly.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for li in poly.loop_indices:
            co = obj.matrix_world @ me.vertices[me.loops[li].vertex_index].co
            if ax == 0:
                u, v = co.y, co.z
            elif ax == 1:
                u, v = co.x, co.z
            else:
                u, v = co.x, co.y
            uv[li].uv = (u * scale, v * scale)


def new_mesh_object(name, verts, faces, coll, mat=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    return obj


def add_cube(name, size, location, coll, mat=None, bevel=0.0):
    sx, sy, sz = size if isinstance(size, (tuple, list, Vector)) else (size, size, size)
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    verts = [
        (-hx, -hy, -hz),
        (hx, -hy, -hz),
        (hx, hy, -hz),
        (-hx, hy, -hz),
        (-hx, -hy, hz),
        (hx, -hy, hz),
        (hx, hy, hz),
        (-hx, hy, hz),
    ]
    faces = [
        (0, 1, 2, 3),
        (4, 5, 6, 7),
        (0, 1, 5, 4),
        (1, 2, 6, 5),
        (2, 3, 7, 6),
        (3, 0, 4, 7),
    ]
    obj = new_mesh_object(name, verts, faces, coll, mat)
    obj.location = Vector(location)
    if bevel > 0:
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    box_uv(obj)
    for p in obj.data.polygons:
        p.use_smooth = bevel > 0
    return obj


def add_plane(name, size, location, rotation, coll, mat=None):
    w, h = size
    hw, hh = w / 2, h / 2
    verts = [(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)]
    obj = new_mesh_object(name, verts, [(0, 1, 2, 3)], coll, mat)
    obj.location = Vector(location)
    obj.rotation_euler = rotation
    me = obj.data
    if not me.uv_layers:
        me.uv_layers.new(name="UVMap")
    uv = me.uv_layers.active.data
    uv[0].uv = (0, 0)
    uv[1].uv = (1, 0)
    uv[2].uv = (1, 1)
    uv[3].uv = (0, 1)
    return obj


def add_sphere(name, radius, location, coll, mat, segments=48):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, segments=segments, ring_count=segments // 2, location=location
    )
    obj = bpy.context.active_object
    obj.name = name
    link(obj, coll)
    if mat:
        obj.data.materials.clear()
        obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def add_area(name, loc, size, energy, color, coll, target):
    light = bpy.data.lights.new(name, "AREA")
    light.shape = "RECTANGLE"
    light.size = size[0]
    light.size_y = size[1]
    light.energy = energy
    light.color = color
    light.shadow_soft_size = 0.25
    obj = bpy.data.objects.new(name, light)
    obj.location = Vector(loc)
    look_at(obj, target)
    coll.objects.link(obj)
    return obj


def collection(name):
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def import_glb_parts():
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(GLB))
    new = [o for o in bpy.data.objects if o not in before]
    parts = {}
    for o in new:
        if o.type != "MESH":
            o.hide_render = True
            o.hide_viewport = True
            continue
        o.parent = None
        o.location = (0, 0, 0)
        o.rotation_euler = (0, 0, 0)
        o.scale = (1, 1, 1)
        parts[o.name] = o
        o.hide_render = True
        o.hide_viewport = True
    return parts


def match_part(parts, mesh_name: str):
    if mesh_name in parts:
        return parts[mesh_name]
    stem = mesh_name.replace(".stl", "")
    for k, o in parts.items():
        kn = k.split(".")[0]
        if kn == mesh_name or kn == stem or kn.replace("_", "") == stem.replace("_", ""):
            return o
        if k == stem or k.startswith(stem + "."):
            return o
    return None


def assemble_duck(parts, coll):
    k = json.loads(KIN.read_text())
    root = bpy.data.objects.new("duck_root", None)
    root.empty_display_size = 0.04
    coll.objects.link(root)
    bodies = {}
    for b in k["bodies"]:
        empty = bpy.data.objects.new(b["name"], None)
        empty.empty_display_size = 0.01
        empty.rotation_mode = "QUATERNION"
        coll.objects.link(empty)
        bodies[b["name"]] = empty
    for b in k["bodies"]:
        empty = bodies[b["name"]]
        parent = bodies[b["parent"]] if b.get("parent") and b["parent"] in bodies else root
        empty.parent = parent
        empty.matrix_parent_inverse = Matrix.Identity(4)
        empty.location = Vector(b["pos"])
        empty.rotation_quaternion = q_wxyz(b["quat"])

    bases = {name: empty.rotation_quaternion.copy() for name, empty in bodies.items()}
    joints = {}
    for b in k["bodies"]:
        j = b.get("joint")
        if not j:
            continue
        if j.get("type") and j["type"] != "hinge":
            continue
        joints[j["name"]] = {
            "body": bodies[b["name"]],
            "axis": Vector(j["axis"]).normalized(),
            "base": bases[b["name"]].copy(),
        }

    mats = {}
    instances = []
    seen = set()
    for b in k["bodies"]:
        body = bodies[b["name"]]
        for geom in b.get("geoms", []):
            if geom.get("type") and geom["type"] != "mesh":
                continue
            mesh_name = geom.get("mesh")
            if not mesh_name:
                continue
            dup = f"{b['name']}|{mesh_name}|{geom.get('pos')}|{geom.get('quat')}"
            if dup in seen:
                continue
            seen.add(dup)
            src = match_part(parts, mesh_name)
            if src is None:
                print("MISSING mesh", mesh_name)
                continue
            inst = src.copy()
            inst.data = src.data
            inst.name = f"{b['name']}__{mesh_name}"
            coll.objects.link(inst)
            inst.hide_set(False)
            inst.hide_render = False
            inst.hide_viewport = False
            inst.rotation_mode = "QUATERNION"
            inst.parent = body
            inst.matrix_parent_inverse = Matrix.Identity(4)
            inst.location = Vector(geom.get("pos") or (0, 0, 0))
            inst.rotation_quaternion = q_wxyz(geom.get("quat") or (1, 0, 0, 0))
            spec = MESH_MATS.get(mesh_name, ("#8b8b90", 0.5, 0.2))
            key = f"{spec[0]}|{spec[1]}|{spec[2]}"
            if key not in mats:
                mats[key] = principled(f"duck_{key}", spec[0], spec[1], spec[2])
            inst.data = inst.data.copy()
            inst.data.materials.clear()
            inst.data.materials.append(mats[key])
            for p in inst.data.polygons:
                p.use_smooth = True
            instances.append(inst)

    def set_joint(name, angle):
        j = joints.get(name)
        if not j:
            return
        delta = Quaternion(j["axis"], float(angle))
        j["body"].rotation_quaternion = j["base"] @ delta

    for name, ang in STANDING.items():
        set_joint(name, ang)

    bpy.context.view_layer.update()
    trunk = bodies["trunk_base"].matrix_world.translation.copy()
    keep_bits = ("foot", "sole", "ankle", "shell", "head", "trunk", "jaw", "face", "lens", "mouth", "noenoeil")
    for inst in instances:
        w = inst.matrix_world.translation
        n = inst.name.lower()
        delta = (w - trunk).length
        left_stray = w.x < trunk.x - 0.095 and not any(k in n for k in keep_bits)
        if delta > 0.16 or left_stray:
            print("OUTLIER hide", inst.name, "d", round(delta, 3), "left", left_stray, w)
            inst.hide_render = True
            inst.hide_viewport = True
        if any(k in n for k in ("lens", "face_part", "noenoeil", "top_head")):
            print("FACE", inst.name, tuple(round(v, 4) for v in w))
    return root, instances, parts


def ground_to(root, z_top):
    bpy.context.view_layer.update()
    mins = []
    sole_mins = []
    for obj in root.children_recursive:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for corner in obj.bound_box:
            z = (obj.matrix_world @ Vector(corner)).z
            mins.append(z)
            n = obj.name.lower()
            if "sole" in n or "foot" in n:
                sole_mins.append(z)
    use = sole_mins or mins
    if not use:
        return
    dz = z_top - min(use)
    root.location.z += dz
    bpy.context.view_layer.update()
    print("ground dz", round(dz, 4), "using", "soles" if sole_mins else "bbox")


def make_arch(coll, mat):
    # Thick masonry opening — a fat bezier tube, not a pipe.
    curve_data = bpy.data.curves.new("ArchCurve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = 0.088
    curve_data.bevel_resolution = 8
    curve_data.fill_mode = "FULL"
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(4)
    w, h = 0.27, 0.52
    pts = [
        (-w, 0, 0.0),
        (-w, 0, h * 0.55),
        (0.0, 0, h),
        (w, 0, h * 0.55),
        (w, 0, 0.0),
    ]
    for bp, p in zip(spline.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
    obj = bpy.data.objects.new("Arch", curve_data)
    obj.location = (0.03, 0.26, 0.10)
    coll.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def make_frame(coll, mat):
    # Hollow cobalt square standing on the left, matching the poster prop.
    t = 0.016
    outer = 0.13
    depth = 0.018
    loc = Vector((-0.14, 0.02, 0.20))
    pieces = []
    specs = [
        ("FrameTop", (outer, depth, t), (0, 0, outer / 2 - t / 2)),
        ("FrameBot", (outer, depth, t), (0, 0, -outer / 2 + t / 2)),
        ("FrameL", (t, depth, outer - 2 * t), (-outer / 2 + t / 2, 0, 0)),
        ("FrameR", (t, depth, outer - 2 * t), (outer / 2 - t / 2, 0, 0)),
    ]
    empty = bpy.data.objects.new("BlueFrame", None)
    empty.location = loc
    coll.objects.link(empty)
    for name, size, off in specs:
        p = add_cube(name, size, (0, 0, 0), coll, mat, bevel=0.003)
        p.location = Vector(off)
        p.parent = empty
        pieces.append(p)
    return empty


def make_crop_marks(coll, mat, panel):
    marks = bpy.data.objects.new("CropMarks", None)
    coll.objects.link(marks)
    marks.parent = panel
    L = 0.028
    t = 0.0025
    hw, hh = 0.155, 0.20
    corners = [(-hw, hh), (hw, hh), (-hw, -hh), (hw, -hh)]
    for i, (x, z) in enumerate(corners):
        sx = -1 if x < 0 else 1
        sz = -1 if z < 0 else 1
        a = add_cube(f"cmH{i}", (L, t, t), (x + sx * L / 2, -0.012, z), coll, mat)
        b = add_cube(f"cmV{i}", (t, t, L), (x, -0.012, z + sz * L / 2), coll, mat)
        a.parent = marks
        b.parent = marks
    return marks


def build_set(coll):
    wall_mat = principled("WallCream", CREAM, 0.78, 0.0)
    wall_mat["poster_role"] = "wall"
    floor_mat = principled("FloorCream", PAPER, 0.82, 0.0)
    stone = stone_mat()
    cobalt_mat = principled("CobaltPaint", COBALT, 0.38, 0.0)
    cobalt_emit = principled(
        "CobaltPanel",
        COBALT,
        0.42,
        0.0,
        emission=(*COBALT, 1),
        emission_strength=0.15,
    )
    glass = principled(
        "OrbGlass",
        (0.05, 0.12, 0.85),
        0.04,
        0.0,
        transmission=1.0,
        ior=1.52,
    )
    if "Transmission Weight" in bpy.data.materials["OrbGlass"].node_tree.nodes["Principled BSDF"].inputs:
        nt = glass.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        if "Coat Weight" in bsdf.inputs:
            bsdf.inputs["Coat Weight"].default_value = 0.2
        # Volume-ish via slightly absorbing base
        bsdf.inputs["Base Color"].default_value = (0.02, 0.08, 0.55, 1)

    # Cyclorama: huge back + floor. The join hides behind the plinths.
    back = add_cube("BackWall", (3.5, 0.08, 2.4), (0.08, 0.38, 0.9), coll, wall_mat)
    floor = add_cube("Floor", (3.5, 2.4, 0.06), (0.08, -0.4, -0.03), coll, floor_mat)
    side = add_cube("SideWall", (0.08, 2.4, 2.4), (0.78, -0.2, 0.9), coll, wall_mat)

    arch_mat = principled("ArchCream", (0.86, 0.82, 0.76), 0.74, 0.0)
    arch = make_arch(coll, arch_mat)
    alcove = add_cube(
        "Alcove",
        (1.1, 0.05, 1.15),
        (0.04, 0.42, 0.52),
        coll,
        principled("AlcoveCream", (0.80, 0.76, 0.70), 0.86, 0.0),
    )

    main = add_cube(
        "PlinthMain",
        (0.62, 0.34, 0.125),
        (0.10, 0.06, 0.125 / 2),
        coll,
        stone,
        bevel=0.008,
    )
    left = add_cube(
        "PlinthLeft",
        (0.20, 0.24, 0.105),
        (-0.14, -0.02, 0.105 / 2),
        coll,
        stone,
        bevel=0.006,
    )
    right_lip = add_cube(
        "PlinthRight",
        (0.30, 0.24, 0.08),
        (0.28, -0.12, 0.04),
        coll,
        stone,
        bevel=0.006,
    )

    hands_mat = image_mat("HandsPrint", ASSETS / "hands_print.png", alpha=True, roughness=0.7)
    hands = add_plane(
        "HandsDecal",
        (0.18, 0.10),
        (-0.14, -0.02 - 0.24 / 2 - 0.001, 0.055),
        (math.radians(90), 0, 0),
        coll,
        hands_mat,
    )

    bust_mat = image_mat(
        "BustPanel",
        ASSETS / "bust_panel_opaque.png",
        alpha=False,
        roughness=0.42,
        emission=0.95,
    )
    backing = add_cube(
        "BustBacking",
        (0.34, 0.012, 0.46),
        (0.18, 0.17, 0.46),
        coll,
        cobalt_emit,
        bevel=0.001,
    )
    bust = add_plane(
        "BustPrint",
        (0.33, 0.44),
        (0.18, 0.163, 0.46),
        (math.radians(90), 0, 0),
        coll,
        bust_mat,
    )
    make_crop_marks(coll, cobalt_mat, backing)

    frame = make_frame(coll, cobalt_mat)
    orb = add_sphere("Orb", 0.034, (-0.12, -0.03, 0.105 + 0.034), coll, glass)

    leaf_mat = image_mat("Leaf", ASSETS / "leaf.png", alpha=True, roughness=0.55)
    leaf = add_plane(
        "Leaf",
        (0.09, 0.14),
        (-0.22, 0.03, 0.26),
        (math.radians(90), 0, math.radians(18)),
        coll,
        leaf_mat,
    )

    return {
        "wall_mat": wall_mat,
        "floor_mat": floor_mat,
        "arch_mat": arch_mat,
        "back": back,
        "floor": floor,
        "side": side,
        "arch": arch,
        "alcove": alcove,
        "main": main,
        "left": left,
        "right_lip": right_lip,
        "hands": hands,
        "bust": bust,
        "backing": backing,
        "frame": frame,
        "orb": orb,
        "leaf": leaf,
        "cobalt_emit": cobalt_emit,
    }


def setup_camera(scene, coll):
    cam_data = bpy.data.cameras.new("PosterCam")
    cam_data.lens = 32
    cam_data.sensor_width = 24
    cam_data.sensor_fit = "HORIZONTAL"
    cam_data.clip_start = 0.02
    cam_data.clip_end = 24
    cam_data.dof.use_dof = False
    cam = bpy.data.objects.new("PosterCam", cam_data)
    cam.location = (0.11, -0.52, 0.28)
    look_at(cam, (0.04, 0.03, 0.24))
    coll.objects.link(cam)
    scene.camera = cam
    return cam


def setup_world(scene):
    world = bpy.data.worlds.new("PosterWorld")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.name = "BG"
    bg.inputs["Color"].default_value = (*CREAM, 1)
    bg.inputs["Strength"].default_value = 0.42
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return bg


def setup_lights(coll, target=(0.04, 0.03, 0.24)):
    key = add_area("Key", (-0.22, -0.70, 0.90), (0.85, 0.70), 160, (1.0, 0.96, 0.90), coll, target)
    fill = add_area("Fill", (0.55, -0.40, 0.55), (0.55, 0.45), 55, (0.92, 0.94, 1.0), coll, target)
    rim = add_area("Rim", (0.48, 0.28, 0.62), (0.28, 0.60), 40, (0.35, 0.45, 1.0), coll, target)
    bounce = add_area("Bounce", (0.04, -0.95, 0.18), (1.1, 0.8), 28, (1.0, 0.97, 0.93), coll, target)
    return {"key": key, "fill": fill, "rim": rim, "bounce": bounce}


def apply_plate(plate, world_bg, lights, set_objs, scene):
    wall = set_objs["wall_mat"]
    floor = set_objs["floor_mat"]
    arch = set_objs["arch_mat"]
    wbsdf = wall.node_tree.nodes["Principled BSDF"]
    fbsdf = floor.node_tree.nodes["Principled BSDF"]
    absdf = arch.node_tree.nodes["Principled BSDF"]
    view = scene.view_settings
    if plate == "white":
        world_bg.inputs["Color"].default_value = (*CREAM, 1)
        world_bg.inputs["Strength"].default_value = 0.08
        lights["key"].data.energy = 78
        lights["key"].data.color = (1.0, 0.96, 0.90)
        lights["fill"].data.energy = 12
        lights["fill"].data.color = (0.92, 0.94, 1.0)
        lights["rim"].data.energy = 30
        lights["rim"].data.color = (0.35, 0.45, 1.0)
        lights["bounce"].data.energy = 6
        wbsdf.inputs["Base Color"].default_value = (*CREAM, 1)
        fbsdf.inputs["Base Color"].default_value = (*PAPER, 1)
        absdf.inputs["Base Color"].default_value = (0.88, 0.84, 0.78, 1)
        view.exposure = -0.12
        view.look = "AgX - Medium High Contrast"
    elif plate == "cobalt":
        world_bg.inputs["Color"].default_value = (0.55, 0.60, 0.85, 1)
        world_bg.inputs["Strength"].default_value = 0.10
        lights["key"].data.energy = 48
        lights["key"].data.color = (0.90, 0.92, 1.0)
        lights["fill"].data.energy = 36
        lights["fill"].data.color = (0.35, 0.45, 1.0)
        lights["rim"].data.energy = 50
        lights["rim"].data.color = (0.25, 0.35, 1.0)
        lights["bounce"].data.energy = 6
        wbsdf.inputs["Base Color"].default_value = (0.78, 0.80, 0.90, 1)
        fbsdf.inputs["Base Color"].default_value = (0.70, 0.72, 0.84, 1)
        absdf.inputs["Base Color"].default_value = (0.82, 0.84, 0.95, 1)
        view.exposure = -0.45
        view.look = "AgX - Punchy"
    else:
        world_bg.inputs["Color"].default_value = (0.02, 0.025, 0.05, 1)
        world_bg.inputs["Strength"].default_value = 0.04
        lights["key"].data.energy = 28
        lights["key"].data.color = (0.85, 0.88, 1.0)
        lights["fill"].data.energy = 8
        lights["fill"].data.color = (0.4, 0.5, 1.0)
        lights["rim"].data.energy = 70
        lights["rim"].data.color = (0.3, 0.4, 1.0)
        lights["bounce"].data.energy = 2
        wbsdf.inputs["Base Color"].default_value = (0.04, 0.045, 0.07, 1)
        fbsdf.inputs["Base Color"].default_value = (0.03, 0.03, 0.04, 1)
        absdf.inputs["Base Color"].default_value = (0.08, 0.09, 0.12, 1)
        view.exposure = -0.2
        view.look = "AgX - Punchy"


def configure_cycles(scene, samples, res):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.04 if samples < 64 else 0.02
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.cycles.transmission_bounces = 10
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.compression = 15
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "AgX"
    scene.cycles.samples = samples
    prefs = bpy.context.preferences.addons.get("cycles")
    if prefs:
        prefs.preferences.compute_device_type = "NONE"


def print_ndc(scene, cam, root, set_objs):
    bpy.context.view_layer.update()

    def ndc(name, co):
        v = world_to_camera_view(scene, cam, Vector(co))
        print(f"  NDC {name:16s}  x={v.x:.3f} y={v.y:.3f} z={v.z:.3f}")

    # Duck bbox
    xs, ys, zs = [], [], []
    for obj in root.children_recursive:
        if obj.type != "MESH" or obj.hide_render:
            continue
        for corner in obj.bound_box:
            w = obj.matrix_world @ Vector(corner)
            xs.append(w.x)
            ys.append(w.y)
            zs.append(w.z)
    if xs:
        head = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(zs)))
        feet = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, min(zs)))
        mid = Vector(((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (min(zs) + max(zs)) / 2))
        print(f"duck bbox x={min(xs):.3f}..{max(xs):.3f} y={min(ys):.3f}..{max(ys):.3f} z={min(zs):.3f}..{max(zs):.3f}")
        ndc("duck_head", head)
        ndc("duck_mid", mid)
        ndc("duck_feet", feet)
    ndc("orb", set_objs["orb"].location)
    ndc("bust", set_objs["bust"].location)
    ndc("frame", set_objs["frame"].location)
    ndc("plinth_main", set_objs["main"].location)
    ndc("plinth_left", set_objs["left"].location)


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1 :] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--plate", default="white", choices=["white", "cobalt", "dark", "all"])
    p.add_argument("--samples", type=int, default=48)
    p.add_argument("--res", nargs=2, type=int, default=[430, 932])
    p.add_argument("--inspect", action="store_true")
    p.add_argument("--save-blend", action="store_true", default=True)
    p.add_argument("--duck-only", action="store_true")
    p.add_argument("--yaw", type=float, default=32.0, help="Duck root Z rotation in degrees")
    p.add_argument("--scale", type=float, default=1.06)
    return p.parse_args(argv)


def export_jpeg(png_path: Path, jpg_path: Path):
    try:
        from PIL import Image

        im = Image.open(png_path).convert("RGB")
        im.save(jpg_path, "JPEG", quality=92, optimize=True)
        print("wrote", jpg_path, jpg_path.stat().st_size)
        return
    except Exception as exc:
        print("in-process jpeg failed", exc)
    try:
        import subprocess

        cmd = [
            "python3",
            "-c",
            "from PIL import Image; import sys; Image.open(sys.argv[1]).convert('RGB').save(sys.argv[2], 'JPEG', quality=92, optimize=True)",
            str(png_path),
            str(jpg_path),
        ]
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            print("wrote", jpg_path, jpg_path.stat().st_size)
        else:
            print("jpeg subprocess failed", r.stderr)
    except Exception as exc:
        print("jpeg export failed", exc)


def main():
    args = parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    scene = reset_scene()
    set_col = collection("Set")
    duck_col = collection("Duck")
    light_col = collection("Lights")
    cam_col = collection("Cameras")

    print("importing", GLB)
    parts = import_glb_parts()
    print("imported parts", sorted(parts.keys())[:12], "...", len(parts))
    root, instances, source_parts = assemble_duck(parts, duck_col)
    for o in list(source_parts.values()):
        try:
            bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            pass
    root.rotation_mode = "XYZ"
    root.rotation_euler = (0.0, 0.0, math.radians(args.yaw))
    s = float(args.scale)
    root.scale = (s, s, s)
    root.location = (0.05, 0.06, 0.0)
    ground_to(root, PLINTH_TOP)
    print("duck yaw", args.yaw, "scale", s)
    print("duck instances", len(instances), "root", tuple(root.location))

    set_objs = build_set(set_col)
    cam = setup_camera(scene, cam_col)
    world_bg = setup_world(scene)
    lights = setup_lights(light_col)
    configure_cycles(scene, args.samples, tuple(args.res))

    if args.duck_only:
        for obj in set_col.objects:
            obj.hide_render = obj.name not in {"Floor", "PlinthMain"}

    print_ndc(scene, cam, root, set_objs)

    if args.save_blend:
        blend = HERE / "poster_studio.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(blend))
        print("saved", blend)

    plates = ["white", "cobalt", "dark"] if args.plate == "all" else [args.plate]
    if args.inspect and args.samples <= 4:
        print("inspect-only, skip render")
        return

    for plate in plates:
        apply_plate(plate, world_bg, lights, set_objs, scene)
        png = OUT / f"frame-{plate}.png"
        scene.render.filepath = str(png)
        print("RENDER", plate, args.res, "samples", args.samples)
        bpy.ops.render.render(write_still=True)
        print("wrote", png)
        export_jpeg(png, PUBLIC / f"frame-{plate}.jpg")
        # Keep a PNG in public too for lossless overlay checks.
        try:
            import shutil

            shutil.copy2(png, PUBLIC / f"frame-{plate}.png")
        except Exception:
            pass


if __name__ == "__main__":
    main()
