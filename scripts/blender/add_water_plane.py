"""Add a refractive water plane. Run only on feat/water. Not imported by the site."""
import bpy

def add_water():
    if "water_pool" in bpy.data.objects:
        return bpy.data.objects["water_pool"]
    bpy.ops.mesh.primitive_plane_add(size=4.2, location=(0.0, 0.0, 0.012))
    water = bpy.context.active_object
    water.name = "water_pool"
    mat = bpy.data.materials.new("water_pool")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    glass = nt.nodes.new("ShaderNodeBsdfGlass")
    glass.inputs["IOR"].default_value = 1.333
    glass.inputs["Roughness"].default_value = 0.02
    nt.links.new(glass.outputs["BSDF"], out.inputs["Surface"])
    water.data.materials.append(mat)
    water.cycles.is_caustics_caster = True
    for name in ("plinth", "floor", "ground", "studio_floor"):
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.cycles.is_caustics_receiver = True
    sun = bpy.data.objects.get("Sun") or bpy.data.objects.get("key")
    if sun is not None and sun.type == "LIGHT":
        sun.data.cycles.is_caustics_light = True
    return water

if __name__ == "__main__":
    add_water()
    print("WATER_POOL", flush=True)
