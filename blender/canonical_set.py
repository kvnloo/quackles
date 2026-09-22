"""One set layout and material families for every theme.

Day, White, Blue, Dark, and Night call this after the shared plinth build.
Theme tables only change tint, glow, and which texture drives a family.
The robot mesh, camera, and object list stay on the calibrated blend.
"""
from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector

ASSETS = Path(__file__).resolve().parent / "assets"

# One albedo for every theme. Theme names must not change these.
STONE = (0.62, 0.60, 0.56, 1.0)
FRAME = ((0.04, 0.07, 0.22, 1.0), 0.4, 0.0)


def _principal(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _set(node, key, value):
    socket = node.inputs[key]
    for link in list(socket.links):
        node.id_data.links.remove(link)
    socket.default_value = value


def seat_creation_print():
    """Lift the hands card onto the plinth face before UV projection."""
    obj = bpy.data.objects.get("Creation print")
    if not obj or obj.get("canonical_seated"):
        return False
    loc = obj.matrix_world.translation.copy()
    loc.z += 0.042
    obj.matrix_world.translation = loc
    obj.scale = obj.scale * 1.28
    obj["canonical_seated"] = True
    return True


def _load(name, colorspace):
    path = ASSETS / name
    if not path.exists():
        return None
    image = bpy.data.images.load(str(path), check_existing=True)
    image.colorspace_settings.name = colorspace
    return image


def _mix_maps(mat, albedo_name, rough_name, normal_name, fac):
    """Blend a PBR set into the limestone albedo already wired by plinth_look."""
    bs = _principal(mat)
    if not bs:
        return False
    albedo = _load(albedo_name, "sRGB")
    if albedo is None:
        return False
    nt = mat.node_tree
    if any(n.name == "CanonicalAlbedo" for n in nt.nodes):
        return True
    cool = next((n for n in nt.nodes if n.name == "LimestoneCool"), None)
    src = None
    if cool and cool.inputs[1].links:
        src = cool.inputs[1].links[0].from_socket
    elif bs.inputs["Base Color"].links:
        src = bs.inputs["Base Color"].links[0].from_socket
    coord = next((n for n in nt.nodes if n.type == "TEX_COORD"), None)
    mapping = next((n for n in nt.nodes if n.type == "MAPPING"), None)
    if coord is None:
        coord = nt.nodes.new("ShaderNodeTexCoord")
    if mapping is None:
        mapping = nt.nodes.new("ShaderNodeMapping")
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    mapping.inputs["Scale"].default_value = (0.85, 0.85, 0.85)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.name = "CanonicalAlbedo"
    tex.image = albedo
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.name = "CanonicalStoneMix"
    mix.blend_type = "MIX"
    mix.inputs["Fac"].default_value = fac
    if src:
        nt.links.new(src, mix.inputs[1])
    else:
        mix.inputs[1].default_value = (0.6, 0.58, 0.54, 1.0)
    nt.links.new(tex.outputs["Color"], mix.inputs[2])
    if cool and cool.inputs[1].links:
        for link in list(cool.inputs[1].links):
            nt.links.remove(link)
        nt.links.new(mix.outputs[0], cool.inputs[1])
    rough = _load(rough_name, "Non-Color")
    if rough is not None and "Roughness" in bs.inputs:
        rtex = nt.nodes.new("ShaderNodeTexImage")
        rtex.image = rough
        nt.links.new(mapping.outputs["Vector"], rtex.inputs["Vector"])
        rmix = nt.nodes.new("ShaderNodeMixRGB")
        rmix.blend_type = "MIX"
        rmix.inputs["Fac"].default_value = fac
        if bs.inputs["Roughness"].links:
            nt.links.new(bs.inputs["Roughness"].links[0].from_socket, rmix.inputs[1])
            for link in list(bs.inputs["Roughness"].links):
                nt.links.remove(link)
        else:
            rmix.inputs[1].default_value = (0.6, 0.6, 0.6, 1.0)
        nt.links.new(rtex.outputs["Color"], rmix.inputs[2])
        nt.links.new(rmix.outputs[0], bs.inputs["Roughness"])
    nmap = next((n for n in nt.nodes if n.type == "NORMAL_MAP"), None)
    if nmap is not None:
        nmap.inputs["Strength"].default_value = 0.55
    return True


def _tint_stone(theme):
    del theme
    tint = STONE
    hit = 0
    for name in ("QUALITY-quarried-stone", "POSTER-limestone", "POSTER-plinth"):
        mat = bpy.data.materials.get(name)
        if not mat or not mat.use_nodes:
            continue
        # Fac stays low: the derived normal made the plinth read as boards.
        _mix_maps(mat, "T_concrete_albedo.png", "T_concrete_roughness.png", "T_concrete_normal.png", 0.0)
        cool = next((n for n in mat.node_tree.nodes if n.name == "LimestoneCool"), None)
        if cool:
            cool.inputs[2].default_value = tint
            cool.inputs["Fac"].default_value = 1.0
            hit += 1
        for node in mat.node_tree.nodes:
            if node.type == "NORMAL_MAP":
                node.inputs["Strength"].default_value = 0.85
    return hit


def _arch(theme):
    src = bpy.data.objects.get("Architectural shadow former")
    stone = bpy.data.materials.get("QUALITY-quarried-stone")
    if not src or not stone:
        return False
    arch = stone.copy()
    arch.name = "Canonical arch"
    src.data.materials[0] = arch
    cool = next((n for n in arch.node_tree.nodes if n.name == "LimestoneCool"), None)
    if cool:
        cool.inputs[2].default_value = STONE
        cool.inputs["Fac"].default_value = 1.0
    bs = _principal(arch)
    if bs and "Roughness" in bs.inputs and not bs.inputs["Roughness"].links:
        bs.inputs["Roughness"].default_value = 0.72
    return True


def _marble_accent(theme):
    """Marble is not a theme. Albedo stays on the shared stone."""
    del theme
    return 0
    if theme != "blue":
        return 0
    albedo = _load("T_blue_marble_albedo.png", "sRGB")
    rough = _load("T_blue_marble_roughness.png", "Non-Color")
    normal = _load("T_blue_marble_normal.png", "Non-Color")
    if albedo is None:
        return 0
    changed = 0
    for name in ("Rear limestone", "Orb limestone"):
        obj = bpy.data.objects.get(name)
        if not obj or not obj.data.materials or not obj.data.materials[0]:
            continue
        mat = obj.data.materials[0].copy()
        mat.name = f"Canonical marble {name}"
        obj.data.materials[0] = mat
        for node in mat.node_tree.nodes:
            if node.name == "CanonicalAlbedo":
                node.image = albedo
            elif node.name == "CanonicalStoneMix":
                node.inputs["Fac"].default_value = 1.0
            elif node.type == "NORMAL_MAP" and normal is not None:
                node.inputs["Strength"].default_value = 0.45
        cool = next((node for node in mat.node_tree.nodes if node.name == "LimestoneCool"), None)
        if cool:
            cool.inputs["Fac"].default_value = 0.12
        if rough is not None:
            bs = _principal(mat)
            if bs and "Roughness" in bs.inputs:
                _set(bs, "Roughness", 0.18)
        changed += 1
    return changed


def _restore_print(mat):
    """The bust PNG is clipped in blue, so the halftone only exists in R/G.

    One luminance ramp for every theme. This is the print's albedo, not a light.
    """
    bs = _principal(mat)
    if not bs:
        return False
    if "Emission Strength" in bs.inputs:
        _set(bs, "Emission Strength", 0.0)
    base = bs.inputs["Base Color"]
    if not base.links:
        return False
    nt = mat.node_tree
    if any(node.name == "CanonicalPoster" for node in nt.nodes):
        return True
    src = base.links[0].from_socket
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    span = nt.nodes.new("ShaderNodeMapRange")
    span.inputs["From Min"].default_value = 0.15
    span.inputs["From Max"].default_value = 0.55
    span.clamp = True
    nt.links.new(src, bw.inputs["Color"])
    nt.links.new(bw.outputs["Val"], span.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.name = "CanonicalPoster"
    mix.inputs[1].default_value = (0.02, 0.05, 0.16, 1.0)
    mix.inputs[2].default_value = (0.72, 0.78, 0.92, 1.0)
    nt.links.new(span.outputs["Result"], mix.inputs["Fac"])
    for link in list(base.links):
        nt.links.remove(link)
    nt.links.new(mix.outputs[0], base)
    return True


def _poster(theme):
    """Same bust albedo on every theme."""
    del theme
    ok = False
    for name in ("POSTER-bust", "QUALITY-banner-header"):
        if _restore_print(bpy.data.materials.get(name)):
            ok = True
    hands = _principal(bpy.data.materials.get("POSTER-hands"))
    if hands and "Emission Strength" in hands.inputs:
        _set(hands, "Emission Strength", 0.0)
    return ok


def _frame(theme):
    del theme
    color, rough, emit = FRAME
    bs = _principal(bpy.data.materials.get("POSTER-blue-frame"))
    if not bs:
        return False
    _set(bs, "Base Color", color)
    _set(bs, "Roughness", rough)
    if "Emission Strength" in bs.inputs:
        _set(bs, "Emission Strength", emit)
    if "Emission Color" in bs.inputs and emit:
        _set(bs, "Emission Color", color)
    if "Metallic" in bs.inputs:
        _set(bs, "Metallic", 0.0)
    return True


def _wear(theme):
    """Shell albedo stays the authored cream map. No per-theme grime."""
    del theme
    changed = 0
    return changed
    amount = 0.0
    changed = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        if not any(n.name == "RobotShellAlbedo" for n in mat.node_tree.nodes):
            continue
        bs = _principal(mat)
        if not bs or not bs.inputs["Base Color"].links:
            continue
        nt = mat.node_tree
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 22.0
        noise.inputs["Detail"].default_value = 9.0
        noise.inputs["Roughness"].default_value = 0.62
        span = nt.nodes.new("ShaderNodeMapRange")
        span.inputs["From Min"].default_value = 0.32
        span.inputs["From Max"].default_value = 0.78
        span.inputs["To Min"].default_value = 1.0 - amount
        span.inputs["To Max"].default_value = 1.0
        nt.links.new(noise.outputs["Fac"], span.inputs["Value"])
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.name = "CanonicalWear"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Fac"].default_value = 1.0
        nt.links.new(bs.inputs["Base Color"].links[0].from_socket, mix.inputs[1])
        nt.links.new(span.outputs["Result"], mix.inputs[2])
        for link in list(bs.inputs["Base Color"].links):
            nt.links.remove(link)
        nt.links.new(mix.outputs[0], bs.inputs["Base Color"])
        if "Roughness" in bs.inputs:
            rough = nt.nodes.new("ShaderNodeMapRange")
            rough.inputs["From Min"].default_value = 0.32
            rough.inputs["From Max"].default_value = 0.78
            rough.inputs["To Min"].default_value = 0.48
            rough.inputs["To Max"].default_value = min(0.92, 0.62 + amount)
            nt.links.new(noise.outputs["Fac"], rough.inputs["Value"])
            if bs.inputs["Roughness"].links:
                for link in list(bs.inputs["Roughness"].links):
                    nt.links.remove(link)
            nt.links.new(rough.outputs["Result"], bs.inputs["Roughness"])
        changed += 1
    # Extra soil on the feet. Same shells, stronger multiply.
    root = bpy.data.objects.get("duck_root")
    if root:
        for obj in root.children_recursive:
            if getattr(obj, "type", None) != "MESH":
                continue
            if not any(k in obj.name.lower() for k in ("sole", "foot")):
                continue
            for slot in obj.material_slots:
                bs = _principal(slot.material)
                if not bs or "Base Color" not in bs.inputs or not bs.inputs["Base Color"].links:
                    continue
                nt = slot.material.node_tree
                if any(n.name == "CanonicalFootSoil" for n in nt.nodes):
                    continue
                mix = nt.nodes.new("ShaderNodeMixRGB")
                mix.name = "CanonicalFootSoil"
                mix.blend_type = "MULTIPLY"
                mix.inputs["Fac"].default_value = 0.55
                mix.inputs[2].default_value = (0.55, 0.50, 0.42, 1.0)
                nt.links.new(bs.inputs["Base Color"].links[0].from_socket, mix.inputs[1])
                for link in list(bs.inputs["Base Color"].links):
                    nt.links.remove(link)
                nt.links.new(mix.outputs[0], bs.inputs["Base Color"])
    hero = bpy.data.objects.get("Hero limestone")
    if hero:
        for mod in hero.modifiers:
            if mod.type == "SUBSURF":
                mod.render_levels = 2
                mod.levels = 2
    return changed


def _sharpen_plinth():
    hero = bpy.data.objects.get("Hero limestone")
    if not hero:
        return False
    for mod in hero.modifiers:
        if mod.type == "SUBSURF":
            mod.render_levels = 2
            mod.levels = 2
    return True


def _pedestal_surface(mat):
    """Replace the flat limestone tint with a matte aggregate stone.

    Layout, UVs for the hands print, and every other material stay put.
    """
    bs = _principal(mat)
    if not bs:
        return False
    nt = mat.node_tree
    if any(node.name == "PedestalStone" for node in nt.nodes):
        return True
    albedo = _load("T_pedestal_albedo.png", "sRGB")
    rough = _load("T_pedestal_roughness.png", "Non-Color")
    normal = _load("T_pedestal_normal.png", "Non-Color")
    if albedo is None or rough is None or normal is None:
        return False
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    # Mesh is only 0.125 m tall. Scale is in 1/m so the face shows several
    # tiles instead of one stretched patch.
    mapping.inputs["Scale"].default_value = (24.0, 24.0, 24.0)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.name = "PedestalStone"
    tex.image = albedo
    nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 40.0
    noise.inputs["Detail"].default_value = 8.0
    noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(coord.outputs["Object"], noise.inputs["Vector"])
    voro = nt.nodes.new("ShaderNodeTexVoronoi")
    voro.inputs["Scale"].default_value = 28.0
    nt.links.new(coord.outputs["Object"], voro.inputs["Vector"])
    chip = nt.nodes.new("ShaderNodeMapRange")
    chip.inputs["From Min"].default_value = 0.02
    chip.inputs["From Max"].default_value = 0.2
    nt.links.new(voro.outputs["Distance"], chip.inputs["Value"])
    chip_col = nt.nodes.new("ShaderNodeMixRGB")
    chip_col.inputs[1].default_value = (0.16, 0.15, 0.14, 1.0)
    chip_col.inputs[2].default_value = (0.70, 0.68, 0.64, 1.0)
    nt.links.new(chip.outputs["Result"], chip_col.inputs["Fac"])
    grade = nt.nodes.new("ShaderNodeBrightContrast")
    grade.inputs["Bright"].default_value = -0.16
    grade.inputs["Contrast"].default_value = 0.85
    nt.links.new(tex.outputs["Color"], grade.inputs["Color"])
    body = nt.nodes.new("ShaderNodeMixRGB")
    body.inputs["Fac"].default_value = 0.72
    nt.links.new(grade.outputs["Color"], body.inputs[1])
    nt.links.new(chip_col.outputs[0], body.inputs[2])
    pore = nt.nodes.new("ShaderNodeMapRange")
    pore.inputs["From Min"].default_value = 0.58
    pore.inputs["From Max"].default_value = 0.86
    pore.inputs["To Min"].default_value = 1.0
    pore.inputs["To Max"].default_value = 0.28
    nt.links.new(noise.outputs["Fac"], pore.inputs["Value"])
    pore_mix = nt.nodes.new("ShaderNodeMixRGB")
    pore_mix.blend_type = "MULTIPLY"
    pore_mix.inputs["Fac"].default_value = 1.0
    nt.links.new(body.outputs[0], pore_mix.inputs[1])
    nt.links.new(pore.outputs["Result"], pore_mix.inputs[2])
    settle = nt.nodes.new("ShaderNodeMixRGB")
    settle.blend_type = "MULTIPLY"
    settle.inputs["Fac"].default_value = 1.0
    settle.inputs[2].default_value = (0.70, 0.68, 0.66, 1.0)
    nt.links.new(pore_mix.outputs[0], settle.inputs[1])
    creation = next((node for node in nt.nodes if node.name == "CreationMix"), None)
    target = creation.inputs[1] if creation else bs.inputs["Base Color"]
    for link in list(target.links):
        nt.links.remove(link)
    nt.links.new(settle.outputs[0], target)
    rtex = nt.nodes.new("ShaderNodeTexImage")
    rtex.image = rough
    nt.links.new(mapping.outputs["Vector"], rtex.inputs["Vector"])
    rspan = nt.nodes.new("ShaderNodeMapRange")
    rspan.inputs["From Min"].default_value = 0.0
    rspan.inputs["From Max"].default_value = 1.0
    rspan.inputs["To Min"].default_value = 0.84
    rspan.inputs["To Max"].default_value = 0.98
    nt.links.new(rtex.outputs["Color"], rspan.inputs["Value"])
    for link in list(bs.inputs["Roughness"].links):
        nt.links.remove(link)
    nt.links.new(rspan.outputs["Result"], bs.inputs["Roughness"])
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image = normal
    nt.links.new(mapping.outputs["Vector"], ntex.inputs["Vector"])
    nmap = next((node for node in nt.nodes if node.type == "NORMAL_MAP"), None)
    if nmap is None:
        nmap = nt.nodes.new("ShaderNodeNormalMap")
    else:
        for link in list(nmap.inputs["Color"].links):
            nt.links.remove(link)
    nmap.inputs["Strength"].default_value = 1.15
    nt.links.new(ntex.outputs["Color"], nmap.inputs["Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.85
    bump.inputs["Distance"].default_value = 0.0012
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(nmap.outputs["Normal"], bump.inputs["Normal"])
    for link in list(bs.inputs["Normal"].links):
        nt.links.remove(link)
    nt.links.new(bump.outputs["Normal"], bs.inputs["Normal"])
    if "Specular IOR Level" in bs.inputs:
        bs.inputs["Specular IOR Level"].default_value = 0.2
    if "Metallic" in bs.inputs:
        bs.inputs["Metallic"].default_value = 0.0
    if "Emission Strength" in bs.inputs:
        bs.inputs["Emission Strength"].default_value = 0.0
    return True


def _pedestals():
    """Stone only on the pedestal blocks. The arch keeps its own copy."""
    names = (
        "Hero limestone",
        "Empty foreground limestone",
        "Rear limestone",
        "Orb limestone",
    )
    done = set()
    count = 0
    for name in names:
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or mat.name in done or mat.name.startswith("Canonical arch"):
                continue
            if _pedestal_surface(mat):
                done.add(mat.name)
                count += 1
    return count


def apply_canonical(scene, theme):
    report = {
        "theme": theme,
        "stone": _tint_stone(theme),
        "arch": _arch(theme),
        "pedestal": _pedestals(),
        "marble": _marble_accent(theme),
        "poster": _poster(theme),
        "frame": _frame(theme),
        "wear": _wear(theme),
        "plinth": _sharpen_plinth(),
    }
    print("CANONICAL_SET", report, flush=True)
    return report
