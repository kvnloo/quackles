"""UV-print Creation fingers on Hero limestone; wire generated stone PBR."""
from __future__ import annotations

from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

def _assets():
    here = Path(__file__).resolve().parent / "assets"
    alt = Path("/home/kvn/Documents/Codex/2026-09-16/c/work/quackles-publish/blender/assets")
    if (here / "T_limestone_albedo.png").exists():
        return here
    return alt if (alt / "T_limestone_albedo.png").exists() else here


ASSETS = _assets()
HANDS_CROP = (30, 1355, 434, 1536)
FRAME = (1024, 1536)


def principal(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat and mat.use_nodes else None


def apply_generated_limestone():
    albedo = ASSETS / "T_limestone_albedo.png"
    rough = ASSETS / "T_limestone_roughness.png"
    normal = ASSETS / "T_limestone_normal.png"
    if not albedo.exists():
        return False
    applied = False
    for name in ("POSTER-limestone", "QUALITY-quarried-stone", "POSTER-plinth"):
        mat = bpy.data.materials.get(name)
        if not mat or not mat.use_nodes:
            continue
        bs = principal(mat)
        if not bs:
            continue
        nt = mat.node_tree
        keep = {bs, next(n for n in nt.nodes if n.type == "OUTPUT_MATERIAL")}
        for n in list(nt.nodes):
            if n not in keep:
                nt.nodes.remove(n)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (2.2, 2.2, 2.2)
        diff = nt.nodes.new("ShaderNodeTexImage")
        diff.image = bpy.data.images.load(str(albedo), check_existing=True)
        nor = nt.nodes.new("ShaderNodeTexImage")
        nor.image = bpy.data.images.load(str(normal), check_existing=True)
        nor.image.colorspace_settings.name = "Non-Color"
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = bpy.data.images.load(str(rough), check_existing=True)
        rtex.image.colorspace_settings.name = "Non-Color"
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = 0.9
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        for tex in (diff, nor, rtex):
            nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(diff.outputs["Color"], bs.inputs["Base Color"])
        nt.links.new(rtex.outputs["Color"], bs.inputs["Roughness"])
        nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bs.inputs["Normal"])
        if "Emission Strength" in bs.inputs:
            bs.inputs["Emission Strength"].default_value = 0
        applied = True
    return applied


def _uv_from_camera(scene, world_co):
    ndc = world_to_camera_view(scene, scene.camera, world_co)
    px = ndc.x * FRAME[0]
    py = (1.0 - ndc.y) * FRAME[1]
    x0, y0, x1, y1 = HANDS_CROP
    u = (px - x0) / (x1 - x0)
    v = 1.0 - (py - y0) / (y1 - y0)
    return u, v


def _mix_print_on_material(mat):
    if not mat or not mat.use_nodes:
        return False
    bs = principal(mat)
    if not bs:
        return False
    nt = mat.node_tree
    if any(n.name == "CreationPrint" for n in nt.nodes):
        return True
    hands = ASSETS / "hands_print.png"
    if not hands.exists():
        return False
    uvmap = nt.nodes.new("ShaderNodeUVMap")
    uvmap.name = "CreationUV"
    uvmap.uv_map = "Creation"
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.name = "CreationPrint"
    tex.image = bpy.data.images.load(str(hands), check_existing=True)
    tex.extension = "CLIP"
    nt.links.new(uvmap.outputs[0], tex.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.name = "CreationMix"
    mix.blend_type = "MIX"
    base = bs.inputs["Base Color"]
    if base.links:
        nt.links.new(base.links[0].from_socket, mix.inputs[1])
    else:
        mix.inputs[1].default_value = tuple(base.default_value)
    nt.links.new(tex.outputs["Color"], mix.inputs[2])
    nt.links.new(tex.outputs["Alpha"], mix.inputs[0])
    for link in list(base.links):
        nt.links.remove(link)
    nt.links.new(mix.outputs[0], base)
    return True


def print_creation_on_plinth(scene):
    """Project the two-finger crop onto limestone faces, hide the billboard."""
    billboard = bpy.data.objects.get("Creation print")
    stones = [o for o in bpy.data.objects if o.type == "MESH" and "limestone" in o.name.lower()]
    if not stones or not scene.camera:
        return False
    deps = bpy.context.evaluated_depsgraph_get()
    cam = scene.camera.location
    hits = []
    if billboard:
        billboard.hide_render = False
        for v in billboard.data.vertices:
            world = billboard.matrix_world @ v.co
            direction = (world - cam).normalized()
            ok, loc, normal, _idx, obj, _mat = scene.ray_cast(deps, cam, direction)
            hits.append((ok, loc, normal, obj))
        billboard.hide_render = True
        billboard.hide_viewport = True
        billboard.visible_camera = False
    # Camera-project UVs on every limestone; loops inside the poster crop keep 0-1.
    for hero in stones:
        mesh = hero.data
        uv = mesh.uv_layers.get("Creation") or mesh.uv_layers.new(name="Creation")
        mw = hero.matrix_world
        for poly in mesh.polygons:
            for loop_i in poly.loop_indices:
                vert = mesh.vertices[mesh.loops[loop_i].vertex_index]
                uv.data[loop_i].uv = _uv_from_camera(scene, mw @ vert.co)
        _mix_print_on_material(hero.active_material or bpy.data.materials.get("QUALITY-quarried-stone"))
    # If the billboard rays hit stone, also write a tight island from those hits
    # so the print sits on the marble even when the crop is mostly empty sky.
    if hits and all(h[0] and h[3] for h in hits):
        target = hits[0][3]
        if all(h[3] == target for h in hits) and target.type == "MESH":
            corners = [Vector(h[1]) for h in hits]
            origin, u_axis, v_axis = corners[0], corners[1] - corners[0], corners[3] - corners[0] if len(corners) > 3 else corners[2] - corners[0]
            # fall back: use first two edges
            if u_axis.length < 1e-8 or v_axis.length < 1e-8:
                u_axis = corners[1] - corners[0]
                v_axis = corners[2] - corners[0]
            mesh = target.data
            uv = mesh.uv_layers.get("Creation") or mesh.uv_layers.new(name="Creation")
            mw = target.matrix_world
            for poly in mesh.polygons:
                for loop_i in poly.loop_indices:
                    world = mw @ mesh.vertices[mesh.loops[loop_i].vertex_index].co
                    rel = world - origin
                    u = rel.dot(u_axis) / (u_axis.length_squared or 1)
                    v = rel.dot(v_axis) / (v_axis.length_squared or 1)
                    uv.data[loop_i].uv = (u, v)
    return True


def apply_plinth_look(scene):
    stone = apply_generated_limestone()
    print_ok = print_creation_on_plinth(scene)
    scene["plinth_generated_stone"] = stone
    scene["plinth_creation_uv"] = print_ok
    return stone, print_ok
