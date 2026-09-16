#!/usr/bin/env python3
"""Analyze captured pixels and independent pose telemetry without changing screenshots."""
import json
import math
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root = Path(sys.argv[1])
report = json.loads((root / 'report.json').read_text())
samples = report['visualSamples']
visual = []
ground_audits = []
failures = []
review_flags = []
spatial = []
if report.get('surfaceRequired') and (report.get('errors') or report.get('failedRequests') or report.get('failedHttpResponses')):
    failures.append({'reason': 'Final surface candidate has browser errors or failed asset requests.', 'errors': report.get('errors'), 'failedRequests': report.get('failedRequests'), 'failedHttpResponses': report.get('failedHttpResponses')})


def bounds_tuple(bounds):
    if not bounds:
        return None
    if isinstance(bounds, list):
        values = tuple(bounds) if len(bounds) == 4 else ()
    else:
        keys = ('left', 'top', 'right', 'bottom') if 'left' in bounds else ('l', 't', 'r', 'b')
        values = tuple(bounds.get(key) for key in keys)
    return values if len(values) == 4 and all(isinstance(value, (int, float)) and math.isfinite(value) for value in values) else None


def numeric_error(first, second):
    if isinstance(first, (int, float)) and isinstance(second, (int, float)):
        return abs(first - second)
    if isinstance(first, list) and isinstance(second, list) and len(first) == len(second):
        return max((numeric_error(a, b) for a, b in zip(first, second)), default=0)
    if isinstance(first, dict) and isinstance(second, dict) and first.keys() == second.keys():
        return max((numeric_error(first[key], second[key]) for key in first), default=0)
    return 0 if first == second else math.inf


for item in samples:
    pixels = np.array(Image.open(root / item['image']).convert('RGB'), dtype=np.float32)
    h, w = pixels.shape[:2]
    center = pixels[int(.18*h):int(.82*h), int(.12*w):int(.88*w)]
    std = float(center.std(axis=(0, 1)).mean())
    mean = pixels.mean(axis=(0, 1)).tolist()
    visual.append({'image': item['image'], 'theme': item['theme'], 'progress':item['progress'], 'centralStandardDeviation':std, 'meanRGB':mean})
    if std < 2:
        failures.append({'image':item['image'], 'reason':'Central viewport is nearly uniform; inspect for blank scene.'})
    state = item['state']
    audit = state.get('audit')
    set_audit = state.get('setAudit')
    if report.get('surfaceRequired'):
        surface_audit = (audit or {}).get('robotSurfaces', {})
        surface_meshes = surface_audit.get('meshes', [])
        if not surface_audit.get('complete'):
            failures.append({'image': item['image'], 'reason': 'Required robot surface audit was not prepared.'})
        if not surface_meshes:
            failures.append({'image': item['image'], 'reason': 'Required robot material surface patches are missing.'})
        expected_parts = report.get('robotSurfaceReference', {}).get('parts')
        if expected_parts and sorted(mesh['meshName'] for mesh in surface_meshes) != sorted(part['meshName'] for part in expected_parts):
            failures.append({'image': item['image'], 'reason': 'Applied material surfaces differ from the audited source part list.'})
        for mesh in surface_meshes:
            error = mesh.get('maxSurfaceDeviation')
            if not isinstance(error, (int, float)) or not math.isfinite(error):
                failures.append({'image': item['image'], 'reason': f'Robot surface patch {mesh.get("meshName")} is missing a finite previous-web surface comparison.'})
            for key in ['colorMap', 'roughnessMap', 'normalMap']:
                texture = mesh.get(key)
                expected_color_space = 'srgb' if key == 'colorMap' else ''
                if texture and texture.get('colorSpace') != expected_color_space:
                    failures.append({'image': item['image'], 'reason': f'Robot surface {mesh.get("meshName")} {key} has incorrect color space {texture.get("colorSpace")!r}.'})
        for key in ['colorMap', 'roughnessMap', 'normalMap']:
            if not any(mesh.get(key) and mesh[key].get('width', 0) > 0 and mesh[key].get('height', 0) > 0 for mesh in surface_meshes):
                failures.append({'image': item['image'], 'reason': f'No decoded robot surface {key} is present.'})
    if report.get('spatialRequired') and (not set_audit or not set_audit.get('groups')):
        failures.append({'image': item['image'], 'reason': 'Required actual-set audit is missing.'})
    if state.get('layout', {}).get('overflow'):
        failures.append({'image': item['image'], 'reason': 'Document overflows the mobile viewport.'})
    nav = [entry for entry in state.get('layout', {}).get('nav', []) if entry['opacity'] > .1]
    for index, entry in enumerate(nav):
        for rect in entry['rects']:
            if rect['right'] > w * .684 + 1:
                failures.append({'image': item['image'], 'reason': f'Navigation text {entry["text"]} leaves the left paper field.'})
            for other in nav[index + 1:]:
                if any(min(rect['right'], box['right']) - max(rect['left'], box['left']) > .5 and min(rect['bottom'], box['bottom']) - max(rect['top'], box['top']) > .5 for box in other['rects']):
                    failures.append({'image': item['image'], 'reason': f'Navigation text {entry["text"]} overlaps {other["text"]}.'})
    if not audit or len(audit.get('soles',[])) != 2:
        failures.append({'image':item['image'],'reason':'Independent audit does not contain exactly two soles.'})
    if audit and state.get('explode',1) < 1e-7 and state.get('jump',1) < 1e-7:
        for sole in audit.get('soles',[]):
            ground_audits.append({'image':item['image'], **sole})
            if abs(sole['minY']) > .0005:
                failures.append({'image':item['image'],'reason':f'Assembled sole {sole["name"]} is {sole["minY"]:.6f} m from ground.'})
            if 'tiltDegrees' not in sole:
                failures.append({'image':item['image'],'reason':'Independent sole-plane normal audit is unavailable.'})
            if sole.get('tiltDegrees',0) > .5:
                failures.append({'image':item['image'],'reason':f'Assembled sole {sole["name"]} tilt is {sole["tiltDegrees"]:.3f} degrees.'})
    if not state.get('rigLoaded'):
        failures.append({'image':item['image'], 'reason':'Rig not loaded.'})
    for key in ['progress', 'explode', 'jump', 'feetMinY']:
        value = state.get(key)
        if not isinstance(value, (int,float)) or not math.isfinite(value):
            failures.append({'image':item['image'], 'reason':f'Invalid {key}: {value}'})
    if set_audit:
        if not state.get('setReady'):
            failures.append({'image': item['image'], 'reason': 'Actual set is not ready.'})
        if state.get('progress', 0) <= .56 and state.get('explode', 0) > 1e-7:
            failures.append({'image': item['image'], 'reason': 'Explosion begins before touchdown.'})
        groups = set_audit.get('groups', [])
        if any(canvas['opacity'] < .999 for canvas in state.get('layout', {}).get('canvases', [])):
            failures.append({'image': item['image'], 'reason': 'Scene canvas or its ancestor fades instead of keeping the actual set visible.'})
        ids = [group.get('id') for group in groups]
        if None in ids or len(set(ids)) != len(ids):
            failures.append({'image': item['image'], 'reason': 'Set object IDs are missing or duplicated.'})
        for group in groups:
            if group.get('visible') is not True:
                failures.append({'image': item['image'], 'reason': f'Set group {group.get("name")} is hidden instead of leaving spatially.'})
            if report.get('shadowRequired') and group.get('name') in ['set_robot_plinth', 'set_floor'] and not group.get('shadowReceivingMeshCount', 0):
                failures.append({'image': item['image'], 'reason': f'Set group {group.get("name")} has no shadow receiver meshes.'})
            matrix = group.get('worldMatrix', [])
            if len(matrix) != 16 or not all(isinstance(value, (int, float)) and math.isfinite(value) for value in matrix):
                failures.append({'image': item['image'], 'reason': f'Invalid world matrix for {group.get("name")}.'})
            if not group.get('materialOpacities'):
                failures.append({'image': item['image'], 'reason': f'Missing material opacity audit for {group.get("name")}.'})
        support = (audit or {}).get('support', {})
        if (item['progress'] <= .30 or abs(item['progress'] - .56) < .0002) and state.get('jump', 0) <= 1e-5 and not support.get('contact'):
            failures.append({'image': item['image'], 'reason': 'Grounded duck lost contact with its support.'})
        duck = bounds_tuple((audit or {}).get('duckBounds', {}).get('projectedBounds'))
        layout = state.get('layout', {})
        if duck and layout:
            left, top, right, bottom = duck
            if left < 0 or top < 0 or right > 1 or bottom > 1:
                review_flags.append({'image': item['image'], 'reason': 'Duck projected bounds extend outside the canvas; inspect for clipped geometry.', 'projectedBounds': duck})
            canvas = set_audit.get('viewport', {'left': 0, 'top': 0, 'width': w, 'height': h})
            duck_pixels = (canvas['left'] + left * canvas['width'], canvas['top'] + top * canvas['height'], canvas['left'] + right * canvas['width'], canvas['top'] + bottom * canvas['height'])
            for heading in layout.get('headings', []):
                if heading['opacity'] < .1:
                    continue
                for rect in heading.get('rects', [heading]):
                    dx = min(duck_pixels[2], rect['right']) - max(duck_pixels[0], rect['left'])
                    dy = min(duck_pixels[3], rect['bottom']) - max(duck_pixels[1], rect['top'])
                    if dx > 2 and dy > 2:
                        review_flags.append({'image': item['image'], 'reason': 'Duck projected bounds intersect visible heading; inspect actual pixels.', 'heading': heading['text'], 'overlapPixels': [dx, dy]})
                    for prop in groups:
                        if prop['name'] not in ['set_orb_pedestal', 'set_square_frame', 'set_foliage', 'set_print']:
                            continue
                        prop_bounds = bounds_tuple(prop.get('projectedBounds'))
                        if not prop_bounds:
                            continue
                        l, t, r, b = prop_bounds
                        px = min(canvas['left'] + r * canvas['width'], rect['right']) - max(canvas['left'] + l * canvas['width'], rect['left'])
                        py = min(canvas['top'] + b * canvas['height'], rect['bottom']) - max(canvas['top'] + t * canvas['height'], rect['top'])
                        if px > 2 and py > 2:
                            review_flags.append({'image': item['image'], 'reason': 'Foreground set bounds intersect visible copy; inspect actual pixels.', 'group': prop['name'], 'heading': heading['text'], 'overlapPixels': [px, py]})
        spatial.append({'image': item['image'], 'theme': item['theme'], 'progress': item['progress'], 'phase': state.get('phase'), 'ids': ids, 'support': support, 'groupCount': len(groups)})

continuity = []
for theme in ['White','Blue','Dark','Small-White','Small-Blue','Small-Dark']:
    run = sorted([x for x in samples if x['theme'] == theme], key=lambda x:x['progress'])
    slopes = {key:[] for key in ['explode','jump']}
    for first, second in zip(run,run[1:]):
        dp = second['state']['progress'] - first['state']['progress']
        if dp <= 0:
            failures.append({'image':second['image'],'reason':'Forward progress did not advance.'})
            continue
        for key in slopes:
            slopes[key].append(abs(second['state'][key] - first['state'][key]) / dp)
    peaks = {key:max([x['state'][key] for x in run],default=0) for key in slopes}
    max_slope = {key:max(value,default=0) for key,value in slopes.items()}
    continuity.append({'theme':theme,'peaks':peaks,'maxSlopePerUnitProgress':max_slope})
    if run and not report.get('prototype') and any(peak < .95 for peak in peaks.values()):
        failures.append({'theme':theme,'reason':'An animation beat did not approach its peak.'})
    if any(value > 30 for value in max_slope.values()):
        failures.append({'theme':theme,'reason':'Abrupt normalized pose change above continuity guard.'})

reverse = []
forward = {round(x['progress'],5):x for x in samples if x['theme']=='White'}
for sample in [x for x in samples if x['theme']=='White-reverse']:
    match = forward.get(round(sample['progress'],5))
    if not match: continue
    a = np.array(Image.open(root/match['image']).convert('RGB'),dtype=np.int16)
    b = np.array(Image.open(root/sample['image']).convert('RGB'),dtype=np.int16)
    difference = np.abs(a-b)
    error = {key:abs(match['state'][key]-sample['state'][key]) for key in ['progress','explode','jump']}
    for key in ['audit', 'setAudit']:
        if match['state'].get(key) and sample['state'].get(key):
            delta = numeric_error(match['state'][key], sample['state'][key])
            error[key] = delta if math.isfinite(delta) else 'structure differs'
    reverse.append({'progress':sample['progress'],'meanAbsolutePixelDifference':float(difference.mean()),'fractionPixelsChangingOver8':float((difference.max(axis=2)>8).mean()),'stateError':error})
    if any(not isinstance(value, (int, float)) or value > .002 for value in error.values()):
        failures.append({'image':sample['image'],'reason':'Same progress has different pose on reverse traversal.'})

direct_seek = []
forward_states = {(sample['theme'], round(sample['progress'], 5)): sample for sample in samples}
for sample in report.get('directSeekSamples', []):
    match = forward_states.get((sample['theme'], round(sample['progress'], 5)))
    if not match:
        failures.append({'theme': sample['theme'], 'progress': sample['progress'], 'reason': 'Direct seek has no forward reference.'})
        continue
    errors = {key: numeric_error(match['state'].get(key), sample['state'].get(key)) for key in ['progress', 'explode', 'jump', 'audit', 'setAudit']}
    direct_seek.append({'theme': sample['theme'], 'progress': sample['progress'], 'stateError': {key: value if math.isfinite(value) else 'structure differs' for key, value in errors.items()}})
    if any(value > .002 for value in errors.values()):
        failures.append({'theme': sample['theme'], 'progress': sample['progress'], 'reason': 'Direct seek differs from sequential forward pose or set state.'})

reduced = [x for x in samples if x['theme']=='Reduced-Motion'] + report.get('reducedMotionSamples', [])
for sample in reduced:
    state = sample['state']
    expected_explode = 1 if state['progress'] >= .56 and state.get('setAudit') else 0
    if not state.get('reducedMotion') or abs(state['explode'] - expected_explode) > 1e-8 or abs(state['jump']) > 1e-8:
        failures.append({'image': sample.get('image'), 'progress': sample['progress'], 'reason': 'Reduced motion did not select the static assembled hero or static exploded final pose with no jump.'})
for exploded in [False, True]:
    group = [sample for sample in reduced if (sample['state']['explode'] > .5) == exploded and sample['state'].get('setAudit')]
    for first, second in zip(group, group[1:]):
        if numeric_error(first['state']['audit'], second['state']['audit']) > .00001 or numeric_error(first['state']['setAudit']['camera'], second['state']['setAudit']['camera']) > .00001:
            failures.append({'image': second.get('image'), 'progress': second['progress'], 'reason': 'Reduced-motion pose or camera interpolates within a static phase.'})

for sample in report.get('timelineSamples', []):
    state = sample['state']
    progress = state['progress']
    explode = state['explode']
    if progress < .56 and explode > 1e-8:
        failures.append({'progress': progress, 'reason': 'Explosion begins before the touchdown boundary.'})
    if .561 <= progress <= .64 and explode <= 0:
        failures.append({'progress': progress, 'reason': 'Explosion is still held after touchdown.'})

spatial_motion = []
for theme in ['White', 'Small-White', 'Blue', 'Small-Blue', 'Dark', 'Small-Dark']:
    run = sorted([sample for sample in samples if sample['theme'] == theme and sample['state'].get('setAudit')], key=lambda sample: sample['progress'])
    if not run:
        continue
    initial = {group['id']: group for group in run[0]['state']['setAudit']['groups']}
    for sample in run[1:]:
        current = {group['id']: group for group in sample['state']['setAudit']['groups']}
        if current.keys() != initial.keys():
            failures.append({'image': sample['image'], 'reason': 'Actual set object identity changed during scrolling.'})
            continue
        motion = []
        for group_id, group in current.items():
            original = initial[group_id]
            if numeric_error(original['materialOpacities'], group['materialOpacities']) > 1e-6:
                failures.append({'image': sample['image'], 'reason': f'Set opacity changed for {group.get("name")}; set exit must be spatial.'})
            first_bounds = bounds_tuple(original.get('projectedBounds'))
            current_bounds = bounds_tuple(group.get('projectedBounds'))
            if first_bounds and current_bounds:
                delta = [(current_bounds[0] + current_bounds[2] - first_bounds[0] - first_bounds[2]) / 2, (current_bounds[1] + current_bounds[3] - first_bounds[1] - first_bounds[3]) / 2]
                l, t, r, b = current_bounds
                motion.append({'name': group.get('name'), 'centerDisplacement': delta, 'outsideViewport': r < 0 or l > 1 or b < 0 or t > 1, 'frustumVisible': group.get('frustumVisible'), 'worldMatrixDelta': numeric_error(original['worldMatrix'], group['worldMatrix'])})
        spatial_motion.append({'image': sample['image'], 'progress': sample['progress'], 'groups': motion})
    final_motion = spatial_motion[-1]['groups']
    if final_motion and run[-1]['progress'] == 1:
        differential = max((math.dist(a['centerDisplacement'], b['centerDisplacement']) for a in final_motion for b in final_motion), default=0)
        if differential < .01:
            failures.append({'theme': theme, 'reason': 'Set objects do not show distinct projected motion.'})
        remaining = [group['name'] for group in final_motion if group['name'] != 'set_backdrop' and group['frustumVisible'] is not False]
        if remaining:
            failures.append({'theme': theme, 'reason': 'Final departure does not establish every scenic prop outside the camera frustum.', 'groups': remaining})

result = {'groundAudits':ground_audits,'pixelChecks':visual,'poseContinuity':continuity,'reverseComparisons':reverse,'directSeekComparisons':direct_seek,'spatialSamples':spatial,'spatialMotion':spatial_motion,'reviewFlags':review_flags,'failures':failures,'caveats':['Pixel variance catches full blank regions, not every missing component. All contact sheets also require visual inspection.','Pose slope guards detect abrupt changes; smooth derivatives and plausible motion still require authored-curve and visual review.','Geometry audit reports, where present, are captured separately from timing.','Projected bounding boxes flag possible heading intersections. Actual pixels must establish whether visible geometry touches text.']}
(root/'frame-analysis.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'samples':len(samples),'continuity':continuity,'reverse':reverse,'failures':failures},indent=2))
if failures: sys.exit(1)
