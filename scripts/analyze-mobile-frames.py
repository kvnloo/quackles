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
    if run and any(peak < .95 for peak in peaks.values()):
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
    reverse.append({'progress':sample['progress'],'meanAbsolutePixelDifference':float(difference.mean()),'fractionPixelsChangingOver8':float((difference.max(axis=2)>8).mean()),'stateError':error})
    if any(value > .002 for value in error.values()):
        failures.append({'image':sample['image'],'reason':'Same progress has different pose on reverse traversal.'})

reduced = [x for x in samples if x['theme']=='Reduced-Motion']
for sample in reduced:
    if not sample['state'].get('reducedMotion') or abs(sample['state']['explode']) > 1e-8 or abs(sample['state']['jump']) > 1e-8:
        failures.append({'image':sample['image'],'reason':'Reduced-motion setting did not suppress explode/jump.'})

result = {'groundAudits':ground_audits,'pixelChecks':visual,'poseContinuity':continuity,'reverseComparisons':reverse,'failures':failures,'caveats':['Pixel variance catches full blank regions, not every missing component. All contact sheets also require visual inspection.','Pose slope guards detect abrupt changes; smooth derivatives and plausible motion still require authored-curve and visual review.','Geometry audit reports, where present, are captured separately from timing.']}
(root/'frame-analysis.json').write_text(json.dumps(result,indent=2))
print(json.dumps({'samples':len(samples),'continuity':continuity,'reverse':reverse,'failures':failures},indent=2))
if failures: sys.exit(1)
