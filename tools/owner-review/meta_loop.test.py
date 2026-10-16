import copy
import importlib.util
import json
import pathlib
import tempfile
from typing import Any
import unittest

SPEC = importlib.util.spec_from_file_location('meta_loop', pathlib.Path(__file__).with_name('meta_loop.py'))
assert SPEC and SPEC.origin and SPEC.loader
m: Any = importlib.util.module_from_spec(SPEC)
if pathlib.Path(SPEC.origin).exists():
    SPEC.loader.exec_module(m)


def trial(i='a', **kwargs):
    d = dict(event='meta_trial', schema_version=1, event_id=i+'-v1', trial_id=i,
             run_id='test', timestamp='2026-10-15T12:00:00Z', lane='test', parents=[],
             element='night-banner', defect_id='edge', hypothesis='test edges',
             mechanism_class='geometry', parameters={}, cost=dict(gpu_seconds=None, wall_seconds=None),
             artifacts=[], metrics=dict(max_zoom_texel_density=None, crop_gate=None, sharpness=None),
             self_review=dict(status='pending', notes=''), judge_verdicts=[],
             owner_reaction=dict(status='not_reviewed', receipt=None), status='completed', failure_class='none')
    d.update(kwargs)
    return d


class LedgerTests(unittest.TestCase):
    def test_bad_gate_and_cycle_are_rejected(self):
        bad = trial(metrics={'max_zoom_texel_density':None,'crop_gate':'maybe','sharpness':None})
        with self.assertRaises(ValueError):
            m.validate_trial(bad)
        a, b = trial('a', parents=['b']), trial('b', parents=['a'])
        rows, errors = m.materialize([a,b])
        self.assertTrue(any('cycle' in e for e in errors))

    def test_classification_revision_preserves_history_and_one_trial(self):
        a = trial('a', mechanism_class='traced_vector')
        b = trial('a', event_id='a-v2', mechanism_class='layer_stack')
        rows, errors = m.materialize([a,b,a])
        self.assertEqual(errors, [])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['mechanism_class'], 'layer_stack')
        self.assertEqual([r['mechanism_class'] for r in rows[0]['classification_history']], ['traced_vector','layer_stack'])
        self.assertNotIn('classification_history', a)

    def test_lineage_correction_retains_history_and_rechecks_cycles(self):
        a = trial('a', parents=['batch-alias'])
        b = trial('a', event_id='a-final', parents=['b'])
        rows, errors = m.materialize([a, trial('b'), b, a])
        self.assertEqual(errors, [])
        row = next(r for r in rows if r['trial_id']=='a')
        self.assertEqual(row['parents'], ['b'])
        self.assertEqual([r['parents'] for r in row['parent_history']], [['batch-alias'], ['b']])
        self.assertNotIn('parent_history', a)
        _, errors = m.materialize([a, trial('b', parents=['a']), b])
        self.assertTrue(any('cycle' in e for e in errors))

    def test_event_revision_dedup_and_conflict(self):
        self.assertTrue(hasattr(m, 'materialize'), 'ledger reducer missing')
        a = trial()
        b = trial(event_id='a-v2', owner_reaction=dict(status='approved', receipt='owner:1'))
        result, errors = m.materialize([a, a, b])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]['owner_reaction']['status'], 'approved')
        self.assertEqual(errors, [])
        c = copy.deepcopy(a)
        c['element'] = 'night-stone'
        _, errors = m.materialize([a, c])
        self.assertTrue(any('conflict' in e for e in errors))


class LearnerTests(unittest.TestCase):
    def test_report_documents_are_not_payoff_trials(self):
        row = trial('doc', source={'evidence_only':True})
        self.assertEqual(m.learn([row], {}), {})

    def test_separate_acceptance_keep_and_unqualified_judges(self):
        self.assertTrue(hasattr(m, 'learn'), 'payoff learner missing')
        rows = [trial('a', owner_reaction={'status':'approved','receipt':'owner:1'}),
                trial('b', owner_reaction={'status':'rejected','receipt':'owner:2'}),
                trial('c', historical_keep=True, judge_verdicts=[{'preference':'candidate','calibration_id':'fake','receipt':'fake'}])]
        stats = m.learn(rows, {})['night-banner']['geometry']
        self.assertEqual(stats['owner_accept']['alpha'], 2)
        self.assertEqual(stats['owner_accept']['beta'], 2)
        self.assertEqual(stats['judge_win']['n'], 0)
        self.assertEqual(stats['historical_keep']['n'], 1)
        self.assertIsNone(stats['wall_seconds_mean'])
        self.assertEqual(stats['owner_accept']['mean'], .5)

    def test_measured_gate_failures_update_separate_posterior(self):
        rows = [trial(str(i), metrics={'max_zoom_texel_density':.5,'crop_gate':'fail','sharpness':None,
                                      'max_zoom_gate':'fail','max_zoom_evidence':'gate.json'}, artifacts_verified=True) for i in range(2)]
        stats = m.learn(rows, {})['night-banner']['geometry']
        self.assertEqual(stats.get('max_zoom_pass', {}).get('beta'), 3)
        self.assertEqual(stats['owner_accept']['n'], 0)
        self.assertTrue(m.plateaus(rows, {}))

    def test_authored_vector_lane_is_not_redispatched_as_unseen(self):
        row = trial('gen', lane='banner-generator', mechanism_class='traced_vector', status='pending',
                    parameters={'new_detail':'authored deterministic vectors; not recovered target strokes'})
        result = m.plan([row], 'night-banner', {})
        self.assertFalse(any(x['action']=='new_mechanism' and x['mechanism_class']=='generated_vector' for x in result['batch']))
        self.assertIn('generated_vector', m.learn([row], {})['night-banner'])
        self.assertEqual(row['mechanism_class'], 'traced_vector')

    def test_pending_mechanism_is_not_redispatched(self):
        rows = [trial('a', status='pending', mechanism_class='traced_vector')]
        rows += [trial(f'{mechanism}-{i}', mechanism_class=mechanism) for mechanism in m.MECHANISMS
                 if mechanism != 'traced_vector' for i in range(2)]
        result = m.plan(rows, 'night-banner', {})
        self.assertFalse(any(x['action']=='new_mechanism' and x['mechanism_class']=='traced_vector' for x in result['batch']))
        self.assertEqual(result.get('pending_trial_ids'), ['a'])

    def test_learned_best_must_be_an_observed_winner_not_prior_only(self):
        rows = [trial('win', element='night-stone', owner_reaction={'status':'approved','receipt':'o:win'})]
        rows += [trial('fail'+str(i), element='night-stone', defect_id='different'+str(i),
                       owner_reaction={'status':'rejected','receipt':'o:'+str(i)}) for i in range(4)]
        result = m.plan(rows, 'night-stone', {})
        self.assertEqual(result['learned_best'], 'geometry')

    def test_plateau_uses_observation_time_not_filename_order(self):
        rows = [trial('later-win', timestamp='2026-10-15T15:00:00Z', owner_reaction={'status':'approved','receipt':'o:3'}),
                trial('early-fail', timestamp='2026-10-15T12:00:00Z', owner_reaction={'status':'rejected','receipt':'o:1'}),
                trial('middle-fail', timestamp='2026-10-15T13:00:00Z', owner_reaction={'status':'rejected','receipt':'o:2'})]
        self.assertEqual(m.plateaus(rows, {}), [])

    def test_plateau_switch_not_stop_and_exploration_budget(self):
        self.assertTrue(hasattr(m, 'plan'), 'portfolio planner missing')
        rows = [trial(str(i), owner_reaction={'status':'rejected','receipt':'owner:'+str(i)}) for i in range(2)]
        plan = m.plan(rows, 'night-banner', {})
        self.assertEqual(len(plan['batch']), 4)
        self.assertEqual(plan['exploration_slots'], 2)
        self.assertTrue(plan['plateaus'])
        self.assertFalse(plan['stop'])
        self.assertTrue(any(x['action'] == 'new_mechanism' for x in plan['batch']))
        self.assertTrue(all(x['action'] != 'refine_best' for x in plan['batch']))


class ReplayTests(unittest.TestCase):
    def test_unknown_mechanism_never_becomes_a_replay_action(self):
        rows = [trial('a', mechanism_class='unknown', replay_group='g', replay_order=0),
                trial('b', replay_group='g', replay_order=1, historical_keep=True)]
        result = m.replay(rows)
        self.assertEqual(result.get('excluded_unknown_mechanism'), 1)
        for p in result['policies'].values():
            self.assertTrue(all(d['recommended'] != 'unknown' for d in p['decisions']))

    def test_prefix_only_and_unsupported_not_failure(self):
        self.assertTrue(hasattr(m, 'replay'), 'prefix replay missing')
        rows = [trial(str(i), historical_keep=bool(i%2), replay_group='g', replay_order=i) for i in range(8)]
        short = m.replay(rows[:5])
        full = m.replay(rows)
        for policy in short['policies']:
            self.assertEqual(short['policies'][policy]['decisions'], full['policies'][policy]['decisions'][:5])
            s = full['policies'][policy]
            self.assertEqual(s['matched']+s['unsupported'], 8)
            self.assertEqual(s['value_estimate'], None)
        changed = copy.deepcopy(rows)
        changed[0]['historical_keep'] = not rows[0]['historical_keep']
        self.assertEqual(full['policies']['portfolio']['decisions'][0]['recommended'],
                         m.replay(changed)['policies']['portfolio']['decisions'][0]['recommended'])


class IntegrationTests(unittest.TestCase):
    def test_import_missing_data_does_not_invent_approval_or_cost(self):
        self.assertTrue(hasattr(m, 'import_history'), 'history importer missing')
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root/'rounds.jsonl').write_text(json.dumps({'id':'q:one','scene':'night','change_class':['material'],
                'timestamp':None,'status':{'kept':True,'owner_accepted':None},'costs':{},'sources':[],
                'parent_node':None,'hypothesis':'test'})+'\n')
            (root/'owner_labels.jsonl').write_text('')
            events, anchors = m.import_history(root)
            self.assertEqual(len(events), 1)
            self.assertEqual(events[0]['owner_reaction']['status'], 'not_reviewed')
            self.assertIsNone(events[0]['cost']['gpu_seconds'])
            self.assertEqual(events[0]['mechanism_class'], 'unknown')
            self.assertIsNone(events[0]['timestamp'])
            self.assertTrue(events[0]['historical_keep'])

    def test_legacy_lane_adapter_preserves_raw_and_unknown_gates(self):
        self.assertTrue(hasattr(m, 'adapt_lane'), 'legacy lane adapter missing')
        raw = {'trial_id':'x','parent':'relief-C','element':'banner','defect_id':'d','hypothesis':'h',
               'mechanism_class':'space-filling-vector','params':{'seed':1},'cost_s':2.0,
               'artifacts':[],'metrics':{},'self_review':'planar only','reviewer_verdict':'pending'}
        adapted = m.adapt_lane(raw, pathlib.Path('/test/banner-generator.jsonl'), 1)
        self.assertEqual(adapted['source']['raw'], raw)
        self.assertEqual(adapted['parents'], ['relief-C'])
        self.assertEqual(adapted['mechanism_class'], 'generated_vector')
        self.assertIsNone(adapted['metrics']['crop_gate'])
        self.assertEqual(adapted['owner_reaction']['status'], 'not_reviewed')
        self.assertEqual(adapted, m.adapt_lane(raw, pathlib.Path('/test/banner-generator.jsonl'), 1))

    def test_native_lane_event_supersedes_legacy_intake_without_double_count(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root/'events').mkdir()
            raw = {'trial_id':'a','parent':'unresolved','element':'banner','defect_id':'old',
                   'hypothesis':'old','mechanism_class':'space-filling-vector','params':{},'cost_s':2,
                   'artifacts':[],'metrics':{},'self_review':'pending'}
            native = trial('a', lane='banner-generator', mechanism_class='traced_vector')
            (root/'events/banner-generator.jsonl').write_text(json.dumps(raw)+'\n'+json.dumps(native)+'\n')
            rows, errors = m.ingest(root)
            self.assertEqual(errors, [])
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]['mechanism_class'], 'traced_vector')

    def test_next_fails_closed_on_invalid_ledger(self):
        import subprocess
        import sys
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root/'events').mkdir()
            (root/'events/bad.jsonl').write_text('{broken}\n')
            result = subprocess.run([sys.executable, str(m.ROOT/'scripts/meta_loop.py'), '--data', str(root),
                                     'next', '--element', 'night-banner'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertNotIn('"batch"', result.stdout)

    def test_report_runs_on_real_lane_file(self):
        self.assertTrue(hasattr(m, 'refresh'), 'runner missing')
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            (root/'events').mkdir()
            (root/'events/test.jsonl').write_text(json.dumps(trial())+'\n')
            report = m.refresh(root)
            self.assertEqual(report['trial_count'], 1)
            self.assertTrue((root/'index.html').is_file())
            self.assertTrue((root/'REPORT.md').is_file())
            self.assertTrue((root/'next-night-banner.json').is_file())
            self.assertIn('Trial tree', (root/'index.html').read_text())


class CalibrationTests(unittest.TestCase):
    def test_heldout_family_not_used_to_select_rubric(self):
        self.assertTrue(hasattr(m, 'calibrate'), 'calibration reducer missing')
        records = []
        for family in ('a','b','c'):
            for rubric in ('brief','plain'):
                records.append(dict(pair_id=family, rubric=rubric, evidence='both', replicate=1,
                                    valid=True, agreement=rubric=='brief', id=family+rubric))
        a = m.calibrate(records)
        flipped = copy.deepcopy(records)
        for r in flipped:
            if r['pair_id']=='a': r['agreement'] = not r['agreement']
        b = m.calibrate(flipped)
        self.assertEqual(a['folds'][0]['selected_rubric'], b['folds'][0]['selected_rubric'])
        self.assertNotIn('a', a['folds'][0]['training_families'])
        self.assertFalse(a['registry']['brief-aware-v1']['qualified'])
        self.assertFalse(a['prospective_holdout'])


class RecipeTests(unittest.TestCase):
    def test_recipe_needs_hash_verified_native_gate(self):
        candidate = trial(owner_reaction={'status':'approved','receipt':'owner:1'},
            metrics={'crop_gate':'pass','max_zoom_gate':'pass','max_zoom_evidence':'/missing/gate.json'},
            recipe={'script_path':'/missing/recipe.py'})
        self.assertFalse(m.eligible_recipe(candidate, {}), 'string PASS must not authorize a recipe')

    def test_qualified_recipe_card_and_hash_drift_demotion(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            script, gate = root/'recipe.py', root/'gate.json'
            script.write_text('def apply(): return 1\n')
            gate.write_text('{"max_zoom_gate":"pass"}')
            row = trial(owner_reaction={'status':'approved','receipt':'test-owner-receipt'},
                        metrics={'crop_gate':'pass','max_zoom_gate':'pass','max_zoom_evidence':str(gate)},
                        recipe={'script_path':str(script)},
                        artifacts=[{'path':str(p),'sha256':m.digest(p)} for p in (script,gate)])
            m.verify_artifacts([row])
            cards = m.recipe_index([row], {}, root)
            self.assertEqual(cards[0]['status'], 'qualified')
            script.write_text('def apply(): return 2\n')
            m.verify_artifacts([row])
            self.assertEqual(m.recipe_index([row], {}, root)[0]['status'], 'candidate')
            self.assertEqual(m.recipe_index([row], {}, root, integrity_ok=False)[0]['status'], 'blocked_ledger_integrity')

    def test_artifact_hash_drift_is_detected(self):
        self.assertTrue(hasattr(m, 'verify_artifacts'), 'artifact verifier missing')
        with tempfile.TemporaryDirectory() as folder:
            path = pathlib.Path(folder)/'receipt.json'
            path.write_text('{}')
            row = trial(artifacts=[{'path':str(path),'sha256':m.digest(path)}])
            m.verify_artifacts([row])
            self.assertTrue(row['artifacts_verified'])
            path.write_text('{"changed":true}')
            m.verify_artifacts([row])
            self.assertFalse(row['artifacts_verified'])


if __name__ == '__main__':
    unittest.main()
