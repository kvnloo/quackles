"""Five native-lighting treatments; geometry is left to cinematic_motion."""
import sys
from pathlib import Path
import bpy
from mathutils import Vector

_PLINTH = Path(__file__).resolve().parent
if str(_PLINTH) not in sys.path:
    sys.path.insert(0, str(_PLINTH))
from plinth_look import apply_plinth_look  # noqa: E402

THEMES = ('day','white','blue','dark','night')
BASE_THEME = {'day':'white','white':'white','blue':'cobalt','dark':'dark','night':'dark'}

def principal(mat):
    return next((n for n in mat.node_tree.nodes if n.type=='BSDF_PRINCIPLED'),None) if mat and mat.use_nodes else None

def set_input(node,key,value):
    socket=node.inputs[key]
    for link in list(socket.links):node.id_data.links.remove(link)
    socket.default_value=value

PRINT_MATERIALS=('POSTER-bust','QUALITY-banner-header','POSTER-hands')

def pin_prints(scene):
    cam=scene.camera
    if not cam:return
    up=cam.matrix_world.to_quaternion() @ Vector((0,1,0))
    hands=bpy.data.objects.get('Creation print')
    if hands:
        hands.hide_render=False
        hands.hide_viewport=False
        hands.visible_camera=True
        if not hands.get('cinematic_print_pinned'):
            hands.matrix_world.translation += up * 0.03
            hands['cinematic_print_pinned']=True
    banner=bpy.data.objects.get('Banner through top edge')
    if banner and not banner.get('cinematic_banner_pinned'):
        banner.matrix_world.translation -= up * 0.055
        banner['cinematic_banner_pinned']=True
        banner.hide_render=False
        banner.visible_camera=True
    classical=bpy.data.objects.get('Classical print')
    if classical:
        classical.hide_render=False
        classical.visible_camera=True



def camera_background(scene,theme):
    colors={'day':(.008,.008,.01,1),'white':(.64,.61,.55,1),'blue':(.001,.006,.65,1),'dark':(.0015,.002,.003,1),'night':(0,0,0,1)}
    nt=scene.world.node_tree
    output=next(n for n in nt.nodes if n.type=='OUTPUT_WORLD')
    prior=output.inputs['Surface'].links[0].from_socket
    light_path=nt.nodes.new('ShaderNodeLightPath')
    camera=nt.nodes.new('ShaderNodeBackground');camera.name='Cinematic camera background'
    camera.inputs['Color'].default_value=colors[theme];camera.inputs['Strength'].default_value=1
    mix=nt.nodes.new('ShaderNodeMixShader');nt.links.new(light_path.outputs['Is Camera Ray'],mix.inputs[0]);nt.links.new(prior,mix.inputs[1]);nt.links.new(camera.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],output.inputs['Surface'])

def _illuminate(scene, theme):
    """Lights and exposure only. Does not touch base color, textures, or decals."""
    exposure = {'day': 0.0, 'white': 0.2, 'blue': -0.15, 'dark': -0.55, 'night': -0.35}[theme]
    scene.view_settings.exposure = exposure
    if theme == 'day':
        return
    if theme == 'white':
        return
    tint = {'blue': (0.45, 0.62, 1.0), 'dark': (0.72, 0.78, 1.0), 'night': (0.35, 0.5, 1.0)}[theme]
    gain = {'blue': 0.85, 'dark': 0.45, 'night': 0.35}[theme]
    for obj in scene.objects:
        if obj.type != 'LIGHT':
            continue
        obj.data.color = tint
        obj.data.energy = float(obj.data.energy) * gain
    if scene.world and scene.world.use_nodes:
        for node in scene.world.node_tree.nodes:
            if node.type != 'BACKGROUND' or node.name == 'Cinematic camera background':
                continue
            strength = {'blue': 0.35, 'dark': 0.04, 'night': 0.0}[theme]
            node.inputs['Strength'].default_value = strength
            if theme == 'blue':
                node.inputs['Color'].default_value = (0.15, 0.25, 0.55, 1.0)


def configure_theme(scene,theme):
    assert theme in THEMES
    scene['cinematic_theme']=theme
    # Prints keep atlas color on both albedo and emission. White emission
    # at 0.15 washed the cobalt banner to paper.
    crops={
        'POSTER-bust':(714,98,1024,700),
        'QUALITY-banner-header':(702,1,790,96),
        'POSTER-hands':(30,1355,434,1536),
    }
    for name,box in crops.items():
        mat=bpy.data.materials.get(name);bs=principal(mat)
        if not bs:continue
        texture=next((n for n in mat.node_tree.nodes if n.type=='TEX_IMAGE'),None)
        mapping=next((n for n in mat.node_tree.nodes if n.type=='MAPPING'),None)
        if mapping:
            x0,y0,x1,y1=box
            mapping.inputs['Scale'].default_value[0]=(x1-x0)/1024
            mapping.inputs['Location'].default_value[0]=x0/1024
            mapping.inputs['Scale'].default_value[1]=(y1-y0)/1536
            mapping.inputs['Location'].default_value[1]=1-y1/1536
        if texture:
            mat.node_tree.links.new(texture.outputs['Color'],bs.inputs['Base Color'])
            mat.node_tree.links.new(texture.outputs['Color'],bs.inputs['Emission Color'])
        set_input(bs,'Emission Strength',0)
        set_input(bs,'Roughness',.92)
        set_input(bs,'Sheen Weight',.14)
    pin_prints(scene)
    import importlib.util
    _canon_path = Path(__file__).resolve().parent / "canonical_set.py"
    _canon_spec = importlib.util.spec_from_file_location("quackles_canonical_set", _canon_path)
    _canon = importlib.util.module_from_spec(_canon_spec)
    _canon_spec.loader.exec_module(_canon)
    _canon.seat_creation_print()
    apply_plinth_look(scene)
    frame=principal(bpy.data.materials.get('POSTER-blue-frame'))
    if frame:
        nt=frame.id_data;coords=nt.nodes.new('ShaderNodeTexCoord')
        grain=nt.nodes.new('ShaderNodeTexNoise');grain.inputs['Scale'].default_value=1100;grain.inputs['Detail'].default_value=3
        nt.links.new(coords.outputs['Object'],grain.inputs['Vector'])
        rough=nt.nodes.new('ShaderNodeMapRange');rough.inputs['To Min'].default_value=.28;rough.inputs['To Max'].default_value=.55
        nt.links.new(grain.outputs['Fac'],rough.inputs['Value']);nt.links.new(rough.outputs[0],frame.inputs['Roughness'])
        bump=nt.nodes.new('ShaderNodeBump');bump.inputs['Distance'].default_value=.000045;bump.inputs['Strength'].default_value=.18
        nt.links.new(grain.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],frame.inputs['Normal'])
    stone=bpy.data.materials.get('QUALITY-quarried-stone')
    if stone:
        for n in stone.node_tree.nodes:
            if n.type=='MIX_RGB' and tuple(round(v,3)for v in n.inputs[2].default_value[:3])==(.07,.057,.046) and n.inputs[0].is_linked:
                mask=n.inputs[0].links[0].from_node
                if mask.type=='MATH' and mask.operation=='MULTIPLY':mask.inputs[1].default_value=.48
    camera_background(scene,theme)
    env_strength={'day':.22,'white':.26,'blue':.14,'dark':.035,'night':0}
    env_flat={'dark':(.008,.01,.016,1),'night':(0,0,0,1)}
    for n in scene.world.node_tree.nodes:
        if n.type=='BACKGROUND' and n.name!='Cinematic camera background':
            n.inputs['Strength'].default_value=env_strength[theme]
            if theme in env_flat:
                set_input(n,'Color',env_flat[theme])
    if theme=='day':
        # Hard parallel sun from camera-right; studio areas only wrap.
        cam=scene.camera;q=cam.matrix_world.to_quaternion()
        right=q @ Vector((1,0,0));fwd=q @ Vector((0,0,-1));up=q @ Vector((0,1,0))
        key=bpy.data.objects['Key'];key.data.energy=0
        # One drill: sun is the only key. Area wrap was the Day giveaway.
        bpy.data.objects['Fill'].data.energy=0
        bpy.data.objects['Rim'].data.energy=0
        bpy.data.objects['Bounce'].data.energy=0
        sun=bpy.data.lights.new('Cinematic day sun','SUN')
        # Cooler key — warm (1,.87,.62) + cream albedo washed lock concrete to ivory.
        sun.energy=14;sun.color=(1.0,.90,.76);sun.angle=.04
        sun_obj=bpy.data.objects.new('Cinematic day sun',sun);scene.collection.objects.link(sun_obj)
        sun_obj.location=cam.location+1.55*right+0.35*fwd+1.55*up
        aim=Vector((.04,0,.36))-sun_obj.location
        sun_obj.rotation_euler=aim.to_track_quat('-Z','Y').to_euler()
        # Day changes the sun only. Wall and shell albedo stay on the shared set.
        import importlib.util
        day_path = Path(__file__).resolve().parent / "day_look.py"
        spec = importlib.util.spec_from_file_location("quackles_day_look", day_path)
        day_look = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(day_look)
        day_look.apply_day_overrides(scene)
    _canon.apply_canonical(scene, theme)
    _illuminate(scene, theme)
    return
    for obj in scene.objects:
        if obj.type=='LIGHT':obj.data.energy=0
    if scene.world and scene.world.use_nodes:
        for n in scene.world.node_tree.nodes:
            if n.type=='BACKGROUND':set_input(n,'Strength',0)
    for mat in bpy.data.materials:
        bs=principal(mat)
        if not bs:continue
        if mat.name in PRINT_MATERIALS:continue
        set_input(bs,'Emission Strength',0)
        if mat.name=='POSTER-wall':set_input(bs,'Base Color',(.003,.004,.007,1))
        if mat.name.startswith('PHOTO-pigment-'):
            blue=next((n for n in mat.node_tree.nodes if n.type=='MIX_RGB' and n.inputs[2].default_value[2]>.7 and n.inputs[2].default_value[0]<.02),None)
            if blue and blue.inputs[0].is_linked:
                strength=mat.node_tree.nodes.new('ShaderNodeMath');strength.operation='MULTIPLY';strength.inputs[1].default_value=32
                mat.node_tree.links.new(blue.inputs[0].links[0].from_socket,strength.inputs[0])
                mat.node_tree.links.new(strength.outputs[0],bs.inputs['Emission Strength'])
                set_input(bs,'Emission Color',(.003,.16,1,1))
        elif mat.name=='POSTER-plinth-ink':
            set_input(bs,'Emission Color',(.005,.085,1,1));set_input(bs,'Emission Strength',14)
        elif mat.name=='CAL-lens':
            set_input(bs,'Emission Color',(.002,.09,1,1));set_input(bs,'Emission Strength',.04)
    # Paint the existing eye ring; the official robot mesh is not altered.
    for obj in bpy.data.objects['duck_root'].children_recursive:
        if obj.type=='MESH' and '__noenoeil.stl' in obj.name:
            for slot in obj.material_slots:
                if slot.material:
                    slot.material=slot.material.copy();bs=principal(slot.material)
                    if bs:
                        set_input(bs,'Emission Color',(.008,.16,1,1))
                        nt=slot.material.node_tree
                        fresnel=nt.nodes.new('ShaderNodeFresnel');fresnel.inputs['IOR'].default_value=1.3
                        gain=nt.nodes.new('ShaderNodeMath');gain.operation='MULTIPLY';gain.inputs[1].default_value=18
                        nt.links.new(fresnel.outputs[0],gain.inputs[0]);nt.links.new(gain.outputs[0],bs.inputs['Emission Strength'])
    # Emissive rim coatings on existing ankle bearings and neck plates keep the
    # mechanism connected in silhouette and illuminate nearby parts physically.
    for obj in bpy.data.objects['duck_root'].children_recursive:
        if obj.type!='MESH':continue
        bearing='__seeed_bearing' in obj.name and obj.parent and obj.parent.name in {'ankle_left','ankle_right','neck_pitch'}
        neck='__neck.stl' in obj.name
        if not (bearing or neck):continue
        for slot in obj.material_slots:
            if not slot.material:continue
            slot.material=slot.material.copy();bs=principal(slot.material)
            if not bs:continue
            nt=slot.material.node_tree
            f=nt.nodes.new('ShaderNodeFresnel');f.inputs['IOR'].default_value=1.38
            g=nt.nodes.new('ShaderNodeMath');g.operation='MULTIPLY';g.inputs[1].default_value=14 if bearing else 1.5
            nt.links.new(f.outputs[0],g.inputs[0]);nt.links.new(g.outputs[0],bs.inputs['Emission Strength'])
            set_input(bs,'Emission Color',(.003,.14,1,1))
    orb=bpy.data.objects.get('Cobalt optical glass')
    if orb:
        # Light scattered inside real absorbing glass, rather than a white
        # emissive shell, leaves the outside surface visibly transparent.
        glass=orb.data.materials[0];nt=glass.node_tree
        output=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
        prior=output.inputs['Volume'].links[0].from_socket
        scatter=nt.nodes.new('ShaderNodeVolumeScatter');scatter.inputs['Color'].default_value=(.025,.16,1,1);scatter.inputs['Density'].default_value=.18;scatter.inputs['Anisotropy'].default_value=.35
        add=nt.nodes.new('ShaderNodeAddShader');nt.links.new(prior,add.inputs[0]);nt.links.new(scatter.outputs[0],add.inputs[1]);nt.links.new(add.outputs[0],output.inputs['Volume'])
        lamp=bpy.data.lights.new('Orb internal light','POINT');lamp.energy=.018;lamp.color=(.02,.16,1);lamp.shadow_soft_size=.001
        emitter=bpy.data.objects.new('Orb internal light',lamp);scene.collection.objects.link(emitter)
        emitter.location=orb.matrix_world.translation+Vector((-.008,-.003,.006))
    # Optical bloom is secondary to actual emissive transport in Cycles.
    nt=scene.compositing_node_group
    if nt:
        out=next(n for n in nt.nodes if n.type=='GROUP_OUTPUT')
        source=out.inputs['Image'].links[0].from_socket
        glare=nt.nodes.new('CompositorNodeGlare');glare.inputs['Type'].default_value='Fog Glow';glare.inputs['Quality'].default_value='High'
        glare.inputs['Strength'].default_value=.45;glare.inputs['Size'].default_value=.32
        if 'Threshold' in glare.inputs:glare.inputs['Threshold'].default_value=1.2
        nt.links.new(source,glare.inputs['Image']);nt.links.new(glare.outputs['Image'],out.inputs['Image'])
