"""Private, local-first P1 extension of owner-review. Never promotes a render."""
from __future__ import annotations
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import secrets
import sqlite3
import threading
from typing import Protocol
import meta_loop as ml
from owner_rating import atomic_json


def digest(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def append_exact(path, row, key='event_id'):
    """Caller owns the process and flock locks. Crash retries are idempotent."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.read_bytes() if path.exists() else b''
    if raw and not raw.endswith(b'\n'):
        raise ValueError('Incomplete JSONL tail: '+str(path))
    rows = [json.loads(line) for line in raw.splitlines()]
    existing = next((r for r in rows if r.get(key) == row[key]), None)
    if existing is not None:
        if existing != row:
            raise ValueError('Conflicting export identifier')
        return
    encoded = (json.dumps(row, ensure_ascii=False, allow_nan=False)+'\n').encode()
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    try:
        if os.write(fd, encoded) != len(encoded):
            raise OSError('Incomplete append; retain request id')
        os.fsync(fd)
    finally:
        os.close(fd)
    if not any(json.loads(line) == row for line in path.read_bytes().splitlines()):
        raise OSError('Export readback failed')


class ReplyProvider(Protocol):
    def send(self, note: dict) -> dict: ...


class QueueProvider:
    def __init__(self, data):
        self.data = Path(data)

    def send(self, note):
        append_exact(self.data/'inbox.jsonl', note, 'id')
        return {'provider':'queue', 'status':'queued', 'note_id':note['id']}


class HermesApiProvider:
    """P2 interface only. No network/key lookup until explicitly implemented."""
    endpoint = 'http://127.0.0.1:8642/v1/responses'
    conversation = 'quackles-portal'
    key_environment = 'HERMES_API_KEY'

    def send(self, note):
        raise RuntimeError('Hermes bridge disabled in P1; use queue provider')


class PortalApp:
    def __init__(self, process, data=None, export_data=None):
        self.process = Path(process).resolve()
        self.data = Path(data or self.process/'portal/data').resolve()
        self.export_data = Path(export_data or self.process/'meta-loop').resolve()
        repo = Path(__file__).resolve().parents[2]
        for target in (self.data, self.export_data):
            if target == repo or repo in target.parents:
                raise ValueError('Private data must live outside the code repository')
        self.data.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.data.chmod(0o700)
        self.export_data.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.token = secrets.token_urlsafe(32)
        self.db = self.data/'portal.sqlite3'
        self.provider = QueueProvider(self.data)
        self.assets = {}
        self.hash_cache = {}
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, request TEXT NOT NULL, payload TEXT NOT NULL)')
            db.execute('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
        self.db.chmod(0o600)
        with self.lock:
            self.flush()

    from contextlib import contextmanager

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db, timeout=30)
        try:
            db.execute('PRAGMA synchronous=FULL')
            with db:
                yield db
        finally:
            db.close()

    def config(self):
        p = self.process/'portal/config.json'
        return json.loads(p.read_text()) if p.exists() else {'references':{}, 'decisions':[]}

    def records(self):
        with self.connect() as db:
            return [json.loads(r[0]) for r in db.execute('SELECT payload FROM events ORDER BY rowid')]

    def asset(self, path, label, round_name):
        path = Path(path).resolve()
        if not path.is_file() or path.suffix.lower() not in ('.png','.jpg','.jpeg','.webp'):
            return None
        stat = path.stat()
        key = (str(path), stat.st_mtime_ns, stat.st_size, stat.st_ctime_ns)
        sha = self.hash_cache.get(key)
        if sha is None:
            sha = digest(path)
            self.hash_cache[key] = sha
        aid = hashlib.sha256(str(path).encode()).hexdigest()[:24]+'-'+sha[:16]
        from datetime import datetime, timezone
        item = dict(id=aid, path=str(path), sha256=sha, mtime=datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(), mtime_ns=stat.st_mtime_ns, size=stat.st_size, label=label, round=round_name, url='/image/'+aid)
        self.assets[aid] = item
        return item

    def scenes(self):
        current = json.loads((self.process/'review-5-scenes/CURRENT.json').read_text())
        config = self.config()
        out = []
        for name in ('night','white','day','blue','dark'):
            if name not in current:
                continue
            row = current[name]
            image = self.asset(row['capture'], 'CURRENT', row['round'])
            layers = []
            reference = config.get('references',{}).get(name)
            if reference:
                layers.append(self.asset(reference, 'REFERENCE', 'reference'))
            # Previous means the most recent differing CURRENT snapshot, not an inferred winner.
            for backup in sorted((self.process/'review-5-scenes').glob('CURRENT.before-*.json'), key=lambda p:p.stat().st_mtime_ns, reverse=True):
                try:
                    previous = json.loads(backup.read_text()).get(name,{})
                    if previous.get('capture') and previous['capture'] != row['capture']:
                        layer = self.asset(previous['capture'], 'PREVIOUS', previous.get('round','unknown'))
                        if layer:
                            layers.append(layer)
                            break
                except (ValueError, OSError):
                    continue
            if image:
                layers.append(image)
                clear = Path(row['capture']).with_name('CLEAR.png')
                look = Path(row['capture']).with_name('LOOK.png')
                for p, label in ((look,'LOOK'), (clear,'CLEAR')):
                    if p != Path(row['capture']) and p.is_file():
                        layers.append(self.asset(p, label, row['round']))
            out.append(dict(id=name, round=row['round'], notes=row.get('notes',''), pending='pending owner' in row.get('notes','').lower(), candidate=image, layers=[x for x in layers if x]))
        return out

    def state(self):
        with self.lock:
            scenes = self.scenes()
            rows = self.records()
            rules = [r['rule'] for r in rows if r.get('rule')]
            with self.connect() as db:
                visit = db.execute("SELECT value FROM settings WHERE key='visit'").fetchone()
            since = visit[0] if visit else None
            return dict(token=self.token, scenes=scenes, notes=rows, rules=rules, decisions=self.config().get('decisions',[]), last_visit=since, provider='queue', generated_at=ml.now(), results=[s['id'] for s in scenes if s['candidate'] and (since is None or s['candidate']['mtime'] > since)])

    def submit(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Expected object')
        request = json.dumps(payload, sort_keys=True, allow_nan=False)
        event_id = payload.get('id','')
        if not isinstance(event_id,str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}',event_id):
            raise ValueError('Invalid request id')
        with self.lock, (self.data/'portal.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with self.connect() as db:
                previous = db.execute('SELECT request,payload FROM events WHERE id=?',(event_id,)).fetchone()
                if previous:
                    if previous[0] != request:
                        raise ValueError('Request ID reused with different content')
                    record = json.loads(previous[1])
                else:
                    record = self.validate_note(payload)
                    db.execute('INSERT INTO events VALUES (?,?,?)',(event_id,request,json.dumps(record,allow_nan=False)))
            self.flush()
            return dict(saved=True, record=record)

    def validate_note(self, payload):
        scene = next((s for s in self.scenes() if s['id']==payload.get('scene')),None)
        if not scene or not scene['candidate']:
            raise ValueError('Scene has no current image')
        candidate = payload.get('candidate',{})
        if candidate.get('id') != scene['candidate']['id'] or candidate.get('sha256') != scene['candidate']['sha256']:
            raise ValueError('Candidate changed; refresh and reconfirm your note')
        if payload.get('kind') in ('decision','pick','directive'):
            kind = payload['kind']
            if kind == 'decision':
                decision = next((d for d in self.config().get('decisions',[]) if d['id']==payload.get('decision_id') and d['scene']==scene['id']),None)
                if not decision or payload.get('answer') not in decision['options']:
                    raise ValueError('Unknown decision option')
                text = decision['question']+' — '+payload['answer']
            elif kind == 'pick':
                if payload.get('answer') not in ('keep','revert','talk'):
                    raise ValueError('Invalid pick response')
                text = 'Agent pick: '+payload['answer']+' (request only; no promotion)'
            else:
                prior = next((r for r in self.records() if r['id']==payload.get('note_id') and r['scene']==scene['id']),None)
                if not prior or payload.get('answer') not in ('open','attempted','fixed','owner confirmed'):
                    raise ValueError('Unknown directive/status')
                text = 'Directive '+prior['id']+': '+payload['answer']
            return dict(payload, candidate=scene['candidate'], timestamp=ml.now(), status='recorded', provider='queue', text=text, element='scene', attribute=kind)
        if payload.get('kind') != 'note':
            raise ValueError('Unsupported note kind')
        text = payload.get('text')
        if not isinstance(text,str) or not 0 < len(text.strip()) <= 12000:
            raise ValueError('A note is required (maximum 12000 characters)')
        for key in ('element','attribute','direction'):
            if not isinstance(payload.get(key),str) or not 0 < len(payload[key].strip()) <= 1000:
                raise ValueError('Missing structured field: '+key)
        if payload.get('severity') not in ('low','medium','high') or payload.get('scope') not in ('scene','element','region'):
            raise ValueError('Invalid severity/scope')
        if payload.get('policy') not in ('match','ignore-reference','lock','prefer'):
            raise ValueError('Invalid rule policy')
        region = payload.get('region')
        if region is not None:
            keys = ('x','y') if region.get('type')=='point' else ('x','y','w','h') if region.get('type')=='box' else ()
            if not keys or any(type(region.get(k)) not in (float,int) or not math.isfinite(region[k]) or not 0 <= region[k] <= 1 for k in keys):
                raise ValueError('Region must be normalized image coordinates')
            if region.get('type')=='box' and (region['x']+region['w']>1.000001 or region['y']+region['h']>1.000001):
                raise ValueError('Region extends beyond image')
        if payload['scope']=='region' and not region:
            raise ValueError('Pin a region first')
        zoom = payload.get('zoom',{})
        if any(type(zoom.get(k)) not in (float,int) or not math.isfinite(zoom[k]) for k in ('scale','x','y')) or not 1<=zoom['scale']<=16:
            raise ValueError('Invalid zoom')
        record = dict(payload, candidate=scene['candidate'], timestamp=ml.now(), status='open', provider='queue')
        if payload.get('always'):
            record['rule'] = dict(id='rule-'+payload['id'], scope=payload['scope'], scene=scene['id'], element=payload['element'], region=region if payload['scope']=='region' else None, policy=payload['policy'], text=text, source_note_id=payload['id'], date=record['timestamp'])
        return record

    def owner_event(self, row):
        return dict(event='owner_label', schema_version=1, event_id='portal-'+row['id'], trial_id=None, element=row['scene']+'-'+row['element'], verdict='lock' if row.get('rule',{}).get('policy')=='lock' else 'direction', stars=None, pairwise=None, note=row['text'], timestamp=row['timestamp'], source='owner-ui', status='confirmed', scope='element', aspect=row['attribute'], portal=dict(version=1, note_id=row['id'], candidate_id=row['candidate']['id'], sha256=row['candidate']['sha256'], region=row.get('region'), kind=row['kind'], receipt=str(self.db)))

    def history(self):
        raw = json.loads((self.process/'review-5-scenes/history.json').read_text())
        entries = []
        self.history_paths = {}
        for row in raw.get('entries',[]):
            if not row.get('path') or not Path(row['path']).is_file():
                continue
            key = row['id']
            self.history_paths[key] = row
            entries.append({k:row.get(k) for k in ('id','theme','version','date','phase','status','hash')})
        return {'entries':entries, 'declared':len(raw.get('entries',[])), 'available':len(entries)}

    def history_layer(self, key):
        if not hasattr(self,'history_paths'):
            self.history()
        row = self.history_paths.get(key)
        if not row:
            raise ValueError('Unknown history entry')
        return self.asset(row['path'], 'HISTORY '+row['version'], row['phase'])

    def image_bytes(self, aid, query):
        from io import BytesIO
        from PIL import Image
        item = self.assets.get(aid)
        if not item:
            raise ValueError('Unknown image')
        stat = Path(item['path']).stat()
        if stat.st_mtime_ns != item['mtime_ns'] or stat.st_size != item['size']:
            raise ValueError('Image changed; refresh metadata')
        box = None
        if 'box' in query:
            box = [float(v) for v in query['box'][0].split(',')]
            if len(box)!=4 or any(not math.isfinite(v) or not 0<=v<=1 for v in box) or box[0]+box[2]>1.000001 or box[1]+box[3]>1.000001 or min(box[2:])<=0:
                raise ValueError('Invalid normalized crop')
        width = min(1600,max(64,int(query.get('width',['1024'])[0])))
        cache_key = hashlib.sha256(json.dumps([item['sha256'],width,box]).encode()).hexdigest()
        cache = self.data/'previews'/ (cache_key+'.jpg')
        if cache.exists():
            return cache.read_bytes()
        cache.parent.mkdir(exist_ok=True, mode=0o700)
        # Native crops preserve source pixels, capped to 4 MP to bound responses.
        with Image.open(item['path']) as image:
            if box:
                w,h = image.size
                rect = (round(box[0]*w), round(box[1]*h), round((box[0]+box[2])*w), round((box[1]+box[3])*h))
                if (rect[2]-rect[0])*(rect[3]-rect[1]) > 4_000_000:
                    raise ValueError('Native crop exceeds 4 MP; select a smaller region')
                image = image.crop(rect)
            else:
                image.draft('RGB',(width,width*2))
                image.thumbnail((width,width*2))
            image = image.convert('RGB')
            out = BytesIO()
            image.save(out, format='JPEG', quality=92)
        pixels = out.getvalue()
        temporary = cache.with_suffix('.'+secrets.token_hex(5)+'.tmp')
        temporary.write_bytes(pixels)
        os.replace(temporary,cache)
        return pixels

    def visit(self):
        stamp = ml.now()
        with self.lock, self.connect() as db:
            db.execute("INSERT OR REPLACE INTO settings VALUES ('visit',?)",(stamp,))
        return {'saved':True,'timestamp':stamp}

    def flush(self):
        rows = self.records()
        with (self.export_data/'owner-rating.lock').open('a') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX)
            for row in rows:
                label = self.owner_event(row)
                ml.validate_owner_label(label,{})
                append_exact(self.export_data/'events/owner.jsonl',label)
                self.provider.send(row)
        rules = [r['rule'] for r in rows if r.get('rule')]
        atomic_json(self.data/'rules.json',rules)
        original = self.process/'OWNER-PREFERENCES.md'
        text = original.read_text() if original.exists() else ''
        text += '\n\n## Generated portal rules (review before merging)\n'
        text += '\n'.join('- '+json.dumps(r,ensure_ascii=False) for r in rules)+'\n'
        temporary = self.data/'OWNER-PREFERENCES.portal.tmp'
        temporary.write_text(text)
        os.replace(temporary,self.data/'OWNER-PREFERENCES.portal.md')
