"""Synthetic confirmation tests; all writes are within disposable fixtures."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import unittest
import meta_loop as ml
import owner_rating as ui
from synthetic_fixture import png
from catalog import Catalog

spec=importlib.util.spec_from_file_location('chat_tests',Path(__file__).with_name('chat_backfill.test.py'))
fixtures=importlib.util.module_from_spec(spec); spec.loader.exec_module(fixtures)


class Confirmation(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(dir=Path(__file__).parent)
        self.addCleanup(self.tmp.cleanup)
        self.data=Path(self.tmp.name); (self.data/'events').mkdir()
        self.source=fixtures.chat(pairwise=dict(other_trial_id='B',preference='candidate'))
        self.element=fixtures.chat(event_id='element-1',trial_id=None,scope='element',verdict='direction')
        (self.data/'events/lane.jsonl').write_text(json.dumps(fixtures.trial())+'\n'+json.dumps(ml.blank_trial('B','synthetic','sample-panel','geometry'))+'\n')
        (self.data/'events/owner.jsonl').write_text(''.join(json.dumps(l)+'\n' for l in (self.source,self.element)))
        ml.ingest(self.data)
        image=self.data/'synthetic.png';png(image)
        catalog=Catalog(self.data);crop=catalog.crop(image,[2,3,7,11],'synthetic')
        candidate=dict(trial_id='A',element='sample-panel',queue='banner',title='Synthetic panel',
                       hypothesis='Synthetic edges',views=[dict(kind='hero',region='panel',look=crop,clear=crop)])
        (self.data/'rating-catalog.json').write_text(json.dumps(dict(candidates=[candidate],history=[],assets=catalog.assets)))
        self.app=ui.RatingApp(self.data)

    def request(self, **changes):
        payload=dict(event_id='confirmation',trial_id='A',element='sample-panel',scope='component',
                     aspect='edges',verdict='accept',stars=None,confirmed_from='chat-1',judged_on='look')
        payload.update(changes); return payload

    def test_confirmation_preserves_receipt_and_null_stars_append_only(self):
        result=self.app.submit(self.request(quote='payload must not replace the receipt'))
        label=result['event']
        self.assertEqual(label['source'],'owner-ui')
        self.assertEqual(label['status'],'confirmed')
        for key in ('quote','source_receipt','mapping_confidence','mapping_evidence','aspect','scope','defect_id','pairwise'):
            self.assertEqual(label[key],self.source[key])
        self.assertEqual(label['source_timestamp'],self.source['timestamp'])
        self.assertIsNone(label['stars'])
        self.assertEqual(self.app.submit(self.request())['event'],label)
        history=ml.read_jsonl(self.data/'events/owner.jsonl')[0]
        self.assertEqual(history[:2],[self.source,self.element])
        self.assertEqual(len(history),3)
        self.assertEqual(result['payoffs']['geometry']['owner_aspects']['edges']['accept'],1)
        self.assertEqual(result['payoffs']['geometry']['owner_accept']['n'],0)

    def test_only_a_real_null_star_source_allows_unrated_ui_submission(self):
        for change in ({'confirmed_from':None}, {'confirmed_from':'missing'}, {'scope':'trial'},
                       {'aspect':'overall'}, {'trial_id':None}, {'stars':True}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.app.submit(self.request(**change))
        self.assertEqual(len(ml.read_jsonl(self.data/'events/owner.jsonl')[0]),2)

    def test_bound_receipt_can_be_confirmed_without_guessing_optics(self):
        result=self.app.submit(self.request(judged_on=None))
        self.assertNotIn('judged_on',result['event'])

    def test_explicit_quality_can_be_added_during_confirmation(self):
        result=self.app.submit(self.request(stars=5))
        self.assertEqual(result['event']['confirmed_from'],'chat-1')
        self.assertEqual(result['event']['stars'],5)

    def test_element_confirmation_stays_unbound_and_gets_a_plan(self):
        result=self.app.submit(self.request(confirmed_from='element-1',trial_id=None,
                              scope='element',verdict='direction',judged_on=None))
        self.assertIsNone(result['event']['trial_id'])
        self.assertNotIn('judged_on',result['event'])
        self.assertEqual(result['next']['element'],'sample-panel')
        summary=json.loads((self.data/'owner-evidence.json').read_text())
        self.assertEqual(summary['element_only']['sample-panel']['edges']['direction'],1)
        self.assertEqual(summary['unbound_labels'][0]['source'],'owner-ui')

    @unittest.skipUnless(os.environ.get('OWNER_REVIEW_BROWSER_MODULE'), 'optional headless browser dependency')
    def test_browser_quote_only_confirmation_does_not_assign_optics(self):
        self.app.catalog['candidates']=[]
        server=ui.make_server(self.app,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            result=subprocess.run(['node',str(Path(__file__).with_name('owner-review.browser.mjs')),
                                   'http://127.0.0.1:'+str(server.server_port),'quote-only'],capture_output=True,text=True,timeout=40)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            labels=ml.read_jsonl(self.data/'events/owner.jsonl')[0]
            self.assertNotIn('judged_on',labels[2])
        finally:
            server.shutdown();server.server_close();thread.join()

    @unittest.skipUnless(os.environ.get('OWNER_REVIEW_BROWSER_MODULE'), 'optional headless browser dependency')
    def test_browser_enter_confirms_prefilled_receipts_and_browses_elements(self):
        server=ui.make_server(self.app,0)
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            result=subprocess.run(['node',str(Path(__file__).with_name('owner-review.browser.mjs')),
                                   'http://127.0.0.1:'+str(server.server_port)],capture_output=True,text=True,timeout=40)
            self.assertEqual(result.returncode,0,result.stdout+result.stderr)
            labels=ml.read_jsonl(self.data/'events/owner.jsonl')[0]
            self.assertEqual(len(labels),4)
            self.assertEqual([l['confirmed_from'] for l in labels[2:]],['chat-1','element-1'])
            self.assertTrue(all(l['stars'] is None for l in labels[2:]))
        finally:
            server.shutdown();server.server_close();thread.join()


if __name__=='__main__': unittest.main()
