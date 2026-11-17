"""Permanent geometry-owned eye shading; apply AFTER all photo/theme ports.

Blender: import eye_fix; eye_fix.apply(bpy.context.scene, 'day')
Supported themes: day, white, blue, dark, night. No mesh/UV/pose/camera edits.
Source recipes: calibration/render_scene.py CAL-lens; poster_set.py POSTER-ivory
and CAL-face, as saved in poster-v4.blend (before reference-photo painting).
"""
import bpy
VERSION = 1
PARTS = {'lens':'jaw_soft__lens.stl', 'ring':'jaw_soft__noenoeil.stl',
         'holder':'jaw_soft__m12_lens_holder.stl', 'recess':'jaw_soft__face_part.stl'}


def node(nt, kind, **values):
    n = nt.nodes.new(kind)
    for k,v in values.items(): n.inputs[k].default_value=v
    return n


def camera_fill(nt, bs, color, strength):
    """Scoped artistic fill: camera rays only, follows local surface normals."""
    bs.inputs['Emission Color'].default_value=(*color,1)
    geo=node(nt,'ShaderNodeNewGeometry');tr=node(nt,'ShaderNodeVectorTransform');tr.vector_type='NORMAL';tr.convert_from='WORLD';tr.convert_to='OBJECT'
    nt.links.new(geo.outputs['Normal'],tr.inputs[0])
    dot=node(nt,'ShaderNodeVectorMath');dot.operation='DOT_PRODUCT';dot.inputs[1].default_value=(-.35,-.85,.4);nt.links.new(tr.outputs[0],dot.inputs[0])
    clamp=node(nt,'ShaderNodeMath');clamp.operation='MAXIMUM';clamp.inputs[1].default_value=.12;nt.links.new(dot.outputs['Value'],clamp.inputs[0])
    gain=node(nt,'ShaderNodeMath');gain.operation='MULTIPLY';gain.inputs[1].default_value=strength;nt.links.new(clamp.outputs[0],gain.inputs[0])
    lp=node(nt,'ShaderNodeLightPath');cam=node(nt,'ShaderNodeMath');cam.operation='MULTIPLY';nt.links.new(lp.outputs['Is Camera Ray'],cam.inputs[0]);nt.links.new(gain.outputs[0],cam.inputs[1]);nt.links.new(cam.outputs[0],bs.inputs['Emission Strength'])


def material(theme, kind):
    name = 'EYE-FIX-'+theme+'-'+kind
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes=True; nt=m.node_tree; nt.nodes.clear()
    palette={'day':(.60,.59,.55), 'white':(.60,.59,.55),
             'blue':(.67,.70,.75), 'dark':(.45,.46,.47), 'night':(.18,.21,.25)}
    color = palette[theme] if kind=='ring' else ((.012,.012,.014) if kind=='holder' else ((.0004,.001,.002) if kind=='lens' else (.012,.014,.017)))
    rough = .02 if kind=='lens' else (.37 if kind in ('ring','holder') else .4)
    bs=node(nt,'ShaderNodeBsdfPrincipled',**{'Base Color':(*color,1),'Roughness':rough,'Metallic':0})
    out=node(nt,'ShaderNodeOutputMaterial');nt.links.new(bs.outputs['BSDF'],out.inputs['Surface'])
    coord=node(nt,'ShaderNodeTexCoord')
    if kind=='lens':
        bs.inputs['Coat Weight'].default_value=.35;bs.inputs['Coat Roughness'].default_value=.025
        center=node(nt,'ShaderNodeVectorMath');center.operation='SUBTRACT';center.inputs[1].default_value=(.5,.5,.5)
        nt.links.new(coord.outputs['Generated'],center.inputs[0])
        axes=node(nt,'ShaderNodeVectorMath');axes.operation='MULTIPLY';axes.inputs[1].default_value=(1,0,1);nt.links.new(center.outputs[0],axes.inputs[0])
        radius=node(nt,'ShaderNodeVectorMath');radius.operation='LENGTH';nt.links.new(axes.outputs[0],radius.inputs[0])
        square=node(nt,'ShaderNodeMath');square.operation='MULTIPLY';nt.links.new(radius.outputs['Value'],square.inputs[0]);nt.links.new(radius.outputs['Value'],square.inputs[1])
        curve=node(nt,'ShaderNodeMath');curve.operation='SUBTRACT';curve.inputs[0].default_value=.25;nt.links.new(square.outputs[0],curve.inputs[1])
        bump=node(nt,'ShaderNodeBump',Strength=.6,Distance=.001);nt.links.new(curve.outputs[0],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
        bs.inputs['Roughness'].default_value=.12
        bs.inputs['Specular IOR Level'].default_value=.7
        iris=node(nt,'ShaderNodeValToRGB');cr=iris.color_ramp
        cr.elements[0].position=.18;cr.elements[0].color=(.0002,.0008,.003,1)
        cr.elements[1].position=.5;cr.elements[1].color=(.0003,.001,.006,1)
        e=cr.elements.new(.36);e.color=(.001,.015,.06,1)
        nt.links.new(radius.outputs['Value'],iris.inputs[0]);nt.links.new(iris.outputs[0],bs.inputs['Base Color'])
        if theme in ('blue','night'):
            glow=node(nt,'ShaderNodeValToRGB');gr=glow.color_ramp
            gr.elements[0].position=.26;gr.elements[0].color=(0,0,0,1)
            gr.elements[1].position=.50;gr.elements[1].color=(0,0,0,1)
            e=gr.elements.new(.43);e.color=(.003,.18,1.0,1)
            nt.links.new(radius.outputs['Value'],glow.inputs[0]);nt.links.new(glow.outputs[0],bs.inputs['Emission Color'])
            lp=node(nt,'ShaderNodeLightPath');gain=node(nt,'ShaderNodeMath');gain.operation='MULTIPLY';gain.inputs[1].default_value=1.1 if theme=='night' else .24
            nt.links.new(lp.outputs['Is Camera Ray'],gain.inputs[0]);nt.links.new(gain.outputs[0],bs.inputs['Emission Strength'])
    else:
        grain=node(nt,'ShaderNodeTexNoise',Scale=2200 if kind!='recess' else 1700,Detail=2,Roughness=.72)
        nt.links.new(coord.outputs['Object'],grain.inputs['Vector'])
        bump=node(nt,'ShaderNodeBump',Strength=.27 if kind!='recess' else .25,Distance=.000065)
        nt.links.new(grain.outputs['Fac'],bump.inputs['Height']);nt.links.new(bump.outputs[0],bs.inputs['Normal'])
        if kind=='recess':
            ramp=node(nt,'ShaderNodeValToRGB');a,b=ramp.color_ramp.elements
            a.position=.2;a.color=(.005,.006,.007,1);b.position=.8;b.color=(.032,.034,.032,1)
            if theme=='blue':a.color=(.001,.002,.03,1);b.color=(.004,.01,.115,1)
            nt.links.new(grain.outputs['Fac'],ramp.inputs[0]);nt.links.new(ramp.outputs[0],bs.inputs['Base Color'])
        if theme=='blue' and kind=='ring':
            bs.inputs['Base Color'].default_value=(.12,.12,.12,1)
            camera_fill(nt,bs,(.70,.70,.70),1.5)
        if theme=='night' and kind=='ring':
            camera_fill(nt,bs,(.24,.26,.29),1.0)
    m['eye_fix_version']=VERSION
    return m


def shell_rim(scene, theme):
    """Local physical front edge excludes projected photo, not camera pixels."""
    if theme!='night':return
    o=scene.objects['jaw_soft__top_head_shell.stl']
    name='EYE-FIX-'+theme+'-shell-rim'
    if o.material_slots[0].material.name==name:return
    m=o.material_slots[0].material.copy();m.name=name;o.material_slots[0].material=m
    nt=m.node_tree;out=next(n for n in nt.nodes if n.type=='OUTPUT_MATERIAL')
    original=out.inputs['Surface'].links[0].from_socket
    coord=node(nt,'ShaderNodeTexCoord');coord.object=o
    sep=node(nt,'ShaderNodeSeparateXYZ');nt.links.new(coord.outputs['Object'],sep.inputs[0])
    mask=node(nt,'ShaderNodeMapRange');mask.clamp=True
    mask.inputs['From Min'].default_value=-.0605;mask.inputs['From Max'].default_value=-.0575
    mask.inputs['To Min'].default_value=1;mask.inputs['To Max'].default_value=0
    nt.links.new(sep.outputs['Y'],mask.inputs['Value'])
    bs=node(nt,'ShaderNodeBsdfPrincipled',**{'Base Color':(.18,.21,.25,1),'Roughness':.5})
    camera_fill(nt,bs,(.14,.16,.19),2.2)
    mix=node(nt,'ShaderNodeMixShader');nt.links.new(mask.outputs[0],mix.inputs[0]);nt.links.new(original,mix.inputs[1]);nt.links.new(bs.outputs[0],mix.inputs[2]);nt.links.new(mix.outputs[0],out.inputs['Surface'])
    m['eye_fix_version']=VERSION


def apply(scene, theme):
    if theme not in ('day','white','blue','dark','night'):raise ValueError(theme)
    missing=[n for n in PARTS.values() if n not in scene.objects]
    if missing:raise ValueError('Missing eye geometry: '+str(missing))
    for kind,name in PARTS.items():
        o=scene.objects[name]
        prior=o.material_slots[0].material if o.material_slots else None
        native=(theme in ('white','dark') and kind in ('ring','lens') and prior is not None and prior.use_nodes
                and not any(n.type in ('TEX_IMAGE','UVMAP','ATTRIBUTE') for n in prior.node_tree.nodes))
        if native and prior is not None and prior.get('eye_fix_preserved_native'):
            m=prior
        elif native and prior is not None and not prior.name.startswith('EYE-FIX-'):
            # These incoming themes already retain the clean early hardware.
            # Own a private copy without changing its approved optical shading.
            m=prior.copy();m.name='EYE-FIX-'+theme+'-'+kind
            m['eye_fix_version']=VERSION;m['eye_fix_preserved_native']=True
        else:
            m=material(theme,kind)
        for i in range(len(o.data.materials)):o.data.materials[i]=m
        if not o.data.materials:o.data.materials.append(m)
        # Photo3 also has OBJECT-linked overrides; data slots alone do nothing.
        for slot in o.material_slots:slot.material=m
    shell_rim(scene, theme)
    scene['eye_fix_version']=VERSION;scene['eye_fix_theme']=theme
    return {'version':VERSION,'theme':theme,'parts':dict(PARTS)}


if __name__=='__main__':
    import argparse,sys
    p=argparse.ArgumentParser();p.add_argument('--theme',required=True);p.add_argument('--output',required=True)
    a=p.parse_args(sys.argv[sys.argv.index('--')+1:]);apply(bpy.context.scene,a.theme)
    bpy.ops.wm.save_as_mainfile(filepath=a.output)
