"""UV-print Creation fingers on Hero limestone; wire generated stone PBR.

Also: robot cream shell maps + day cobalt orb absorption (shared by cinematic path).
"""
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
        # Cool gray grade toward day lock concrete (warm map × cool multiply).
        cool = nt.nodes.new("ShaderNodeMixRGB")
        cool.name = "LimestoneCool"
        cool.blend_type = "MULTIPLY"
        cool.inputs["Fac"].default_value = 1.0
        # Day lock pedestals are mid gray concrete, not cream ivory.
        cool.inputs[2].default_value = (0.28, 0.30, 0.34, 1.0)
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        for tex in (diff, nor, rtex):
            nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
        nt.links.new(diff.outputs["Color"], cool.inputs[1])
        nt.links.new(cool.outputs[0], bs.inputs["Base Color"])
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


def apply_robot_shell_pbr():
    """Wire T_robot_shell_* onto cream shell materials on duck meshes only."""
    albedo = ASSETS / "T_robot_shell_albedo.png"
    rough = ASSETS / "T_robot_shell_roughness.png"
    normal = ASSETS / "T_robot_shell_normal.png"
    if not albedo.exists():
        return 0
    shell_needles = (
        "shell",
        "top_head",
        "bottom_head",
        "torso",
        "chest",
        "pelvis",
        "hip",
        "thigh",
        "shin",
        "upper_leg",
        "lower_leg",
        "foot",
        "ankle",
        "knee",
        "body",
    )
    skip_mat = (
        "ivory",
        "limestone",
        "stone",
        "plinth",
        "wall",
        "floor",
        "glass",
        "cobalt",
        "print",
        "banner",
        "bust",
        "cyclorama",
    )
    mats = []
    root = bpy.data.objects.get("duck_root")
    if not root:
        return 0
    for obj in root.children_recursive:
        if getattr(obj, "type", None) != "MESH":
            continue
        low = obj.name.lower()
        if not any(n in low for n in shell_needles):
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or mat in mats:
                continue
            mlow = mat.name.lower()
            if any(s in mlow for s in skip_mat):
                continue
            bs = principal(mat)
            if not bs:
                continue
            base = bs.inputs["Base Color"].default_value
            metal = bs.inputs["Metallic"].default_value if "Metallic" in bs.inputs else 0
            bright = sum(base[:3]) / 3.0
            # Cream shells only: skip dark/mech/rubber/metal.
            if metal > 0.25 or bright < 0.35:
                continue
            if any(n.name == "RobotShellAlbedo" for n in mat.node_tree.nodes):
                mats.append(mat)
                continue
            nt = mat.node_tree
            coord = nt.nodes.new("ShaderNodeTexCoord")
            mapping = nt.nodes.new("ShaderNodeMapping")
            mapping.inputs["Scale"].default_value = (1.0, 1.0, 1.0)
            diff = nt.nodes.new("ShaderNodeTexImage")
            diff.name = "RobotShellAlbedo"
            diff.image = bpy.data.images.load(str(albedo), check_existing=True)
            rtex = nt.nodes.new("ShaderNodeTexImage")
            rtex.image = bpy.data.images.load(str(rough), check_existing=True)
            rtex.image.colorspace_settings.name = "Non-Color"
            ntex = nt.nodes.new("ShaderNodeTexImage")
            ntex.image = bpy.data.images.load(str(normal), check_existing=True)
            ntex.image.colorspace_settings.name = "Non-Color"
            nmap = nt.nodes.new("ShaderNodeNormalMap")
            nmap.inputs["Strength"].default_value = 0.42
            nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
            for tex in (diff, rtex, ntex):
                nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
            mix = nt.nodes.new("ShaderNodeMixRGB")
            mix.blend_type = "MULTIPLY"
            mix.inputs["Fac"].default_value = 0.9
            base_sock = bs.inputs["Base Color"]
            if base_sock.links:
                nt.links.new(base_sock.links[0].from_socket, mix.inputs[1])
            else:
                # Warm cream under wear map (classic Microduck)
                mix.inputs[1].default_value = (0.94, 0.88, 0.80, 1.0)
            nt.links.new(diff.outputs["Color"], mix.inputs[2])
            for link in list(base_sock.links):
                nt.links.remove(link)
            nt.links.new(mix.outputs[0], base_sock)
            nt.links.new(rtex.outputs["Color"], bs.inputs["Roughness"])
            nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
            nt.links.new(nmap.outputs["Normal"], bs.inputs["Normal"])
            if "Specular IOR Level" in bs.inputs:
                bs.inputs["Specular IOR Level"].default_value = 0.45
            mats.append(mat)
    return len(mats)


def tune_day_orb():
    """Cobalt glass: blue body + enough transmission for robot/stone in sphere."""
    orb = bpy.data.objects.get("Cobalt optical glass")
    mat = bpy.data.materials.get("POSTER-cobalt-glass")
    if orb and orb.data.materials:
        mat = orb.data.materials[0] or mat
    if not mat or not mat.use_nodes:
        return False
    bs = principal(mat)
    nt = mat.node_tree
    if bs:
        if "Transmission Weight" in bs.inputs:
            bs.inputs["Transmission Weight"].default_value = 1.0
        elif "Transmission" in bs.inputs:
            bs.inputs["Transmission"].default_value = 1.0
        if "Roughness" in bs.inputs:
            bs.inputs["Roughness"].default_value = 0.014
        if "IOR" in bs.inputs:
            bs.inputs["IOR"].default_value = 1.5
        if "Base Color" in bs.inputs and not bs.inputs["Base Color"].links:
            # Near-white glass base; color comes from volume absorption
            bs.inputs["Base Color"].default_value = (0.92, 0.95, 1.0, 1.0)
    for n in nt.nodes:
        if n.type == "VOLUME_ABSORPTION":
            # Lock day.png = deep cobalt with highlight.
            # Density 100 = lights-only; 0.35 = clear crystal. ~14 = cobalt body.
            if "Density" in n.inputs:
                n.inputs["Density"].default_value = 55.0
            if "Color" in n.inputs:
                n.inputs["Color"].default_value = (0.008, 0.04, 0.92, 1.0)
        if n.type == "VOLUME_SCATTER" and "Density" in n.inputs:
            n.inputs["Density"].default_value = min(float(n.inputs["Density"].default_value), 0.05)
    scene = bpy.context.scene
    if scene and scene.world and scene.world.use_nodes:
        for n in scene.world.node_tree.nodes:
            if n.type == "BACKGROUND" and n.name != "Cinematic camera background":
                if float(n.inputs["Strength"].default_value) < 0.18:
                    n.inputs["Strength"].default_value = 0.22
    return True


def apply_plinth_look(scene, *, shells=True, orb=True):
    stone = apply_generated_limestone()
    print_ok = print_creation_on_plinth(scene)
    shell_n = apply_robot_shell_pbr() if shells else 0
    orb_ok = tune_day_orb() if orb else False
    scene["plinth_generated_stone"] = stone
    scene["plinth_creation_uv"] = print_ok
    scene["plinth_shell_pbr"] = shell_n
    scene["plinth_orb_tuned"] = orb_ok
    return stone, print_ok, shell_n, orb_ok
