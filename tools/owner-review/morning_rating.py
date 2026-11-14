"""Local configured read-only intake of real overnight renders; never labels.

Each presentation has its own stable ID, not a guessed binding to producer trials.
Missing modes stay missing. Crop geometry must match real dimensions and receipts.
"""
import hashlib
import json
import re
from pathlib import Path
from collections import Counter
from catalog import Catalog, image_size
import meta_loop as ml

LANE = 'morning-review'
REGIONS = {'stone': [0,2250,2048,3072], 'greenery':[1450,180,2048,1490],
           'banner':[1740,530,2048,1320], 'optics':[1170,0,1710,1500],
           'rear':[0,1800,900,2700]}

def objects(value):
    if isinstance(value, dict):
        yield value
        for v in value.values(): yield from objects(v)
    elif isinstance(value,list):
        for v in value: yield from objects(v)

def geometry(path):
    size=image_size(path)
    if size == [2048,3072]: return size,[0,0,*size], 'Full-frame raster'
    choices=[path.with_suffix('.render.json'),path.with_suffix('.json')]
    choices+=sorted(path.parent.glob('*receipt.json')) + sorted(path.parent.glob('*render.json'))
    for f in dict.fromkeys(choices):
        if not f.is_file(): continue
        for r in objects(json.loads(f.read_text())):
            master=r.get('master') or r.get('canvas') or r.get('full_frame')
            box=r.get('box') or r.get('border') or r.get('pixel_box_top_left') or r.get('crop')
            if not isinstance(master,list) or not isinstance(box,list) or len(box)!=4: continue
            if all(type(x)==int for x in box) and size==[box[2]-box[0],box[3]-box[1]]:
                return master,box,str(f)
    raise ValueError('No matching crop receipt: '+str(path))

def discover(data):
    data=Path(data); config=data/'morning-watch.json'
    if not config.exists(): return []
    cfg=json.loads(config.read_text()); night=Path(cfg['night']); white=Path(cfg['white'])
    dirs=[]
    for d in (night/'integrated').glob('it*'):
        m=re.match(r'it(\d+)',d.name)
        if d.is_dir() and m and int(m[1])>=cfg['minimum_integration']: dirs.append((d,False))
    lanes=set(cfg['lanes'])
    for lane in list(lanes):
        root=night/lane
        if root.name.startswith('r') and root.parent.exists():
            lanes.update(str(x.relative_to(night)) for x in root.parent.glob('r*') if x.is_dir() and x.name[1:].isdigit() and int(x.name[1:])>=3)
    for lane in sorted(lanes):
        root=night/lane
        for d in root.iterdir() if root.exists() else []:
            if d.is_dir() and re.fullmatch(r'[A-Z](?:[0-9])?|BASE|CONTROL|TONE|INK|RELIEF|B-upper-only|A-fullcanvas-diagnostic|trial-[A-Z][0-9]?',d.name):
                dirs.append((d,False))
                for sub in ('full','integrated-provisional'):
                    if (d/sub).is_dir(): dirs.append((d/sub,False))
    dirs.extend((d,True) for d in white.glob('v*') if d.is_dir())
    rows=[]; warnings=[]
    for d,is_white in sorted(set(dirs)):
        target=cfg['white_target' if is_white else 'night_target']
        modes={}
        for mode in ('look','clear'):
            options=[d/(mode.upper()+'.png'),d/('coupon-'+mode.upper()+'.png'), d/(mode.upper()+'-rear.png')]
            if is_white and mode=='look': options += [d/'full.png',d/'capture.png']
            f=next((x for x in options if x.is_file()),None)
            if f: modes[mode]=f
        if not modes and not (is_white or d.name=='it17-greenery-trial'): continue
        rel=str(d.relative_to(white.parent if is_white else night))
        category=('white' if is_white else 'stone' if 'stone' in rel else 'greenery' if 'greenery' in rel else 'banner' if 'banner' in rel else 'optics' if 'optics' in rel else 'rear' if 'lhf' in rel or rel.endswith('it14') else 'integrated')
        groups={}; artifacts=[]
        for mode,f in modes.items():
            try:
                master,box,receipt=geometry(f)
            except ValueError:
                override=next((x for x in cfg.get('geometry_overrides',[]) if f.is_relative_to(Path(x['directory'])) and image_size(f)==[x['box'][2]-x['box'][0],x['box'][3]-x['box'][1]] and ml.digest(x['receipt'])==x['sha256']),None)
                if not override:
                    warnings.append(str(f)+': awaiting registered crop geometry')
                    continue
                master,box,receipt=override['master'],override['box'],override['receipt']
            artifacts.append(dict(path=str(f),sha256=ml.digest(f)))
            key=(tuple(master),tuple(box)); v=groups.setdefault(key,dict(target=target,master=master,box=box,receipt=receipt,region=category))
            v[mode]=str(f)
        if modes and not groups: continue
        views=list(groups.values())
        if not modes:
            views=[dict(target=target,master=[2048,3072],box=[0,0,2048,3072],receipt=str(d),region='unrendered')]
        # Native, source-bound detail views in addition to full frames.
        if not is_white:
            detail_names=list(REGIONS) if category=='integrated' else [category]
            for v in list(views):
                if v['box']==[0,0,2048,3072]:
                    for name in detail_names:
                        if name in REGIONS: views.append(dict(v,box=REGIONS[name],local_crop=REGIONS[name],region=name))
        else:
            for name,box in [('arch',[500,100,2000,1650]),('arch-pier',[1500,1150,2048,2380]),('plinth',[0,2300,2048,3072])]:
                views.append(dict(views[0],box=box,local_crop=box,region=name))
        trial='morning:'+('white/' if is_white else 'night/')+rel
        signature=hashlib.sha256(ml.json_text(artifacts).encode()).hexdigest()[:16]
        row=dict(event='meta_trial',schema_version=1,event_id=trial+':'+signature,trial_id=trial,
                 run_id='morning-2026-10-16',timestamp='2026-10-16T00:00:00+00:00',lane=LANE,parents=[],
                 element='white-scene' if is_white else 'night-'+category,defect_id='owner-review-intake',
                 hypothesis='Source-bound presentation: '+rel+'; read lane report for verdict. Not an owner decision.',
                 mechanism_class='unknown',parameters=dict(directory=str(d),views=views,category=category),
                 cost=dict(gpu_seconds=None,wall_seconds=None),artifacts=artifacts,metrics=dict(max_zoom_texel_density=None,crop_gate=None,sharpness=None),
                 self_review=dict(status='pending',notes='Catalog import only; no new visual judgment.'),
                 judge_verdicts=[],owner_reaction=dict(status='not_reviewed',receipt=None),status='completed' if modes else 'blocked',failure_class='none',
                 source=dict(evidence_only=True,kind='morning-catalog-import'))
        ml.validate_trial(row)
        rows.append(row)
    discover.warnings=warnings
    return rows

def extend_catalog(data,result,rows):
    builder=Catalog(data); builder.assets.update(result['assets'])
    result['candidates']=[c for c in result['candidates'] if not c.get('morning_intake')]
    for row in rows:
        if row['lane']!=LANE: continue
        views=[]
        for src in row['parameters']['views']:
            tw,th=image_size(src['target']); master=src['master']; box=src['box']
            target_box=[round(box[i]*[tw,th][i%2]/master[i%2]) for i in range(4)]
            v=dict(kind='native' if src.get('local_crop') else 'hero',region=src['region'],
                   target=builder.crop(src['target'],target_box,src['receipt']),full_frame=master,box=box,
                   receipt=src['receipt'],target_note='Registered source-resolution crop. No synthetic CLEAR or upscaled detail.')
            for mode in ('look','clear'):
                if src.get(mode): v[mode]=builder.crop(src[mode],src.get('local_crop'),src['receipt'])
            v['image']=v.get('look') or v.get('clear'); v['missing_modes']=[m for m in ('look','clear') if m not in v]
            views.append(v)
        category=row['parameters']['category']
        queue={'integrated':'stacks','stone':'stone','greenery':'banner-greenery','banner':'banner','optics':'optics','rear':'stacks','white':'white'}[category]
        builder.add(row,queue,Path(row['parameters']['directory']).relative_to(Path(json.loads((Path(data)/'morning-watch.json').read_text())['white']).parent if category=='white' else Path(json.loads((Path(data)/'morning-watch.json').read_text())['night'])).as_posix(),views)
        builder.candidates[-1].update(morning_intake=True,source_event_id=row['event_id'],source_directory=row['parameters']['directory'])
    result['candidates'].extend(builder.candidates); result['assets']=builder.assets
    result['counts']=dict(Counter(c['queue'] for c in result['candidates']))
    result['morning_intake_count']=len(builder.candidates)
    result['morning_warnings']=getattr(discover,'warnings',[])
    return result
