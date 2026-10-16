#!/usr/bin/env python3
"""Explicit private-to-public projection. Requires Pillow; inputs never copied.
Run --help. Source locations belong in the operator's local invocation, not here.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import hashlib
import io
import json
from pathlib import Path
import re
from PIL import Image, ImageOps

THEMES = ('day', 'white', 'blue', 'dark', 'night')
STATUSES = ('current', 'shipped', 'kept', 'rejected', 'candidate', 'unknown')
PHASES = (
    ('Shipped Git plate', 'Shipped Git plate'), ('Legacy', 'Early production'),
    ('Sep 16 calibration', 'Calibration'), ('Preserved worktree plate', 'Preserved plate'),
    ('Sep 16–26 cinematic', 'Cinematic studies'), ('night-mushroom', 'Mushroom studies'),
    ('day-plate-candidate', 'Day plate studies'), ('canonical-scenes', 'Canonical scenes'),
    ('match-run', 'Reference matching'), ('issue-41', 'Plate diagnosis'),
    ('overnight', 'Look development'), ('process/analysis', 'Material diagnosis'),
    ('Day dream-loop', 'Day dream-loop'), ('Theme port', 'Theme port'),
    ('dreamloop-runs/eye', 'Eye repair'), ('process/eye-fix', 'Eye repair'),
    ('process/head-rim', 'Head rim'), ('process/night-major', 'Night studies'),
    ('Night v2', 'Night v2'),
)

def public_row(row):
    """No copied free-form text: finite labels plus bounded numeric identifiers."""
    if row['theme'] not in THEMES or row['status'] not in STATUSES:
        raise ValueError('Unknown theme/status')
    if not re.fullmatch(r'v\d+', row['version']) or not re.fullmatch(r'[a-f0-9]{64}', row['hash']):
        raise ValueError('Invalid identifier')
    date = datetime.fromisoformat(row['date'])
    if not date.tzinfo: raise ValueError('Date must be timezone aware')
    sources = {'file mtime': 'file mtime (not a creation receipt)', 'git commit (committer date)': 'Git committer date'}
    source = row['date_source']
    if source.startswith('ledger citation: '): source = 'ledger citation'
    elif source in sources: source = sources[source]
    else: raise ValueError('Unclassified date source')
    phase = next((label for prefix, label in PHASES if row['phase'].startswith(prefix)), None)
    if not phase: raise ValueError('Unclassified phase')
    rounds = re.findall(r'(?<![a-z0-9])(r\d+|it\d+)(?![a-z0-9])', row['phase'])
    caption = row['theme'].title() + ' · ' + (rounds[0] if rounds else phase)
    return dict(theme=row['theme'], version=row['version'], date=date.isoformat(), dateSource=source,
                phase=phase, status=row['status'], hash=row['hash'][:16], caption=caption)

def encode_image(path, output):
    # Decode one bounded job at a time: old masters can be 201MP.
    Image.MAX_IMAGE_PIXELS = 300_000_000
    with Image.open(path) as source:
        source.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
        image = ImageOps.exif_transpose(source).convert('RGB')
    result = {}
    for label, size, quality in [('small', 288, 66), ('large', 576, 70), ('medium', 1024, 79)]:
        resized = image.copy()
        resized.thumbnail((size, size), Image.Resampling.LANCZOS)
        stream = io.BytesIO()
        resized.save(stream, 'WEBP', quality=quality, method=5)  # No EXIF, ICC or text metadata.
        data = stream.getvalue()
        key = hashlib.sha256(data).hexdigest()[:24] + '.webp'
        destination = output / key
        if not destination.exists(): destination.write_bytes(data)
        result[label] = [key, resized.width, resized.height, len(data)]
    return result

def build(args):
    history = json.loads(args.history.read_text())
    current_bytes = args.current.read_bytes()
    if hashlib.sha256(current_bytes).hexdigest() != history['current_sha256']:
        raise ValueError('CURRENT changed: rediscover history first')
    current = json.loads(current_bytes)
    if set(current) != set(THEMES): raise ValueError('Five current themes required')
    rows = history['entries']
    counts = {theme: sum(row['theme'] == theme for row in rows) for theme in THEMES}
    if counts != history['counts']: raise ValueError('Count mismatch')
    entries = [public_row(row) for row in rows]
    if len({(r['theme'], r['version']) for r in entries}) != len(rows): raise ValueError('Duplicate version')
    references = json.loads(args.references.read_text())
    if set(references) != set(THEMES): raise ValueError('Five references required')
    args.assets.mkdir(parents=True, exist_ok=True)
    paths = list(dict.fromkeys([row['path'] for row in rows] + [current[t]['capture'] for t in THEMES] + list(references.values())))
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        images = dict(zip(paths, pool.map(lambda path: encode_image(path, args.assets), paths)))
    for entry, raw in zip(entries, rows): entry['thumbs'] = images[raw['path']]
    selections = {}
    refs = {}
    for theme in THEMES:
        matches = [i for i, r in enumerate(rows) if r['theme'] == theme and any(o['path'] == current[theme]['capture'] for o in r['occurrences'])]
        if len(matches) != 1: raise ValueError('Ambiguous current selection')
        selections[theme] = {**entries[matches[0]], 'thumbs': images[current[theme]['capture']]}
        refs[theme] = dict(theme=theme, version='reference', caption=f'{theme.title()} · locked reference', thumbs=images[references[theme]])
    data = dict(schema=1, snapshot=history['generated_at'], counts=counts, entries=entries, current=selections, references=refs)
    encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode()
    digest = hashlib.sha256(encoded).hexdigest()[:16]
    args.public.mkdir(parents=True, exist_ok=True)
    name = f'history-v1.{digest}.json'
    (args.public / name).write_bytes(encoded)
    thumb_keys = {image[size][0]: image[size][3] for image in images.values() for size in ('small','large')}
    medium_keys = {image['medium'][0]: image['medium'][3] for image in images.values()}
    receipt = dict(schema=1, dataset=name, sha256=hashlib.sha256(encoded).hexdigest(), versions=len(entries),
                   counts=counts, datasetBytes=len(encoded), thumbnailBytes=sum(thumb_keys.values()),
                   mediumBytes=sum(medium_keys.values()), imageFiles=len(set(thumb_keys)|set(medium_keys)))
    if receipt['thumbnailBytes'] > 25_000_000: raise ValueError('Thumbnail budget exceeded')
    (args.public / 'manifest.json').write_text(json.dumps(receipt, indent=2)+'\n')
    args.content.parent.mkdir(parents=True, exist_ok=True)
    args.content.write_text(json.dumps({**receipt, 'current':selections,'references':refs}, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(receipt, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for flag in ('history', 'current', 'references', 'assets'):
        parser.add_argument('--'+flag, type=Path, required=True)
    parser.add_argument('--public', type=Path, default=Path('public/lineage'))
    parser.add_argument('--content', type=Path, default=Path('content/lineage.json'))
    parser.add_argument('--workers', type=int, default=1)
    build(parser.parse_args())
