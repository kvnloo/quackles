"""Read-only real-artifact acceptance tests for morning intake."""
import importlib.util
import unittest
import os
from pathlib import Path

@unittest.skipUnless(os.environ.get('MORNING_REVIEW_TEST_DATA'), 'local artifact fixture required')
class MorningTests(unittest.TestCase):
    def test_all_delivered_integrations_and_white_enter_intake(self):
        self.assertIsNotNone(importlib.util.find_spec('morning_rating'), 'morning intake is not implemented')
        from morning_rating import discover
        data=Path(os.environ['MORNING_REVIEW_TEST_DATA'])
        rows=discover(data)
        keys={r['parameters']['directory'] for r in rows}
        for name in ['it15','it15-stone','it16-stone','it19-stone-trial','it15-greenery','it15-greenery-r4','it16-greenery','it18-greenery-C-trial','it21-greenery-r5-trial','it15-banner','it15-banner-anatomy','it20-anatomy-trial','it15-optics','it14']:
            self.assertTrue(any(k.endswith('/'+name) for k in keys), name)
        self.assertTrue(any(k.endswith('/white-r112/v1') for k in keys))
        self.assertEqual(len(rows),len({r['trial_id'] for r in rows}))
        for row in rows:
            self.assertEqual(row['owner_reaction']['status'],'not_reviewed')
            self.assertTrue(row['parameters']['views'])
            for v in row['parameters']['views']:
                self.assertTrue(v['target'])
                if row['status']=='completed': self.assertTrue(v.get('look') or v.get('clear'))

    def test_unrendered_packages_are_explicit(self):
        from morning_rating import discover
        rows=discover(Path(os.environ['MORNING_REVIEW_TEST_DATA']))
        for ending in ['/white-r112/v2','/integrated/it17-greenery-trial']:
            match=[r for r in rows if r['parameters']['directory'].endswith(ending)]
            self.assertEqual(len(match),1)
            self.assertEqual(match[0]['status'],'blocked')
            self.assertFalse(any(v.get('look') or v.get('clear') for v in match[0]['parameters']['views']))

    def test_unrendered_import_cannot_be_labeled(self):
        import tempfile,shutil,json
        from owner_rating import RatingApp
        data=Path(os.environ['MORNING_REVIEW_TEST_DATA'])
        with tempfile.TemporaryDirectory() as tmp:
            copy=Path(tmp);(copy/'events').mkdir()
            for name in ['ledger.json','rating-catalog.json']:
                shutil.copy2(data/name,copy/name)
            (copy/'events/owner.jsonl').write_text('')
            app=RatingApp(copy)
            candidate=app.catalog['candidates'][0]
            candidate.update(morning_intake=True,views=[dict(target='reference',missing_modes=['look','clear'])])
            with self.assertRaisesRegex(ValueError,'rendered evidence'):
                app.submit(dict(event_id='blocked-test',trial_id=candidate['trial_id'],element=candidate['element'],judged_on='look',verdict='accept',stars=5))
            self.assertEqual((copy/'events/owner.jsonl').read_text(),'')

    def test_rear_coupons_are_included(self):
        from morning_rating import discover
        rows=discover(Path(os.environ['MORNING_REVIEW_TEST_DATA']))
        keys={r['parameters']['directory'] for r in rows}
        for name in ['trial-C','trial-C1']:
            self.assertTrue(any(k.endswith('/lhf/'+name) for k in keys),name)

    def test_poll_includes_overnight_and_eight_hour_window(self):
        from live_rating import lane_rows
        from owner_rating import RatingApp
        data=Path(os.environ['MORNING_REVIEW_TEST_DATA'])
        self.assertTrue(any(r['lane']=='morning-review' for r in lane_rows(data)))
        self.assertEqual(RatingApp(data).poll_status['duration_seconds'],28800)

if __name__=='__main__': unittest.main()
