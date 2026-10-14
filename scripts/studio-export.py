"""CPU-only web derivative of the locked Day scene; never saves the blend.
Run: env -i HOME=$HOME PATH=/usr/bin:/bin blender -b SOURCE --python scripts/studio-export.py
Output is intentionally PBR-approximated, not a Cycles appearance parity claim.
"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Matrix
OUT = Path(__file__).resolve().parents[1] / 'public/studio'
OUT.mkdir(parents=True, exist_ok=True)
source = Path(bpy.data.filepath)
source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
s = bpy.context.scene
s.render.engine = 'CYCLES'
s.cycles.device = 'CPU'
cam = s.camera
# glTF's Y-up conversion, preserving optical pose and portrait intrinsics.
conversion = Matrix.Rotation(-math.pi / 2, 4, 'X')
m = conversion @ cam.matrix_world
frame = cam.data.view_frame(scene=s)
yfov = 2 * math.atan(abs(frame[0].y / frame[0].z))
manifest = {'source': source.name, 'sourceSha256': source_hash, 'camera': {'name':cam.name, 'position':list(m.translation), 'quaternion':list(m.to_quaternion())[1:]+[m.to_quaternion().w], 'fov':math.degrees(yfov), 'aspect':s.render.resolution_x/s.render.resolution_y, 'near':0.001,'far':100,'lensMm':cam.data.lens,'sensorWidthMm':cam.data.sensor_width,'sensorFit':cam.data.sensor_fit, 'shift':[cam.data.shift_x,cam.data.shift_y]}, 'materials':{},'meshes':[],'approximation':'Standard PBR materials; procedural Cycles shading and light linking are not baked.'}
# Limit all images in memory; source image files and .blend remain untouched.
for image in bpy.data.images:
    if image.size[0] and image.size[1] and max(image.size) > 2048:
        scale = 2048 / max(image.size)
        image.scale(max(1,round(image.size[0]*scale)),max(1,round(image.size[1]*scale)))

def image_named(name):
    return bpy.data.images.get(name)

def material_for(old):
    name = old.name
    low = name.lower()
    slot = None
    tex = None
    base = tuple(old.diffuse_color)
    roughness = 0.65
    metallic = 0.0
    if name.startswith('PHOTO-pigment'):
        slot,base = 'shell',(0.72,0.71,0.66,1)
        roughness = 0.38
    elif name == 'Hero front stone + Creation print':
        slot,tex,base = 'print',image_named('hands_chatgpt_refstyle.png'),(1,1,1,1)
    elif 'continuous poster' in low:
        slot,tex,base = 'poster',image_named('poster_blue_continuous_v3.png'),(1,1,1,1)
    elif name == 'POSTER-wall':
        slot,base = 'background',(0.72,0.69,0.59,1)
    elif any(t in low for t in ['stone','pier','arch','plinth wet']):
        slot,tex,base = 'stone',image_named('stone_albedo_4k.png'),(0.72,0.68,0.58,1)
    elif 'lapis' in low or 'blue-frame' in low:
        base = (0.015,0.05,0.45,1)
    elif 'sphere' in low:
        base,roughness,metallic = (0.012,0.04,0.4,1),0.12,0.65
    elif 'metal' in low or 'satin' in low:
        base,roughness,metallic = (0.28,0.3,0.33,1),0.3,0.7
    elif 'motor' in low or 'face' in low or 'lens' in low:
        base,roughness = (0.016,0.02,0.027,1),0.45
    elif 'ink' in low:
        base = (0.015,0.025,0.085,1)
    elif 'foliage' in low:
        base = (0.04,0.09,0.025,1)
    mat = bpy.data.materials.new('studio-'+name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = base
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    if tex:
        n = mat.node_tree.nodes.new('ShaderNodeTexImage')
        n.image = tex
        uv = mat.node_tree.nodes.new('ShaderNodeUVMap')
        uv.uv_map = 'Creation' if slot == 'print' else 'RegisteredPosterUV' if slot == 'poster' else 'StoneUV'
        mat.node_tree.links.new(uv.outputs['UV'],n.inputs['Vector'])
        mat.node_tree.links.new(n.outputs['Color'],p.inputs['Base Color'])
    if slot:
        mat['studioSlot'] = slot
        manifest['materials'][mat.name] = slot
    return mat

cache = {}
bpy.ops.object.select_all(action='DESELECT')
for obj in list(s.objects):
    if obj.hide_render or not obj.visible_get() or obj.type not in {'MESH','CURVE','CAMERA','EMPTY'}:
        continue
    if obj.type in {'MESH','CURVE'}:
        # Real evaluated geometry, no change to authored file; freeze modifiers.
        dep = bpy.context.evaluated_depsgraph_get()
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(dep), depsgraph=dep)
        if obj.type == 'CURVE':
            new = bpy.data.objects.new(obj.name+'-web',mesh)
            s.collection.objects.link(new)
            new.matrix_world = obj.matrix_world
            obj = new
        else:
            obj.data = mesh
            obj.modifiers.clear()
        for i,old in enumerate(list(obj.data.materials)):
            if old:
                if old.name not in cache: cache[old.name] = material_for(old)
                obj.data.materials[i] = cache[old.name]
        if not obj.data.uv_layers:
            # Deterministic box UVs for imported STL shell parts.
            uv = obj.data.uv_layers.new(name='StudioUV')
            coords = [v.co for v in obj.data.vertices]
            for poly in obj.data.polygons:
                axis = max(range(3),key=lambda i:abs(poly.normal[i]))
                axes = [i for i in range(3) if i != axis]
                spans = [(min(v[i] for v in coords),max(v[i] for v in coords)) for i in axes]
                for li in poly.loop_indices:
                    v = obj.data.vertices[obj.data.loops[li].vertex_index].co
                    uv.data[li].uv = [(v[a]-lo)/max(hi-lo,1e-8) for a,(lo,hi) in zip(axes,spans)]
        manifest['meshes'].append({'name':obj.name,'vertices':len(obj.data.vertices),'hasUV':bool(obj.data.uv_layers)})
    obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(OUT/'day-set.glb'),export_format='GLB',use_selection=True,export_cameras=True,export_extras=True,export_animations=False,export_yup=True,export_draco_mesh_compression_enable=True,export_draco_mesh_compression_level=6,export_image_format='JPEG',export_jpeg_quality=85)
manifest['bytes'] = (OUT/'day-set.glb').stat().st_size
manifest['sha256'] = hashlib.sha256((OUT/'day-set.glb').read_bytes()).hexdigest()
assert manifest['bytes'] < 25_000_000, manifest['bytes']
assert source_hash == hashlib.sha256(source.read_bytes()).hexdigest(), 'Source changed'
(OUT/'scene.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('STUDIO_EXPORT',json.dumps({'bytes':manifest['bytes'],'sha256':manifest['sha256'],'camera':manifest['camera'],'meshes':len(manifest['meshes'])}))
