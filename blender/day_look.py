"""Day-only grade applied after the shared cinematic theme setup.

Night, Blue, White, and Dark must not call this module. The locked reference is
``cinematic/target-day-poster-lock.png`` (same bytes as
``blender/assets/reference_day.png`` when that copy is present).

Poster typography in the lock is page chrome. These overrides match the Cycles
plate: panel value, stone, sun, and duck response.
"""
from __future__ import annotations

import bpy

# Kept after the day-lock loop. See day_look_ledger.json.
# Prints: emission off, luminance remapped to the lock's navy ramp.
BUST_EMISSION = 0.0
BANNER_EMISSION = 0.0
BUST_DARK = (0.0065, 0.0176, 0.0931, 1.0)
BUST_LIGHT = (0.3763, 0.4233, 0.5841, 1.0)
BUST_LUMA = (0.15, 0.55)
# Cobalt frame was an emissive slab. The lock's crop is shadowed concrete.
FRAME_COLOR = (0.010, 0.014, 0.040, 1.0)
FRAME_ROUGH = 0.62
# 1.0 clips sunlit cream. 0.25 goes gray. 0.70 keeps cream and the speckle.
SHELL_GAIN = 0.70
# Plinth front p50 landed on the lock gray. Sun 8 darkened the plinth, reverted.
STONE_COOL = (0.42, 0.38, 0.32, 1.0)
STONE_FAC = 1.0
SUN_ENERGY = 14.0
SUN_COLOR = (1.0, 0.90, 0.76)
SUN_ANGLE = 0.04


def _principal(mat):
    if not mat or not mat.use_nodes:
        return None
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)


def _set(node, key, value):
    socket = node.inputs[key]
    for link in list(socket.links):
        node.id_data.links.remove(link)
    socket.default_value = value


def _emission(name, strength):
    bs = _principal(bpy.data.materials.get(name))
    if bs and "Emission Strength" in bs.inputs:
        bs.inputs["Emission Strength"].default_value = float(strength)
        return True
    return False


def _remap_print(name):
    """Map the print's luminance onto a navy ramp. Leaves other themes alone."""
    mat = bpy.data.materials.get(name)
    bs = _principal(mat)
    if not bs:
        return False
    base = bs.inputs["Base Color"]
    if not base.links:
        return False
    nt = mat.node_tree
    src = base.links[0].from_socket
    bw = nt.nodes.new("ShaderNodeRGBToBW")
    bw.name = "DayLuma"
    nt.links.new(src, bw.inputs["Color"])
    span = nt.nodes.new("ShaderNodeMapRange")
    span.name = "DayLumaSpan"
    span.inputs["From Min"].default_value = BUST_LUMA[0]
    span.inputs["From Max"].default_value = BUST_LUMA[1]
    span.clamp = True
    nt.links.new(bw.outputs["Val"], span.inputs["Value"])
    mix = nt.nodes.new("ShaderNodeMixRGB")
    mix.name = "DayGrade"
    mix.blend_type = "MIX"
    mix.inputs[1].default_value = BUST_DARK
    mix.inputs[2].default_value = BUST_LIGHT
    nt.links.new(span.outputs["Result"], mix.inputs["Fac"])
    for link in list(base.links):
        nt.links.remove(link)
    nt.links.new(mix.outputs[0], base)
    return True


def _solid(name, color, rough):
    bs = _principal(bpy.data.materials.get(name))
    if not bs:
        return False
    _set(bs, "Base Color", color)
    if "Roughness" in bs.inputs:
        _set(bs, "Roughness", rough)
    if "Emission Strength" in bs.inputs:
        _set(bs, "Emission Strength", 0.0)
    if "Metallic" in bs.inputs:
        _set(bs, "Metallic", 0.0)
    return True


def _gain_shells(gain):
    changed = 0
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        if not any(node.name == "RobotShellAlbedo" for node in mat.node_tree.nodes):
            continue
        bs = _principal(mat)
        if not bs:
            continue
        base = bs.inputs["Base Color"]
        if not base.links:
            continue
        nt = mat.node_tree
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.name = "DayShellGain"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Fac"].default_value = 1.0
        mix.inputs[2].default_value = (gain, gain, gain, 1.0)
        nt.links.new(base.links[0].from_socket, mix.inputs[1])
        for link in list(base.links):
            nt.links.remove(link)
        nt.links.new(mix.outputs[0], base)
        changed += 1
    return changed


def _split_pedestal_lobes():
    """Day only. The pore map stays on diffuse. Glossy is a flat coat at the
    locked specular weight, so roughness no longer drives the highlight.
    Projection, the unlinked normal, and specular 0.20 are not changed.
    """
    names = (
        "Hero limestone",
        "Empty foreground limestone",
        "Rear limestone",
        "Orb limestone",
    )
    done = 0
    for name in names:
        obj = bpy.data.objects.get(name)
        if not obj:
            continue
        for slot in obj.material_slots:
            mat = slot.material
            if not mat or not mat.use_nodes or mat.name.startswith("Canonical arch"):
                continue
            nt = mat.node_tree
            if any(node.name == "DayLobeSplit" for node in nt.nodes):
                done += 1
                continue
            bs = _principal(mat)
            out = next((node for node in nt.nodes if node.type == "OUTPUT_MATERIAL"), None)
            if not bs or not out:
                continue
            diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
            diffuse.name = "DayDiffuseLobe"
            glossy = nt.nodes.new("ShaderNodeBsdfGlossy")
            glossy.name = "DayGlossyLobe"
            glossy.inputs["Roughness"].default_value = 0.55
            mix = nt.nodes.new("ShaderNodeMixShader")
            mix.name = "DayLobeSplit"
            mix.inputs["Fac"].default_value = 0.20
            base = bs.inputs["Base Color"]
            if base.links:
                nt.links.new(base.links[0].from_socket, diffuse.inputs["Color"])
            else:
                diffuse.inputs["Color"].default_value = tuple(base.default_value)
            rough = bs.inputs["Roughness"]
            if rough.links:
                nt.links.new(rough.links[0].from_socket, diffuse.inputs["Roughness"])
            else:
                diffuse.inputs["Roughness"].default_value = rough.default_value
            nt.links.new(diffuse.outputs[0], mix.inputs[1])
            nt.links.new(glossy.outputs[0], mix.inputs[2])
            surface = out.inputs["Surface"]
            for link in list(surface.links):
                nt.links.remove(link)
            nt.links.new(mix.outputs[0], surface)
            if "Specular IOR Level" in bs.inputs:
                bs.inputs["Specular IOR Level"].default_value = 0.2
            done += 1
    return done


def apply_day_overrides(scene):
    """Warm the day sun, then split the stone lobes. Other themes never call this."""
    hit = {"sun": False, "lobes": _split_pedestal_lobes()}
    sun = bpy.data.objects.get("Cinematic day sun")
    if sun and sun.type == "LIGHT":
        sun.data.energy = SUN_ENERGY
        sun.data.color = SUN_COLOR
        sun.data.angle = SUN_ANGLE
        hit["sun"] = True
    view = scene.view_settings
    emitters = []
    for mat in bpy.data.materials:
        bs = _principal(mat)
        if not bs or "Emission Strength" not in bs.inputs:
            continue
        strength = float(bs.inputs["Emission Strength"].default_value)
        if strength > 0.02:
            emitters.append((mat.name, round(strength, 3)))
    print(
        "DAY_LOOK",
        {
            "bust_emission": BUST_EMISSION,
            "banner_emission": BANNER_EMISSION,
            "stone_cool": STONE_COOL[:3],
            "sun_energy": SUN_ENERGY,
            "sun_color": SUN_COLOR,
            "sun_angle": SUN_ANGLE,
            "lobes": hit["lobes"],
            "view_transform": view.view_transform,
            "look": view.look,
            "exposure": view.exposure,
            "gamma": view.gamma,
            "display": scene.display_settings.display_device,
            "emitters": emitters,
        },
        flush=True,
    )
    return hit
