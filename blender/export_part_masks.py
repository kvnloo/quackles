"""CPU-only, read-only locked-scene object-index export.
Run with /usr/bin/python blender/export_part_masks.py [--theme day].
Requires system OpenImageIO, numpy and Pillow; Blender never saves the donor.
The mask resolution follows the shipped home base plate, not its detail pyramid.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
RUNS = Path('/mnt/zer0models/project-artifacts/quackles/dreamloop-runs')
SCENES = {'day': RUNS / 'day-2026-10-01/.dream-loop/locked/print-r101/scene-wide-gpt.blend'}
SCENES.update({t: RUNS / f'themes-port-2026-10-13/{t}-sync-r101' / ('B/scene.blend' if t == 'night' else 'scene.blend') for t in ['white', 'blue', 'dark', 'night']})
LABELS = ['Robot head', 'Robot body', 'Robot legs / feet', 'Eye', 'Plinth', 'Step + print', 'Labels', 'Sphere', 'Ball ledge', 'Grey block', 'Rear blocks', 'Arch', 'Poster wall', 'Background']

def part_id(name):
    n = name.lower()
    if '__' in n:
        if any(s in n for s in ['__lens.', '__noenoeil.', '__m12_lens_holder.']): return 4
        if n.startswith(('jaw_soft__', 'neck_pitch__', 'yaw_roll_motion__')): return 1
        if n.startswith(('trunk_base__', 'neck__')): return 2
        return 3
    if 'flat ' in n or 'plinth maker' in n or 'plinth statement' in n: return 7
    if n == 'hero limestone': return 5
    if any(s in n for s in ['solid cobalt slab', 'hands', 'tread', 'creation print', 'cobalt frame']): return 6
    if n == 'cobalt optical glass': return 8
    if n == 'orb limestone': return 9
    if 'front grey block' in n: return 10
    if any(s in n for s in ['rear', 'pier strip', 'architectural edge']): return 11
    if 'arch' in n and 'shadow former' not in n: return 12
    if n in ['classical print', 'banner through top edge']: return 13
    return 14

def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()

def render(theme, output):
    import bpy
    scene_path = SCENES[theme]
    before = sha(scene_path)
    bpy.ops.wm.open_mainfile(filepath=str(scene_path))
    s = bpy.context.scene
    manifest = json.loads((ROOT / 'public/preview-scene/sequence/manifest.json').read_text())
    plate = next(v for v in manifest['frames'][0]['assets'][theme] if 'url' in v)
    camera = {'matrix': [list(row) for row in s.camera.matrix_world], 'type': s.camera.data.type, 'lens': s.camera.data.lens, 'sensor_width': s.camera.data.sensor_width, 'shift_x': s.camera.data.shift_x, 'shift_y': s.camera.data.shift_y, 'ortho_scale': s.camera.data.ortho_scale}
    groups = {i + 1: [] for i in range(len(LABELS))}
    for obj in s.objects:
        if obj.type in {'MESH', 'CURVE', 'FONT', 'SURFACE', 'META'} and not obj.hide_render:
            obj.pass_index = part_id(obj.name)
            groups[obj.pass_index].append(obj.name)
    s.render.engine = 'CYCLES'
    s.cycles.device = 'CPU'
    s.cycles.samples = 1
    s.cycles.use_denoising = False
    s.render.threads_mode = 'FIXED'
    s.render.threads = 6
    s.render.resolution_x, s.render.resolution_y = plate['width'], plate['height']
    s.render.resolution_percentage = 100
    s.render.use_border = False
    s.render.use_compositing = False
    s.render.use_sequencer = False
    s.render.use_motion_blur = False
    mat = bpy.data.materials.new('Editor index override (unsaved)')
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    emit = mat.node_tree.nodes.new('ShaderNodeEmission')
    emit.inputs['Color'].default_value = (0, 0, 0, 1)
    out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emit.outputs[0], out.inputs['Surface'])
    layer = bpy.context.view_layer
    layer.material_override = mat
    layer.use_pass_object_index = True
    s.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
    s.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    s.render.image_settings.color_depth = '32'
    s.render.filepath = str(output / f'{theme}.exr')
    bpy.ops.render.render(write_still=True)
    assert sha(scene_path) == before, 'Donor blend changed'
    record = {'version': 1, 'theme': theme, 'width': plate['width'], 'height': plate['height'], 'mask': 'mask.png', 'plate': '/preview-scene/sequence/' + plate['url'], 'plateSha256': sha(ROOT / 'public/preview-scene/sequence' / plate['url']), 'scene': str(scene_path), 'sceneSha256': before, 'camera': camera, 'method': 'Cycles CPU Object Index, one sample, opaque material override; no camera/geometry mutation', 'alignment': 'Locked r101 camera; shipped cinematic-proof-v2 is an earlier beauty, not a new r101 plate. Geometry/material differences remain documented; no plate replacement.', 'parts': [{'id': i, 'label': LABELS[i-1], 'objects': names} for i, names in groups.items()]}
    (output / f'{theme}.json').write_text(json.dumps(record, indent=2))

def convert(theme, scratch):
    import OpenImageIO as oiio
    import numpy as np
    from PIL import Image
    inp = oiio.ImageInput.open(str(scratch / f'{theme}.exr'))
    found = None
    sub = 0
    while inp.seek_subimage(sub, 0):
        spec = inp.spec()
        for i, name in enumerate(spec.channelnames):
            if 'IndexOB' in name or 'Object Index' in name:
                found = np.rint(inp.read_image()[:, :, i]).astype(np.uint8)
                break
        if found is not None: break
        sub += 1
    inp.close()
    if found is None: raise RuntimeError('Object Index pass missing')
    # World rays (0) are background; all selectable IDs come from Blender visibility.
    found[found == 0] = 14
    record = json.loads((scratch / f'{theme}.json').read_text())
    for part in record['parts']:
        ys, xs = np.where(found == part['id'])
        part['pixels'] = len(xs)
        part['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()-xs.min()+1), int(ys.max()-ys.min()+1)] if len(xs) else None
    dest = ROOT / 'public/editor' / theme
    dest.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(found, mode='P')
    im.putpalette([c for i in range(256) for c in (i, i, i)])
    im.save(dest / 'mask.png', optimize=True)
    record['maskSha256'] = sha(dest / 'mask.png')
    (dest / 'parts.json').write_text(json.dumps(record, indent=2) + '\n')
    print(json.dumps({'theme': theme, 'parts': len(record['parts']), 'visible': sum(p['pixels'] > 0 for p in record['parts']), 'bytes': (dest / 'mask.png').stat().st_size}))

if __name__ == '__main__':
    if '--blender-stage' in sys.argv:
        i = sys.argv.index('--blender-stage')
        render(sys.argv[i+1], Path(sys.argv[i+2]))
    else:
        parser = argparse.ArgumentParser(description=__doc__)
        parser.add_argument('--theme', choices=SCENES)
        args = parser.parse_args()
        scratch = Path(os.environ.get('TMPDIR', str(Path.home() / '.hermes/profiles/clean/cache/scratch'))) / 'quackles-part-masks'
        scratch.mkdir(parents=True, exist_ok=True)
        for theme in ([args.theme] if args.theme else SCENES):
            subprocess.run(['blender', '--background', '--factory-startup', '--python', str(Path(__file__).resolve()), '--', '--blender-stage', theme, str(scratch)], env={'HOME': os.environ['HOME'], 'PATH': '/usr/bin:/bin'}, check=True)
            convert(theme, scratch)
