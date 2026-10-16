"""Deterministic, dependency-free learning corpus. Raw inputs are never copied."""
import re
import json
import hashlib
import sqlite3
from pathlib import Path
from contextlib import closing
from collections import Counter

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE sources(id TEXT PRIMARY KEY, label TEXT NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL);
CREATE TABLE scenes(id TEXT PRIMARY KEY);
CREATE TABLE methods(id TEXT PRIMARY KEY, label TEXT NOT NULL, definition TEXT NOT NULL);
CREATE TABLE nodes(id TEXT PRIMARY KEY, scene_id TEXT NOT NULL REFERENCES scenes, kind TEXT NOT NULL, title TEXT NOT NULL, outcome TEXT NOT NULL, date TEXT, date_basis TEXT, method_id TEXT NOT NULL REFERENCES methods, source_id TEXT NOT NULL REFERENCES sources);
CREATE TABLE edges(parent_id TEXT REFERENCES nodes, child_id TEXT REFERENCES nodes, relation TEXT NOT NULL, PRIMARY KEY(parent_id,child_id,relation), CHECK(parent_id<>child_id));
CREATE TABLE artifacts(hash TEXT PRIMARY KEY, kind TEXT NOT NULL);
CREATE TABLE node_artifacts(node_id TEXT REFERENCES nodes, artifact_hash TEXT REFERENCES artifacts, PRIMARY KEY(node_id,artifact_hash));
CREATE TABLE judgments(id TEXT PRIMARY KEY, node_id TEXT REFERENCES nodes, setup TEXT NOT NULL, outcome TEXT NOT NULL, excerpt TEXT NOT NULL, source_id TEXT REFERENCES sources);
CREATE TABLE owner_labels(id TEXT PRIMARY KEY, node_id TEXT REFERENCES nodes, element TEXT NOT NULL, outcome TEXT NOT NULL, excerpt TEXT NOT NULL, source_id TEXT REFERENCES sources);
CREATE TABLE prompts(id TEXT PRIMARY KEY, node_id TEXT REFERENCES nodes, kind TEXT NOT NULL, text_excerpt TEXT NOT NULL, hash TEXT NOT NULL, source_id TEXT REFERENCES sources);
CREATE TABLE lessons(id TEXT PRIMARY KEY, claim TEXT NOT NULL, evidence_ids TEXT NOT NULL);
CREATE TABLE analyses(id TEXT PRIMARY KEY, payload TEXT NOT NULL, source_id TEXT REFERENCES sources);
CREATE TABLE change_classes(node_id TEXT REFERENCES nodes, class TEXT NOT NULL, basis TEXT NOT NULL, PRIMARY KEY(node_id,class));
CREATE INDEX nodes_scene_outcome ON nodes(scene_id,outcome);
CREATE INDEX nodes_method ON nodes(method_id,outcome);
CREATE INDEX nodes_date ON nodes(date);
CREATE INDEX edges_child ON edges(child_id);
CREATE INDEX judgments_node ON judgments(node_id);
CREATE INDEX owner_node ON owner_labels(node_id);
CREATE INDEX prompts_node ON prompts(node_id);
'''
METHODS = [
 ('unclassified','Not classified','No method is inferred from an artifact filename.'),
 ('conservative-review','Conservative review','Swapped blind preferences plus explicit non-regression; ties do not promote.'),
 ('geometry-fit','Constrained geometry','Fit visible geometry, prove visibility and preserve explicit owner locks.'),
 ('brief-first','Brief-first direction','Separate literal COPY constraints from adaptable INTENT.'),
 ('research-coupon','Research then coupon','Name the physical mechanism; test it on a small isolated render.'),
 ('material-audit','Effective material audit','Inspect effective shader graphs and object overrides, not just material names.'),
 ('baseline-control','Baseline control','Reproduce the baseline before crediting a new method.')
]

def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')) + '\n'

def digest(value):
    return hashlib.sha256(value if isinstance(value, bytes) else value.encode()).hexdigest()

def normalize_evals(raw, source_hash):
    """Only explicit attempt nodes; never turn image discovery into experiments."""
    attempts = {r['id']: r for r in raw if r['node_kind'] in ('attempt','component_attempt','integration_attempt')}
    if len(attempts) != sum(r['node_kind'] in ('attempt','component_attempt','integration_attempt') for r in raw):
        raise ValueError('duplicate eval id')
    public_id = lambda identifier: 'eval-' + digest(identifier)[:20]
    result = []
    for identifier, r in sorted(attempts.items()):
        status = r['status']
        if status.get('kept') is True and status.get('rejected') is True:
            raise ValueError('conflicting outcome')
        outcome = 'kept' if status.get('kept') is True else 'rejected' if status.get('rejected') is True else 'unknown'
        parent = r.get('parent_node')
        # Missing parents stay an explicit coverage gap, not an invented edge.
        row = {'id':public_id(identifier),'kind':'baseline-rejudge' if r.get('evaluation_role') == 'baseline_rejudge_not_new_attempt' else r['node_kind'].replace('_','-'),'scene':r['scene'] or 'unknown','title':scrub(r.get('hypothesis') or f"{r['scene']} / {identifier.rsplit('/',1)[-1]}",160),'outcome':outcome,'date':r.get('timestamp'),'date_basis':r.get('timestamp_basis'),'method':'unclassified','parents':[public_id(parent)] if parent in attempts else [],'unresolved_parent':bool(parent and parent not in attempts),'artifacts':[a['sha256'] for a in r.get('artifacts',[]) if a.get('sha256')], 'change_classes':r.get('change_class',[]),'source':{'id':'eval-rounds','label':'Discovery-tree evaluation ledger','hash':source_hash,'kind':'evaluation-ledger'},'judgments':[]}
        for j in r.get('judge_outcomes',[]):
            raw_j = j.get('raw',{})
            # Retain preference labels without guessing A/B identity.
            row['judgments'].append({'setup':canonical({'model':j.get('model'),'swapped':j.get('swapped'),'resolution':j.get('image_resolution_delivered')}).strip(),'outcome':str(raw_j.get('preference','unknown')),'excerpt':scrub(canonical({k:raw_j[k] for k in ['preference','candidate_regressions','passes_corrected_rule'] if k in raw_j}))})
        result.append(row)
    return result

def build_database(history, records, path, lessons=()):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)
    db = sqlite3.connect(path)
    try:
        db.executescript(SCHEMA)
        db.executemany('INSERT INTO methods VALUES (?,?,?)', METHODS)
        db.execute('INSERT INTO sources VALUES (?,?,?,?)', ('history','Deduplicated image history',digest(canonical(history)),'artifact-inventory'))
        ids = set()
        for entry in sorted(history['entries'], key=lambda row: row['id']):
            node = 'history-' + entry['id']
            if node in ids:
                raise ValueError('duplicate history id: '+node)
            ids.add(node)
            db.execute('INSERT OR IGNORE INTO scenes VALUES (?)', (entry['theme'],))
            db.execute('INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?)', (node,entry['theme'],'artifact-observation',scrub(entry['phase'],160),entry['status'],entry['date'],scrub(entry['date_source']),'unclassified','history'))
            hashes = {entry['hash']} | {o['hash'] for o in entry.get('occurrences',[]) if 'hash' in o}
            for sha in sorted(hashes):
                if not re.fullmatch('[a-f0-9]{64}',sha):
                    raise ValueError('invalid artifact hash')
                db.execute('INSERT OR IGNORE INTO artifacts VALUES (?,?)',(sha,'image'))
                db.execute('INSERT INTO node_artifacts VALUES (?,?)',(node,sha))
        for row in sorted(records, key=lambda row: row['id']):
            if row['id'] in ids:
                raise ValueError('duplicate attempt id: '+row['id'])
            ids.add(row['id'])
            source = row['source']
            db.execute('INSERT OR IGNORE INTO sources VALUES (?,?,?,?)',(source['id'],scrub(source['label']),source['hash'],source['kind']))
            db.execute('INSERT OR IGNORE INTO scenes VALUES (?)',(row['scene'],))
            db.execute('INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?)',(row['id'],row['scene'],row.get('kind','attempt'),scrub(row['title'],160),row['outcome'],row.get('date'),scrub(row.get('date_basis') or 'unknown'),row['method'],source['id']))
            for sha in sorted(set(row.get('artifacts', []))):
                if not re.fullmatch('[a-f0-9]{64}', sha):
                    raise ValueError('invalid artifact hash')
                db.execute('INSERT OR IGNORE INTO artifacts VALUES (?,?)',(sha,'image'))
                db.execute('INSERT INTO node_artifacts VALUES (?,?)',(row['id'],sha))
            for cls in sorted(set(row.get('change_classes', []))):
                db.execute('INSERT INTO change_classes VALUES (?,?,?)',(row['id'],scrub(cls,60),'keyword heuristic; not adjudicated'))
            for kind,table in [('judgments','judgments'),('owner_labels','owner_labels'),('prompts','prompts')]:
                for index, item in enumerate(row.get(kind,[])):
                    identifier = f"{row['id']}-{kind}-{index}"
                    excerpt = scrub(item['excerpt'])
                    if table == 'judgments':
                        db.execute('INSERT INTO judgments VALUES (?,?,?,?,?,?)',(identifier,row['id'],scrub(item['setup']),item['outcome'],excerpt,source['id']))
                    elif table == 'owner_labels':
                        db.execute('INSERT INTO owner_labels VALUES (?,?,?,?,?,?)',(identifier,row['id'],scrub(item['element']),item['outcome'],excerpt,source['id']))
                    else:
                        prompt_source = item.get('source',source)
                        db.execute('INSERT OR IGNORE INTO sources VALUES (?,?,?,?)',(prompt_source['id'],scrub(prompt_source['label']),prompt_source['hash'],prompt_source['kind']))
                        db.execute('INSERT INTO prompts VALUES (?,?,?,?,?,?)',(identifier,row['id'],item['kind'],excerpt,item.get('hash',digest(item['excerpt'])),prompt_source['id']))
        for row in records:
            for parent in row.get('parents',[]):
                db.execute('INSERT INTO edges VALUES (?,?,?)',(parent,row['id'],'explicit-parent'))
        for lesson in lessons:
            if not set(lesson['evidence']).issubset(ids):
                raise ValueError('orphan lesson evidence')
            db.execute('INSERT INTO lessons VALUES (?,?,?)',(lesson['id'],scrub(lesson['claim']),canonical(lesson['evidence']).strip()))
        assert not db.execute('PRAGMA foreign_key_check').fetchall()
        db.commit()
        db.execute('VACUUM')
    finally:
        db.close()

def aggregate(db):
    db.row_factory = sqlite3.Row
    query = lambda sql: [dict(row) for row in db.execute(sql)]
    methods = query("SELECT m.id,m.label,m.definition,COUNT(n.id) AS attempts,SUM(CASE WHEN n.outcome='kept' THEN 1 ELSE 0 END) AS kept,SUM(CASE WHEN n.outcome IN ('kept','rejected') THEN 1 ELSE 0 END) AS decided FROM methods m LEFT JOIN nodes n ON n.method_id=m.id AND n.kind IN ('attempt','component-attempt','integration-attempt') GROUP BY m.id ORDER BY m.id")
    for method in methods:
        method['keepRate'] = method['kept']/method['decided'] if method['decided'] else None
    return {
      'schemaVersion':1,
      'counts':{'observations':db.execute("SELECT count(*) FROM nodes WHERE kind='artifact-observation'").fetchone()[0], 'attempts':db.execute("SELECT count(*) FROM nodes WHERE kind IN ('attempt','component-attempt','integration-attempt')").fetchone()[0], 'artifacts':db.execute('SELECT count(*) FROM artifacts').fetchone()[0], 'scenes':db.execute('SELECT count(*) FROM scenes').fetchone()[0]},
      'scenes':query("SELECT scene_id AS id,COUNT(*) AS observations FROM nodes WHERE kind='artifact-observation' GROUP BY scene_id ORDER BY scene_id"),
      'outcomes':query("SELECT outcome,COUNT(*) AS count FROM nodes WHERE kind='artifact-observation' GROUP BY outcome ORDER BY outcome"),
      'methods':methods,
      'timeline':query("SELECT substr(date,1,10) AS date,COUNT(*) AS count FROM nodes WHERE kind='artifact-observation' GROUP BY substr(date,1,10) ORDER BY date"),
      'judgeOwnerAgreement':{'rate':None,'reason':'No matched, same-scope binary judge/owner cohort established. Preferences and owner locks are different labels.'},
      'iterationsToAcceptance':{'value':None,'reason':'Artifact order is not iteration count. Complete element-level parent chains are required.'},
      'plateauWaste':{'value':None,'reason':'No validated blocker-series or comparable per-attempt cost ledger; rejected work is not automatically waste.'},
      'limitations':['Image observations are not independent experiments.','Current, shipped, kept and owner-accepted are distinct.','Keep rates use only explicitly kept/rejected attempts, never unknowns.','Methods are a curated observational sample, not causal rankings.','File modification dates are inventory timestamps, not proven creation dates.','Scores from different judging contexts must not be joined into a progress curve.']
    }


def ingest_owner_metadata(db, labels, source_hash):
    db.execute('INSERT INTO sources VALUES (?,?,?,?)',('owner-labels','Bounded native owner-label corpus',source_hash,'native-owner-metadata'))
    known = {row[0] for row in db.execute('SELECT id FROM nodes')}
    for row in sorted(labels,key=lambda row:row['id']):
        bound = ['eval-'+digest(node)[:20] for node in row.get('linked_nodes',[])]
        targets = sorted({node for node in bound if node in known}) or [None]
        for index, node in enumerate(targets):
            # Multi-element feedback is not a binary acceptance label.
            db.execute('INSERT INTO owner_labels VALUES (?,?,?,?,?,?)',('owner-'+digest(row['id'])[:20]+f'-{index}',node,'scope requires source review','feedback-metadata','Quote withheld pending owner review; native feedback is not automatic acceptance.','owner-labels'))


def public_analysis(raw):
    """Allowlist aggregate fields, never owner messages or oracle/image bindings."""
    select = lambda row, keys: {key:row[key] for key in keys if key in row}
    result = select(raw,['primary_known_status_n','keep_by_change_class','change_class_note','keep_by_method','method_note'])
    result['paired_judge_consistency'] = select(raw.get('paired_judge_consistency',{}),['n','agree','rate','wilson95'])
    result['iterations_to_acceptance'] = [select(row,['element','start','accepted','numbered_attempt_span','right_censored']) for row in raw.get('iterations_to_acceptance',[])]
    result['plateau_replays'] = [select(row,['context','metric','accepted_only','n','stop_after','subsequent_attempts','subsequent_kept','saved_render_seconds','caveat']) for row in raw.get('plateau_replays',[])]
    calibration = raw.get('calibration',{})
    result['calibration'] = {**select(calibration,['planned','completed','valid']), 'setups':[select(row,['evidence','rubric','single','panel','all_votes','swapped_consistency']) for row in calibration.get('setups',[])]}
    result['caveats'] = ['Primary keep rates exclude baseline rejudge r03. Change classes overlap.','Bounded numbered-round spans omit subvariants; unaccepted elements are right-censored.','Plateau replays truncate an observed path and lose later kept rounds; they do not estimate causal cost savings.','Calibration uses three distinct owner-bound pairs; repeated votes are correlated. This does not establish historical judge-owner accuracy.']
    return result


def export(db, public, curation):
    public = Path(public)
    prior_manifest = public/'data/learning/manifest.json'
    previous = json.loads(prior_manifest.read_text())['files'] if prior_manifest.exists() else []
    db.row_factory = sqlite3.Row
    summary = aggregate(db)
    files = []
    def emit(relative, value, hashed=False):
        text = canonical(value) if not isinstance(value,str) else value
        sha = digest(text)
        if hashed:
            p = Path(relative)
            relative = str(p.with_name(p.stem+'.'+sha[:16]+p.suffix))
        dest = public/relative
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)
        files.append({'path':relative,'sha256':sha,'bytes':len(text.encode())})
        return relative
    analysis_row = db.execute("SELECT payload FROM analyses WHERE id='offline-evaluation'").fetchone()
    if analysis_row:
        summary['analysis'] = json.loads(analysis_row['payload'])
    summary_path = emit('data/learning/summary.json',summary,True)
    image_map = {r['id']:r.get('image') for r in curation['records']}
    records = []
    related = {}
    for table in ['judgments','prompts','owner_labels','node_artifacts','change_classes']:
        by_node = {}
        for row in db.execute(f'SELECT * FROM {table} ORDER BY node_id'):
            by_node.setdefault(row['node_id'],[]).append(dict(row))
        related[table] = by_node
    for row in db.execute('SELECT * FROM nodes ORDER BY id'):
        record = dict(row)
        for table in related:
            record[table] = related[table].get(row['id'],[])
        record['image'] = image_map.get(row['id'])
        records.append(record)
    explorer = [r for r in records if r['kind'] != 'artifact-observation']
    explorer_path = emit('data/learning/explorer.json',explorer,True)
    years = {}
    for record in records:
        year = record['date'][:4] if record['date'] else 'undated'
        years.setdefault(year,[]).append(record)
    for year, rows in sorted(years.items()):
        emit(f'data/learning/records-{year}.json',rows,True)
    sources = [dict(r) for r in db.execute('SELECT * FROM sources ORDER BY id')]
    emit('data/learning/sources.json',sources,True)
    emit('data/learning/edges.json',[dict(r) for r in db.execute('SELECT * FROM edges ORDER BY parent_id,child_id')],True)
    sections = ['# Quackles learning corpus\n\nA descriptive, source-backed production record. Not a controlled benchmark.\n', '\n'.join('- '+x for x in summary['limitations'])]
    for lesson in curation['lessons']:
        text = f"# {lesson['title']}\n\n{lesson['claim']}\n\nTension: {lesson['tension']}\n\nChange: {lesson['turn']}\n\nEvidence IDs: {', '.join(lesson['evidence'])}\n\nPrimary source: {lesson['source']['label']}\nSource SHA-256: {lesson['source']['hash']}\n"
        emit('learn/lessons/'+lesson['id']+'.md',text)
        sections.append(text)
    for method in summary['methods']:
        emit('learn/methods/'+method['id']+'.md',f"# {method['label']}\n\n{method['definition']}\n\nAttempts: {method['attempts']}. Explicitly decided: {method['decided']}. Kept: {method['kept']}.\nNot a causal ranking. Unclassified means missing evidence, not a failed method.\n")
    for scene in summary['scenes']:
        emit('learn/scenes/'+scene['id']+'.md',f"# {scene['id'].title()}\n\n{scene['observations']} deduplicated image observations. These are not iteration counts or approvals.\n")
    emit('learn/llms-full.txt','\n\n'.join(sections)+'\n\n## Aggregates\n\n'+canonical(summary))
    manifest = {'schemaVersion':1,'summary':summary_path,'explorer':explorer_path,'files':files,'counts':summary['counts'],'privacy':'Allowlisted normalized fields; raw transcripts excluded; only curated owner quotes published.','nullPolicy':'Missing evidence is null, never zero.','dataDictionary':{'artifact-observation':'Deduplicated image inventory entry, not an independent trial.','attempt':'Explicit evaluation-tree attempt.','case-study':'Source-backed process decision, excluded from attempt rates.','outcome':'kept/rejected only from explicit evidence; current is not acceptance.','date_basis':'Distinguishes file mtime from source-report and Git dates.'}}
    target = public/'data/learning/manifest.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(canonical(manifest))
    active = {f['path'] for f in files}
    for prior in previous:
        rel = prior['path']
        if rel not in active and rel.startswith('data/learning/') and '..' not in Path(rel).parts:
            (public/rel).unlink(missing_ok=True)
    return manifest


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history',type=Path,required=True)
    parser.add_argument('--evals',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path('data/learning/learning.sqlite'))
    parser.add_argument('--public',type=Path,default=Path('public'))
    args = parser.parse_args()
    history = json.loads(args.history.read_text())
    raw_bytes = (args.evals/'rounds.jsonl').read_bytes()
    raw = [json.loads(line) for line in raw_bytes.decode().splitlines() if line.strip()]
    records = {r['id']:r for r in normalize_evals(raw,digest(raw_bytes))}
    curation = json.loads(Path('data/learning/curation.json').read_text())
    for row in curation['records']:
        records[row['id']] = {**records.get(row['id'],{}),**row}
    build_database(history,list(records.values()),args.output,curation['lessons'])
    analysis_bytes = (args.evals/'analysis.json').read_bytes()
    owner_bytes = (args.evals/'owner_labels.jsonl').read_bytes()
    with closing(sqlite3.connect(args.output)) as db, db:
        db.execute('PRAGMA foreign_keys=ON')
        ingest_owner_metadata(db,[json.loads(line) for line in owner_bytes.decode().splitlines() if line.strip()],digest(owner_bytes))
        db.execute('INSERT INTO sources VALUES (?,?,?,?)',('offline-analysis','Offline evaluation analysis',digest(analysis_bytes),'derived-analysis'))
        db.execute('INSERT INTO analyses VALUES (?,?,?)',('offline-evaluation',canonical(public_analysis(json.loads(analysis_bytes))),'offline-analysis'))
        manifest = export(db,args.public,curation)
    print(canonical({'counts':manifest['counts'],'evalNodes':len(raw),'explicitAttempts':sum(r['node_kind']=='attempt' for r in raw),'unresolvedParents':sum(bool(r.get('unresolved_parent')) for r in records.values()),'databaseSha256':digest(args.output.read_bytes())}))


def scrub(text, limit=600):
    """Redact before clipping so partial secrets cannot survive an excerpt boundary."""
    text = str(text)
    patterns = [
        (r'-----BEGIN [\s\S]*?-----END [^-]+-----', '[secret]'),
        (r'(?i)\b(?:bearer\s+|(?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+', '[secret]'),
        (r'\b(?:sk-|gh[pousr]_|github_pat_)[A-Za-z0-9_-]+', '[secret]'),
        (r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b', '[email]'),
        (r'@session:[^\s]+', '[session]'),
        (r'(?i)\b[A-Z]:\\[^\s]+', '[path]'),
        (r'(?<![\w:])/(?:mnt|home|workspace|tmp|Users|root|var|opt|run|media)/[^\s`\"<>]+', '[path]'),
        (r'https?://(?:localhost|127\.0\.0\.1|192\.168\.\d+\.\d+)[^\s]+', '[local-url]'),
    ]
    for pattern, replacement in patterns:
        text = re.sub(pattern, replacement, text)
    return text[:limit]

if __name__ == '__main__':
    main()
