#!/usr/bin/env python3
"""Receipt-bound live lane catalog. Reads producer events; never creates labels."""
from collections import Counter
import copy
import json
from pathlib import Path
import re
import os
from catalog import Catalog, image_size
import meta_loop as ml

LANES = ('stone-mosaic', 'optics', 'banner-greenery')


def lane_rows(data):
    events = []
    for lane in LANES:
        path = Path(data)/'events'/(lane+'.jsonl')
        rows, errors = ml.read_jsonl(path)
        if errors:
            raise ValueError('; '.join(errors))
        for line, row in enumerate(rows, 1):
            event = ml.adapt_lane(row, path, line)
            if event['lane'] != lane:
                raise ValueError('Unexpected lane in '+str(path))
            events.append(event)
    rows, errors = ml.materialize(events)
    if errors:
        raise ValueError('; '.join(errors))
    return rows


def render_metadata(row, path):
    metrics = row.get('metrics', {})
    renders = metrics.get('renders', []) + metrics.get('receipt', {}).get('renders', [])
    meta = next((r for r in renders if r.get('path') == str(path)), {})
    if not meta:
        # Benchmark timings may live in metrics while the original render retains
        # a separately hash-bound receipt. Never substitute the benchmark image.
        receipt = path.parent/'receipt.json'
        bound = next((a for a in row['artifacts'] if a['path']==str(receipt)), None)
        if bound and receipt.is_file() and ml.digest(receipt)==bound.get('sha256'):
            saved = json.loads(receipt.read_text())
            meta = next((r for r in saved.get('renders', []) if r.get('path')==str(path)), {})
            meta = dict(meta, mode=saved.get('mode'))
    sidecar = path.with_suffix('.render.json')
    if sidecar.is_file():
        meta = {**json.loads(sidecar.read_text()), **meta}
    return meta


def build_catalog(data, catalog, rows):
    data = Path(data)
    night = Path(os.environ.get('OWNER_REVIEW_ARTIFACTS') or data.parent/'night-v2').expanduser()
    result = copy.deepcopy(catalog)
    builder = Catalog(data)
    builder.assets.update(result['assets'])
    target_receipt = night/'banner-generator/target-statistics.json'
    if not target_receipt.is_file():
        return result
    target = Path(json.loads(target_receipt.read_text())['target'])
    target_size = image_size(target)
    look_path = night/'optics/LOOK.json'
    result['look_settings'] = dict(path=str(look_path), sha256=ml.digest(look_path),
        **json.loads(look_path.read_text())) if look_path.exists() else None
    measurement = night/'stone-mosaic/measurements.json'
    front = json.loads(measurement.read_text())['regions']['front']['box'] if measurement.exists() else None
    result['candidates'] = [c for c in result['candidates'] if c.get('queue') not in LANES]
    warnings = []
    # Only image artifacts explicitly bound to the latest materialized event qualify.
    checked = {}
    def verified(a):
        path = Path(a['path'])
        if path.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or not path.is_file():
            return False
        if not path.resolve().is_relative_to(night.resolve()):
            return False
        if str(path) not in checked:
            checked[str(path)] = ml.digest(path)
        return bool(a.get('sha256')) and checked[str(path)] == a['sha256']

    clear_controls = {}
    for row in rows:
        if row['lane'] == 'optics' and row.get('metrics', {}).get('mode') == 'CLEAR':
            for a in row['artifacts']:
                if verified(a):
                    clear_controls[tuple(image_size(a['path']))] = (a, row)

    for row in rows:
        lane = row['lane']
        if lane not in LANES or row.get('status') != 'completed' or row.get('source', {}).get('evidence_only'):
            continue
        groups = {}
        artifacts = list(row['artifacts'])
        # Optics variants explicitly share their independently rendered CLEAR control.
        if lane == 'optics' and row.get('metrics', {}).get('mode') == 'LOOK':
            for a in row['artifacts']:
                if verified(a):
                    control = clear_controls.get(tuple(image_size(a['path'])))
                    if control and row['metrics'].get('source_sha256') == control[1]['metrics'].get('source_sha256'):
                        artifacts.append(control[0])
        for artifact in artifacts:
            path = Path(artifact['path'])
            if not verified(artifact):
                if path.suffix.lower() == '.png':
                    warnings.append(row['trial_id']+': unavailable or hash-drifted '+str(path))
                continue
            meta = render_metadata(row, path)
            name = path.stem.lower()
            if name == 'mask' or 'probe' in str(path) or 'failed' in name:
                continue
            mode = ('look' if 'look' in name else 'clear' if 'clear' in name or path.parent.name.upper().startswith('CLEAR') else
                    ('look' if meta['look'] else 'clear') if 'look' in meta else
                    str(meta.get('mode') or row.get('metrics', {}).get('mode')).lower() if meta.get('mode') or row.get('metrics', {}).get('mode') else
                    ('look' if meta['dof'] else 'clear') if 'dof' in meta else '')
            if mode not in ('look', 'clear'):
                continue
            # A shared optics control has its own render receipt, not LOOK metadata.
            if lane == 'optics' and mode == 'clear' and not meta:
                receipt = path.parent/'receipt.json'
                if receipt.is_file():
                    meta = next((r for r in json.loads(receipt.read_text()).get('renders', []) if r.get('path') == str(path)), {})
            master = meta.get('master') or meta.get('full_frame')
            box = meta.get('box') or meta.get('border')
            if not master:
                warnings.append(row['trial_id']+': no render geometry receipt for '+str(path))
                continue
            if not box:
                box = [0, 0, *master]
            size = image_size(path)
            if size != [box[2]-box[0], box[3]-box[1]]:
                warnings.append(row['trial_id']+': crop geometry mismatch '+str(path))
                continue
            density = re.match(r'(201mp|1gp)-(.+?)(?:-(?:look|clear))?$', name)
            kind = density[1] if density else 'hero'
            region = density[2] if density else ('banner' if lane == 'banner-greenery' else 'full')
            if region == 'front':
                region = 'plinth front face'
            specs: list = [(kind, region, box, None)]
            if lane == 'stone-mosaic' and not density and front:
                crop = [round(front[i]*master[i % 2]/target_size[i % 2]) for i in range(4)]
                if crop[0] >= box[0] and crop[1] >= box[1] and crop[2] <= box[2] and crop[3] <= box[3]:
                    local = [crop[i]-box[i % 2] for i in range(4)]
                    specs.insert(0, ('hero', 'plinth front face', crop, local))
            for k, r, crop, local in specs:
                group_key = (k, r, tuple(master), tuple(crop))
                if group_key not in groups:
                    target_box = [round(crop[i]*target_size[i % 2]/master[i % 2]) for i in range(4)]
                    groups[group_key] = dict(kind=k, region=r, target=builder.crop(target, target_box, target_receipt),
                        target_note='Source-resolution TARGET crop; LOOK/CLEAR are separate rendered evidence, not a blur filter.',
                        full_frame=master, box=crop, optics={})
                view = groups[group_key]
                view[mode] = builder.crop(path, local, row['event_id']) if local else builder.asset(path, row['event_id'])
                view['optics'][mode] = meta.get('optics') or row.get('metrics', {}).get('settings') or {'receipt':str(path.with_suffix('.render.json'))}
        views = list(groups.values())
        if not views:
            continue
        views.sort(key=lambda v:(v['region'] != 'plinth front face', v['kind'] != 'hero', v['kind'], v['region']))
        for view in views:
            view['image'] = view.get('look') or view.get('clear')
            view['missing_modes'] = [m for m in ('look', 'clear') if not view.get(m)]
        builder.add(row, lane, row['trial_id'], views)
        builder.candidates[-1]['default_view'] = {k:views[0][k] for k in ('kind','region')}
        builder.candidates[-1]['source_event_id'] = row['event_id']
    result['candidates'].extend(builder.candidates)
    result.update(assets=builder.assets, counts=dict(Counter(c['queue'] for c in result['candidates'])),
                  generated_at=ml.now(), live_warnings=warnings)
    return result
