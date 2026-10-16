#!/usr/bin/env python3
"""Loopback-only, stdlib owner review server. No browser or renderer is launched."""
from __future__ import annotations
import argparse
import fcntl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
import os
from pathlib import Path
import re
import secrets
import threading
import time
from urllib.parse import urlsplit
import meta_loop as ml
from catalog import asset_content


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.'+secrets.token_hex(6)+'.tmp')
    try:
        with temporary.open('x') as f:
            json.dump(value, f, indent=2, allow_nan=False)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


class RatingApp:
    def __init__(self, data):
        self.data = Path(data).resolve()
        self.token = secrets.token_urlsafe(32)
        self.lock = threading.RLock()
        self.catalog = json.loads((self.data/'rating-catalog.json').read_text())
        self.watch_start = time.monotonic()
        self.next_poll = self.watch_start
        self.poll_status: dict = dict(active=True, interval_seconds=900, duration_seconds=14400,
                                last_checked=None, error=None)

    def poll(self, now=None):
        """The server owns one bounded poller, serialized with all label writes."""
        now = time.monotonic() if now is None else now
        if now > self.watch_start + self.poll_status['duration_seconds']:
            with self.lock:
                if self.poll_status['active']:
                    self.poll_status['active'] = False
                    atomic_json(self.data/'rating-poll.json', self.poll_status)
            return False
        if now < self.next_poll:
            return False
        self.next_poll = now + self.poll_status['interval_seconds']
        from live_rating import LANES, lane_rows, build_catalog
        with self.lock, (self.data/'owner-rating.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            try:
                incoming = lane_rows(self.data)
                old = json.loads((self.data/'ledger.json').read_text())
                ids = {r['trial_id']:r for r in old}
                for row in incoming:
                    if row['trial_id'] in ids and ids[row['trial_id']]['lane'] != row['lane']:
                        raise ValueError('Cross-lane ownership conflict')
                catalog = build_catalog(self.data, self.catalog, incoming)
                labels, errors = ml.read_jsonl(self.data/'events/owner.jsonl')
                if errors:
                    raise ValueError('; '.join(errors))
                rows = [r for r in old if r['lane'] not in LANES] + incoming
                rows, errors = ml.apply_owner_labels(rows, labels, self.data/'events/owner.jsonl')
                if errors:
                    raise ValueError('; '.join(errors))
                # Match normal ingestion integrity checks without rehashing unrelated history.
                ml.verify_artifacts([r for r in rows if r['lane'] in LANES])
                atomic_json(self.data/'ledger.json', rows)
                intake = self.data/'ingest.json'
                if intake.exists():
                    errors += json.loads(intake.read_text()).get('errors', [])
                ml.publish_materialized(self.data, rows, errors)
                atomic_json(self.data/'rating-catalog.json', catalog)
                self.catalog = catalog
                self.poll_status.update(last_checked=ml.now(), error=None,
                                        candidates=len(catalog['candidates']))
                atomic_json(self.data/'rating-poll.json', self.poll_status)
                return True
            except Exception as exc:
                self.poll_status.update(last_checked=ml.now(), error=str(exc))
                atomic_json(self.data/'rating-poll.json', self.poll_status)
                return False

    def state(self):
        with self.lock:
            labels, errors = ml.read_jsonl(self.data/'events/owner.jsonl')
            return dict(**self.catalog, token=self.token, labels=labels, errors=errors, polling=self.poll_status)

    def submit(self, payload):
        if not isinstance(payload, dict):
            raise ValueError('Expected a JSON object')
        with self.lock:
            # A separate process also respects this lock: never interleave records.
            lockfile = self.data/'owner-rating.lock'
            with lockfile.open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                return self._submit_locked(payload)

    def _submit_locked(self, payload):
        rows = json.loads((self.data/'ledger.json').read_text())
        trials = {r['trial_id']: r for r in rows}
        event_id = payload.get('event_id')
        if not isinstance(event_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', event_id):
            raise ValueError('event_id must be a 1..100 character request identifier')
        path = self.data/'events/owner.jsonl'
        existing, errors = ml.read_jsonl(path)
        if errors:
            raise ValueError('; '.join(errors))
        confirmation = payload.get('confirmed_from')
        source = None
        if confirmation is not None:
            source = next((e for e in existing if isinstance(e, dict) and e.get('event_id') == confirmation
                           and e.get('source') == 'chat-backfill'), None)
            if source is None:
                raise ValueError('Unknown chat receipt')
            ml.validate_owner_label(source, trials)
            for key in ('trial_id', 'element', 'scope', 'aspect'):
                if payload.get(key) != source[key]:
                    raise ValueError('Confirmation must preserve source '+key)
        unbound = source is not None and source['trial_id'] is None
        if payload.get('judged_on') not in ('look', 'clear', 'both') and not (source is not None and payload.get('judged_on') is None):
            raise ValueError('judged_on must be look, clear or both')
        candidate = next((c for c in self.catalog['candidates'] if c['trial_id']==payload.get('trial_id')), None)
        if candidate and payload.get('judged_on') is not None:
            available = {m for v in candidate['views'] for m in ('look','clear') if v.get(m)}
            required = {'look','clear'} if payload['judged_on']=='both' else {payload['judged_on']}
            if available and not required <= available:
                raise ValueError('Requested judging mode unavailable for this candidate')
        label = {k: payload.get(k) for k in ('event_id', 'trial_id', 'element', 'verdict', 'stars', 'pairwise', 'judged_on')}
        label.update(event='owner_label', schema_version=1, timestamp=ml.now(),
                     source='owner-ui', status='confirmed', note=payload.get('note', ''),
                     scope=payload.get('scope', 'trial'), aspect=payload.get('aspect', 'overall'))
        if source is not None:
            label.update({k:source[k] for k in ('quote', 'source_receipt', 'mapping_confidence',
                          'mapping_evidence', 'scope', 'aspect', 'defect_id')})
            label.update(confirmed_from=source['event_id'], source_timestamp=source['timestamp'])
            if source.get('pairwise') is not None:
                label['source_pairwise'] = source['pairwise']
                if 'pairwise' not in payload:
                    label['pairwise'] = source['pairwise']
        if unbound or (source is not None and payload.get('judged_on') is None):
            label.pop('judged_on', None)
        history_id = payload.get('history_id')
        if history_id and source is not None:
            raise ValueError('Choose one source receipt')
        if history_id:
            history = next((h for h in self.catalog['history'] if h['id'] == history_id), None)
            if not history:
                raise ValueError('Unknown history receipt')
            label.update(history_id=history_id, historical_quote=history['quote'],
                         historical_evidence=history['evidence'], historical_timestamp=history['date'])
            # These quotes can be component feedback, not whole-scene approval.
            label['scope'] = 'component'
            label['scope_note'] = history.get('scope') or 'Historical feedback; no whole-trial acceptance inferred'
        ml.validate_owner_label(label, trials)
        previous = next((e for e in existing if e['event_id'] == event_id), None)
        if previous:
            if {k:v for k,v in previous.items() if k != 'timestamp'} != {k:v for k,v in label.items() if k != 'timestamp'}:
                raise ValueError('Request ID reused with different contents')
            label = previous
        else:
            encoded = (ml.json_text(label)+'\n').encode()
            path.parent.mkdir(parents=True, exist_ok=True)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
            try:
                # One append syscall under flock, then durable flush.
                if os.write(fd, encoded) != len(encoded):
                    raise OSError('Incomplete append; repair final line before retry')
                os.fsync(fd)
            finally:
                os.close(fd)
            existing.append(label)
        # Read back the exact persisted event before reporting a successful save.
        persisted, issues = ml.read_jsonl(path)
        if issues or not any(e == label for e in persisted):
            raise OSError('Owner event read-back failed')
        rows, errors = ml.apply_owner_labels(rows, persisted, path)
        # Only touched trial needs fresh integrity hashing in this low-latency path.
        # Full CLI ingest still rebuilds from all producer events and checks all files.
        ml.verify_artifacts([r for r in rows if r['trial_id'] == label['trial_id']])
        intake = self.data/'ingest.json'
        if intake.exists():
            errors += json.loads(intake.read_text()).get('errors', [])
        atomic_json(self.data/'ledger.json', rows)
        ml.publish_materialized(self.data, rows, errors)
        payoffs = json.loads((self.data/'payoffs.json').read_text())
        safe = ''.join(c if c.isalnum() or c in '-_' else '_' for c in label['element'])
        recommendation = json.loads((self.data/('next-'+safe+'.json')).read_text())
        atomic_json(self.data/'owner-refresh.json', dict(timestamp=ml.now(), event_id=event_id,
                    confirmed_labels=len(persisted), errors=errors))
        return dict(saved=True, event=label, next=recommendation,
                    payoffs=payoffs.get(label['element'], {}), errors=errors)


def make_server(app, port=43220, watch=False):
    class Server(ThreadingHTTPServer):
        def service_actions(self):
            if watch:
                app.poll()

    class Handler(BaseHTTPRequestHandler):
        def allowed(self):
            return self.headers.get('Host') == f'127.0.0.1:{server.server_port}'

        def respond(self, status, body, content_type='application/json'):
            if not isinstance(body, bytes):
                body = json.dumps(body, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.allowed():
                return self.respond(403, {'error': 'Loopback Host required'})
            path = urlsplit(self.path).path
            if path == '/api/state':
                return self.respond(200, app.state())
            if path == '/health':
                return self.respond(200, {'ok': True, 'service': 'owner-rating', 'data': str(app.data), 'polling': app.poll_status})
            if path.startswith('/assets/'):
                asset = app.catalog['assets'].get(path.removeprefix('/assets/'))
                if not asset:
                    return self.respond(404, {'error': 'Unknown asset'})
                file = Path(asset['path'])
                if file.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.webp') or not file.is_file():
                    return self.respond(404, {'error': 'Missing image'})
                try:
                    pixels, kind = asset_content(asset)
                except ValueError as exc:
                    return self.respond(409, {'error': str(exc)})
                return self.respond(200, pixels, kind)
            files = {'/': 'owner-rating.html', '/app.js': 'owner-rating.js', '/app.css': 'owner-rating.css'}
            if path in files:
                file = Path(__file__).with_name(files[path])
                return self.respond(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or 'text/plain')
            self.respond(404, {'error': 'Not found'})

        def do_POST(self):
            origin = f'http://127.0.0.1:{server.server_port}'
            if (not self.allowed() or self.headers.get('Origin', origin) != origin
                    or self.headers.get('X-Owner-Token') != app.token):
                return self.respond(403, {'error': 'Same-origin owner token required'})
            if self.path != '/api/label':
                return self.respond(404, {'error': 'Not found'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length <= 65536 or self.headers.get_content_type() != 'application/json':
                    raise ValueError('JSON request required, maximum 64 KiB')
                self.connection.settimeout(10)
                payload = json.loads(self.rfile.read(length))
                result = app.submit(payload)
            except (ValueError, KeyError, TypeError) as exc:
                return self.respond(400, {'error': str(exc)})
            except Exception as exc:
                # A post-write refresh failure must not invite a new request ID.
                return self.respond(500, {'error': str(exc), 'retry_same_event_id': True})
            self.respond(200, result)
    server = Server(('127.0.0.1', port), Handler)
    return server


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, default=ml.DEFAULT_DATA)
    parser.add_argument('--port', type=int, default=43220)
    parser.add_argument('--no-watch', dest='watch', action='store_false', help='Serve the existing catalog without polling producer lanes')
    args = parser.parse_args()
    app = RatingApp(args.data)
    app.poll_status['active'] = args.watch
    server = make_server(app, args.port, watch=args.watch)
    if args.watch:
        app.poll()
    print(json.dumps({'url': f'http://127.0.0.1:{server.server_port}/', 'pid': os.getpid()}), flush=True)
    try:
        server.serve_forever()
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
