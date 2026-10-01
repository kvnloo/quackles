"""RFC-003 spike: export the Blue hero (p0000000) from the saved canonical scene for a three.js parity study.

Research only. Nothing here is imported by the site. Blender stays canonical: this reads the saved Blue scene and
writes derived artifacts (camera JSON, baked textures, GLB) to OUT.

usage (always under the GPU lock, one stage per run so the lock is held briefly):
  flock /tmp/claude-1000/gpu.lock blender -b --factory-startup --python blender_export.py -- STAGE OUT [opts]
stages:
  ref    Cycles 1024x1536 render of the scene as saved (64 spp, denoised) + robot-only visibility mask (Workbench)
  bake   decimate robot, add a 'Bake' UV atlas per group, bake COMBINED (lighting) + DIFFUSE COLOR (albedo) per group,
         write camera.json and <group>.glb (UV0 = Bake atlas)
opts: --cpu (render/bake on CPU; GPU memory is shared with other tenants)
opts for bake: --only robot|set (one group per run keeps each GPU-lock hold short) --robot-res 8192 --set-res 4096 --samples 128 --decimate 0.3
"""
import bpy, sys, json, math, time
from pathlib import Path

BLEND = "/mnt/zer0models/project-artifacts/quackles/overnight/preserved/proofs-v2-scenes/blue-cinematic.blend"
a = sys.argv[sys.argv.index("--") + 1:]
STAGE, OUT = a[0], Path(a[1]); OUT.mkdir(parents=True, exist_ok=True)
def opt(k, d): return type(d)(a[a.index(k) + 1]) if k in a else d

bpy.ops.wm.open_mainfile(filepath=BLEND)
S = bpy.context.scene
prefs = bpy.context.preferences.addons["cycles"].preferences
if "--cpu" in a:  # another tenant can hold most of the GPU's memory; keep Cycles (and its denoiser) off the GPU
    prefs.compute_device_type = "NONE"; S.cycles.device = "CPU"; S.cycles.denoising_use_gpu = False
else:
    prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = d.type == "OPTIX"
    S.cycles.device = "GPU"
S.render.threads_mode = "AUTO"

ROOT = bpy.data.objects["duck_root"]
ROBOT = [o for o in ROOT.children_recursive if o.type == "MESH" and not o.hide_render]
SET = [o for o in S.objects if o.type in ("MESH", "FONT") and not o.hide_render and o not in ROBOT
       and o.visible_camera]
log = lambda *x: print("RFC003", *x, flush=True)


def camera_json():
    c = S.camera; d = c.data
    aspect = S.render.resolution_x / S.render.resolution_y
    # sensor_fit HORIZONTAL: lens covers sensor_width across the image width.
    hfov = 2 * math.atan(d.sensor_width / 2 / d.lens)
    vfov = 2 * math.atan(math.tan(hfov / 2) / aspect)
    m = c.matrix_world
    # Blender Z-up -> glTF/three Y-up: (x, y, z) -> (x, z, -y)
    conv = lambda v: [v[0], v[2], -v[1]]
    col = lambda i: [m[0][i], m[1][i], m[2][i]]
    return dict(lens_mm=d.lens, sensor_width_mm=d.sensor_width, sensor_fit=d.sensor_fit, shift=[d.shift_x, d.shift_y],
                clip=[d.clip_start, d.clip_end], width=S.render.resolution_x, height=S.render.resolution_y,
                hfov_deg=math.degrees(hfov), vfov_deg=math.degrees(vfov),
                position=conv(col(3)), x_axis=conv(col(0)), y_axis=conv(col(1)), z_axis=conv(col(2)),
                view_transform=S.view_settings.view_transform, look=S.view_settings.look,
                exposure=S.view_settings.exposure, gamma=S.view_settings.gamma, blend=BLEND)


if STAGE == "ref":
    S.render.engine = "CYCLES"; S.cycles.samples = 64; S.cycles.use_denoising = True; S.cycles.denoiser = "OPTIX"
    S.render.resolution_percentage = 100
    S.render.image_settings.file_format = "PNG"; S.render.image_settings.color_mode = "RGB"
    S.render.filepath = str(OUT / "cycles-ref-1024.png"); t = time.time()
    bpy.ops.render.render(write_still=True); log("ref seconds", time.time() - t)
    # Robot visibility mask: Workbench flat object colour, robot white, everything else black, same camera.
    S.render.engine = "BLENDER_WORKBENCH"; sh = S.display.shading
    sh.light = "FLAT"; sh.color_type = "OBJECT"; sh.show_shadows = False; sh.show_cavity = False
    sh.show_object_outline = False; sh.show_specular_highlight = False
    S.display_settings.display_device = "sRGB"; S.view_settings.view_transform = "Standard"; S.view_settings.look = "None"
    S.render.film_transparent = False
    S.world.color = (0, 0, 0); S.render.filter_size = 0.01
    for o in S.objects:
        if o.type in ("MESH", "FONT"): o.color = (1, 1, 1, 1) if o in ROBOT else (0, 0, 0, 1)
    S.render.filepath = str(OUT / "cycles-robot-mask-1024.png"); bpy.ops.render.render(write_still=True)
    (OUT / "camera.json").write_text(json.dumps(camera_json(), indent=1))
    log("done ref")

elif STAGE == "bake":
    RR, SR, SPP, DEC = opt("--robot-res", 8192), opt("--set-res", 4096), opt("--samples", 128), opt("--decimate", 0.3)
    (OUT / "camera.json").write_text(json.dumps(camera_json(), indent=1))
    vl = bpy.context.view_layer
    # Fonts -> meshes (keeps material); modifiers applied so bake == export geometry.
    def realize(objs):
        out = []
        for o in objs:
            for s in S.objects: s.select_set(False)
            vl.objects.active = o; o.select_set(True)
            if o.type == "FONT": bpy.ops.object.convert(target="MESH")
            elif o.modifiers: bpy.ops.object.convert(target="MESH")
            out.append(vl.objects.active)
        return out
    SET = realize(SET)
    mods = sorted({m.type for o in ROBOT for m in o.modifiers})
    tris0 = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ROBOT)
    for o in ROBOT:  # robot parts are dense CAD; collapse-decimate the big ones (UV 'Artwork' seams preserved)
        n = len(o.data.polygons)
        if n > 3000:
            m = o.modifiers.new("dec", "DECIMATE"); m.ratio = DEC; m.use_collapse_triangulate = True
            o.modifiers.move(len(o.modifiers) - 1, 0)
    # Decimate first, then the part's own stack (WEIGHTED_NORMAL) re-evaluates on the decimated mesh; everything is
    # applied now because a join keeps only the active object's modifier stack.
    ROBOT = realize(ROBOT)
    log("robot modifiers applied", mods)
    tris1 = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in ROBOT)
    log("robot tris", tris0, "->", tris1)

    WEIGHT = {"Studio floor": 0.3, "Studio back": 0.6}
    TILES = opt("--tiles", 1)  # >1: bake the light atlas as TILES^2 sub-images (RAM: an 8K float bake OOMs here)
    ANGLE, MARGIN, SHAPE = opt("--angle", 66.0), opt("--margin", 3.0), opt("--shape", "CONCAVE")

    def atlas(objs, name, res):
        """'Bake' UV atlas over all parts of a group. Every part's render UV is first normalised to 'Artwork' (the
        name the pigment materials address) so material lookups survive the join below."""
        for o in objs:
            if o.data.users > 1: o.data = o.data.copy()  # shared CAD meshes (xl330 x N) need their own islands
            me = o.data
            ren = next((u for u in me.uv_layers if u.active_render), None) or me.uv_layers.new(name="Artwork")
            ren.name = "Artwork"
            for u in list(me.uv_layers):
                if u.name != "Artwork": me.uv_layers.remove(u)
            me.uv_layers["Artwork"].active_render = True
            me.uv_layers.active = me.uv_layers.new(name="Bake")  # bake target; render UV unchanged
        for s in S.objects: s.select_set(False)
        for o in objs: o.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(ANGLE), island_margin=0.0, area_weight=0.0,
                                 scale_to_bounds=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        # Texel budget follows the hero camera, not 3D area: the 3x3 m floor and the back wall are mostly off-frame
        # or far; the plinth, prints and robot are what a zoom lands on.
        for o in objs:
            w = WEIGHT.get(o.name, 1.0)
            if w != 1.0:
                for d in o.data.uv_layers["Bake"].data: d.uv = d.uv * w
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.select_all(action="SELECT")
        bpy.ops.uv.pack_islands(margin=MARGIN / res, rotate=True, shape_method=SHAPE, margin_method="FRACTION")
        bpy.ops.object.mode_set(mode="OBJECT")
        cov = 0.0
        for o in objs:
            uv = o.data.uv_layers["Bake"].data
            for poly in o.data.polygons:
                pts = [uv[i].uv for i in poly.loop_indices]
                cov += abs(sum(pts[i].x * pts[i - 1].y - pts[i - 1].x * pts[i].y for i in range(len(pts)))) / 2
        log("atlas", name, "uv coverage", round(cov, 3))
        if "--uvonly" in a: return None
        imgs = {}
        for kind in ("light", "albedo"):  # both at res/TILES: light is baked TILES^2 times (one UV quadrant each)
            img = bpy.data.images.new(f"{name}-{kind}", res // TILES, res // TILES, float_buffer=(kind == "light"))
            img.generated_color = (0, 0, 0, 1); imgs[kind] = img
        return imgs

    def join(objs, name):
        """Cycles bakes a multi-object selection one object at a time over the whole image (130 robot parts = 130
        full passes), so each group is joined into one mesh. Shading stays identical: per-part Object/Generated
        texture coordinates are frozen into point attributes and the material links are rewired to them."""
        for o in objs:
            me = o.data
            co = [v.co.copy() for v in me.vertices]
            lo = [min(c[i] for c in co) for i in range(3)]; hi = [max(c[i] for c in co) for i in range(3)]
            gen = [[(c[i] - lo[i]) / max(hi[i] - lo[i], 1e-9) for i in range(3)] for c in co]
            for nm, data in (("ocoord", co), ("gcoord", gen)):
                at = me.attributes.new(nm, "FLOAT_VECTOR", "POINT")
                at.data.foreach_set("vector", [x for c in data for x in c])
        for m in {s.material for o in objs for s in o.material_slots if s.material}:
            nt = m.node_tree
            todo = [(l.from_socket.name, l.to_socket) for l in nt.links
                    if l.from_node.type == "TEX_COORD" and l.from_socket.name in ("Object", "Generated")]
            for kind, to in todo:
                at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_type = "GEOMETRY"
                at.attribute_name = "ocoord" if kind == "Object" else "gcoord"
                nt.links.new(at.outputs["Vector"], to)  # replaces the Texture Coordinate link
        for s in S.objects: s.select_set(False)
        for o in objs: o.select_set(True)
        vl.objects.active = objs[0]
        bpy.ops.object.join()
        j = vl.objects.active; j.name = name
        j.data.uv_layers["Artwork"].active_render = True; j.data.uv_layers.active = j.data.uv_layers["Bake"]
        return [j]

    def target(objs, img):
        mats = {s.material for o in objs for s in o.material_slots if s.material}
        for m in mats:
            nt = m.node_tree
            n = nt.nodes.get("RFC003_BAKE") or nt.nodes.new("ShaderNodeTexImage"); n.name = "RFC003_BAKE"
            n.image = img
            for x in nt.nodes: x.select = False
            n.select = True; nt.nodes.active = n

    def bake(objs, img, kind, spp, suffix=""):
        target(objs, img)
        for s in S.objects: s.select_set(False)
        for o in objs: o.select_set(True)
        vl.objects.active = objs[0]
        S.render.engine = "CYCLES"; S.cycles.samples = spp; S.render.bake.margin = 6; S.render.bake.use_clear = True
        t = time.time()
        if kind == "light":
            bpy.ops.object.bake(type="COMBINED", margin=6, use_clear=True, pass_filter={
                "EMIT", "DIRECT", "INDIRECT", "DIFFUSE", "GLOSSY", "TRANSMISSION"})
        else:
            S.render.bake.use_pass_direct = False; S.render.bake.use_pass_indirect = False
            S.render.bake.use_pass_color = True
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=6, use_clear=True)
        import numpy as np
        px = np.empty(len(img.pixels), np.float32); img.pixels.foreach_get(px); rgb = px.reshape(-1, 4)[:, :3]
        covered = float((rgb.sum(1) > 0).mean()); del px, rgb
        log("bake", img.name, img.size[:], spp, "spp", round(time.time() - t, 1), "s", "covered", round(covered, 3),
            "device", S.cycles.device)
        if covered == 0 and not suffix: raise SystemExit(f"bake {img.name} produced an empty image")
        p = OUT / f"{img.name}{suffix}.png"
        if kind == "light":
            # Display-referred like the plate: apply the scene view transform (Khronos PBR Neutral) on save.
            S.render.image_settings.file_format = "PNG"; S.render.image_settings.color_depth = "8"
            S.render.image_settings.color_mode = "RGB"
            img.save_render(str(p), scene=S)
        else:
            img.filepath_raw = str(p); img.file_format = "PNG"; img.save()
        return p

    groups = {"robot": (ROBOT, RR), "set": (SET, SR)}
    if "--only" in a: groups = {k: v for k, v in groups.items() if k == a[a.index("--only") + 1]}
    for gname, (objs, res) in list(groups.items()):
        imgs = atlas(objs, gname, res)
        if imgs is None: continue
        objs = join(objs, f"{gname}__joined"); groups[gname] = (objs, res)
        import numpy as np
        uvl = objs[0].data.uv_layers["Bake"]; orig = np.empty(len(uvl.data) * 2, np.float32); uvl.data.foreach_get("uv", orig)
        for j in range(TILES):
            for i in range(TILES):
                if TILES > 1:
                    uvl.data.foreach_set("uv", (orig.reshape(-1, 2) * TILES - np.array([i, j], np.float32)).ravel())
                bake(objs, imgs["light"], "light", SPP, suffix=f"-t{i}{j}" if TILES > 1 else "")
        uvl.data.foreach_set("uv", orig)
        bake(objs, imgs["albedo"], "albedo", 4)

    if "--uvonly" in a: raise SystemExit(0)
    # Export: geometry + Bake UV only; textures are assigned in three.js by mesh-name prefix.
    for gname, (objs, _) in groups.items():
        for o in objs:
            o.name = f"{gname}__{o.name}"
            for uv in list(o.data.uv_layers):
                if uv.name != "Bake": o.data.uv_layers.remove(uv)
    for s in S.objects: s.select_set(False)
    for gname, (objs, _) in groups.items():
        for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(OUT / f"{'-'.join(groups)}.glb"), use_selection=True, export_materials="EXPORT", export_image_format="NONE",
                              export_apply=True, export_cameras=False, export_lights=False, export_yup=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=16, export_draco_texcoord_quantization=14)
    # Lights for the live-lit PBR variant (B1): area lights in three coords.
    conv = lambda v: [v[0], v[2], -v[1]]
    lights = []
    for o in S.objects:
        if o.type == "LIGHT":
            m = o.matrix_world
            lights.append(dict(name=o.name, type=o.data.type, energy_w=o.data.energy, color=list(o.data.color),
                               size=getattr(o.data, "size", 0), size_y=getattr(o.data, "size_y", 0),
                               shape=getattr(o.data, "shape", ""), position=conv(m.translation),
                               direction=conv(-(m.to_3x3().col[2]))))
    (OUT / "lights.json").write_text(json.dumps(lights, indent=1))
    # Per-object Principled scalars for B1 (procedural roughness/bump networks collapse to their unlinked defaults;
    # that loss is part of what B1 measures).
    mats = {}
    for m in {s.material for objs, _ in groups.values() for o in objs for s in o.material_slots if s.material}:
        p = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not p: continue
        g = lambda k: p.inputs[k].default_value
        mats[m.name] = dict(roughness=g("Roughness"), metallic=g("Metallic"), transmission=g("Transmission Weight"),
                            ior=g("IOR"), coat=g("Coat Weight"), alpha=g("Alpha"),
                            emission_strength=g("Emission Strength") if (p.inputs["Emission Color"].is_linked or
                                tuple(g("Emission Color"))[:3] != (0, 0, 0)) else 0.0)
    mp = OUT / "materials.json"  # one run per group: merge so both groups' materials survive
    mp.write_text(json.dumps({**(json.loads(mp.read_text()) if mp.exists() else {}), **mats}, indent=1))
    env = next(n.image for n in S.world.node_tree.nodes if n.type == "TEX_ENVIRONMENT")
    env.scale(1024, 512); env.filepath_raw = str(OUT / "env-1k.hdr"); env.file_format = "HDR"; env.save()
    log("done bake")
