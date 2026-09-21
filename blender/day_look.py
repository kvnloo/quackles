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
SUN_ENERGY = 18.0
SUN_COLOR = (0.88, 0.92, 1.0)
SUN_ANGLE = 0.014


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


def apply_day_overrides(scene):
    """Refine the existing day rig. Does not rebuild lights or the robot."""
    hit = {
        "POSTER-bust": _emission("POSTER-bust", BUST_EMISSION),
        "QUALITY-banner-header": _emission("QUALITY-banner-header", BANNER_EMISSION),
        "bust_grade": _remap_print("POSTER-bust"),
        "banner_grade": _remap_print("QUALITY-banner-header"),
        "frame": _solid("POSTER-blue-frame", FRAME_COLOR, FRAME_ROUGH),
        "shells": _gain_shells(SHELL_GAIN),
    }
    for name in ("QUALITY-quarried-stone", "POSTER-limestone", "POSTER-plinth"):
        mat = bpy.data.materials.get(name)
        if not mat or not mat.use_nodes:
            continue
        cool = next((n for n in mat.node_tree.nodes if n.name == "LimestoneCool"), None)
        if cool:
            cool.inputs[2].default_value = STONE_COOL
            cool.inputs["Fac"].default_value = STONE_FAC
    sun = bpy.data.objects.get("Cinematic day sun")
    if sun and sun.type == "LIGHT":
        sun.data.energy = SUN_ENERGY
        sun.data.color = SUN_COLOR
        sun.data.angle = SUN_ANGLE
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
            "applied": hit,
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
