"""Run with python3 -m unittest discover -s scripts/learning -v."""
import unittest
import importlib.util
from pathlib import Path
from contextlib import closing

class PrivacyTest(unittest.TestCase):
    def test_scrubber_removes_private_material_before_excerpt(self):
        path = Path(__file__).with_name('pipeline.py')
        self.assertTrue(path.exists(), 'privacy pipeline is not implemented')
        spec = importlib.util.spec_from_file_location('pipeline', path)
        assert spec and spec.loader
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        for raw in ['token=private-value', 'person@example.com', '/home/private/file', 'Bearer secret-value']:
            self.assertNotEqual(module.scrub(raw),raw)
        self.assertEqual(module.scrub('token=private-value',limit=5),'[secr')

    def test_unbound_owner_metadata_never_publishes_raw_quotes(self):
        import pipeline, tempfile, sqlite3
        self.assertTrue(hasattr(pipeline,'ingest_owner_metadata'))
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/'db.sqlite'
            pipeline.build_database({'entries':[]},[],path)
            with closing(sqlite3.connect(path)) as db, db:
                pipeline.ingest_owner_metadata(db,[{'id':'owner:1','quote':'private words','scope':None,'linked_nodes':[],'decision_type':'feedback'}],'c'*64)
                row=db.execute('SELECT node_id,excerpt FROM owner_labels').fetchone()
                self.assertIsNone(row[0]); self.assertNotIn('private words',row[1])

    def test_analysis_export_excludes_private_rows(self):
        import pipeline
        self.assertTrue(hasattr(pipeline, 'public_analysis'), 'analysis projection missing')
        value = pipeline.public_analysis({'primary_known_status_n':2, 'paired_judge_consistency':{'n':2,'records':[{'source':'/private'}]}, 'iterations_to_acceptance':[{'element':'step','label':'owner:123','numbered_attempt_span':7}], 'keep_by_method':{}, 'keep_by_change_class':{}, 'plateau_replays':[], 'calibration':{}})
        self.assertNotIn('records',value['paired_judge_consistency'])
        self.assertNotIn('label',value['iterations_to_acceptance'][0])

    def test_export_hashes_and_rejects_orphans(self):
        import pipeline, tempfile, sqlite3, json
        self.assertTrue(hasattr(pipeline, 'export'), 'public export is missing')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            pipeline.build_database({'entries':[]}, [], root/'db.sqlite')
            with closing(sqlite3.connect(root/'db.sqlite')) as db, db:
                manifest = pipeline.export(db, root/'public', {'lessons':[], 'records':[]})
            for item in manifest['files']:
                self.assertEqual(pipeline.digest((root/'public'/item['path']).read_bytes()), item['sha256'])
            with self.assertRaises(ValueError):
                pipeline.build_database({'entries':[]}, [], root/'bad.sqlite', [{'id':'bad','claim':'bad','evidence':['missing']}])

    def test_eval_adapter_does_not_promote_unknown_or_guess_parents(self):
        import pipeline
        self.assertTrue(hasattr(pipeline, 'normalize_evals'), 'eval adapter is missing')
        raw = [{'id':'q:round/r1','scene':'day','node_kind':'attempt','parent_node':None,'hypothesis':'test','status':{'kept':None,'rejected':None},'sources':[], 'artifacts':[], 'change_class':['material']}]
        raw.append({**raw[0], 'id':'q:component/A', 'node_kind':'component_attempt'})
        rows = pipeline.normalize_evals(raw, 'b'*64)
        self.assertEqual(len(rows),2)
        self.assertEqual({r['kind'] for r in rows},{'attempt','component-attempt'})
        self.assertEqual(rows[0]['outcome'], 'unknown')
        self.assertEqual(rows[0]['parents'], [])
        self.assertNotIn('q:round', rows[0]['id'])

    def test_normalization_is_deterministic_and_keeps_unknowns_unknown(self):
        import pipeline
        import sqlite3
        import tempfile
        self.assertTrue(hasattr(pipeline, 'build_database'), 'database ingestion is not implemented')
        history = {'entries': [dict(id='day-v0', theme='day', hash='a'*64, status='current', phase='Review', date='2026-10-15', date_source='file mtime', occurrences=[])]}
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / 'test.sqlite'
            pipeline.build_database(history, [], db)
            first = db.read_bytes()
            pipeline.build_database(history, [], db)
            self.assertEqual(first, db.read_bytes())
            connection = sqlite3.connect(db)
            self.assertEqual(connection.execute('PRAGMA foreign_key_check').fetchall(), [])
            self.assertEqual(connection.execute('SELECT count(*) FROM owner_labels').fetchone()[0], 0)
            self.assertEqual(connection.execute('SELECT kind FROM nodes').fetchone()[0], 'artifact-observation')
            self.assertEqual(connection.execute('SELECT count(*) FROM edges').fetchone()[0], 0)
            aggregate = pipeline.aggregate(connection)
            self.assertIsNone(aggregate['judgeOwnerAgreement']['rate'])
            self.assertIsNone(aggregate['plateauWaste']['value'])
            self.assertEqual(aggregate['counts']['observations'], 1)
            connection.close()
        text = pipeline.scrub('Render /mnt/private/a.png for person@example.com token=abc123 Bearer secret123 sk-abcdefghijklmnopqrstuvwxyz C:\\Users\\name\\file.txt @session:private/123')
        for forbidden in ['private/a', 'person@', 'abc123', 'secret123', 'sk-abc', 'Users', '@session:']:
            self.assertNotIn(forbidden, text)
        self.assertIn('[path]', text)

if __name__ == '__main__':
    unittest.main()
