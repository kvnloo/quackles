"""Portal tracer tests: real files/SQLite; no live owner writes."""
import importlib.util
import json
import os
from pathlib import Path
import tempfile
import unittest
from PIL import Image


class PortalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('TMPDIR'))
        self.root = Path(self.tmp.name)
        (self.root/'review-5-scenes').mkdir()
        (self.root/'portal').mkdir()
        Image.new('RGB', (120, 180), 'navy').save(self.root/'image.png')
        Image.new('RGB', (120, 180), 'white').save(self.root/'ref.png')
        (self.root/'review-5-scenes/CURRENT.json').write_text(json.dumps({'night': {'round': 'r1', 'capture': str(self.root/'image.png'), 'notes': 'pending owner'}}))
        (self.root/'review-5-scenes/history.json').write_text(json.dumps({'entries': []}))
        (self.root/'OWNER-PREFERENCES.md').write_text('# Original\nDo not edit.\n')
        (self.root/'portal/config.json').write_text(json.dumps({'references': {'night': str(self.root/'ref.png')}, 'decisions': [{'id':'demo','scene':'night','question':'Which approach?', 'options':['A','B']}]}))

    def tearDown(self):
        self.tmp.cleanup()

    def app(self):
        spec = importlib.util.find_spec('portal')
        self.assertIsNotNone(spec, 'P1 portal module is missing')
        import portal
        return portal.PortalApp(self.root)

    def test_note_round_trip_exports_without_touching_original(self):
        app = self.app()
        state = app.state()
        scene = state['scenes'][0]
        payload = {'id':'test-note', 'kind':'note', 'scene':'night', 'candidate':scene['candidate'], 'text':'Always keep this edge dark', 'region':{'type':'point','x':0.2,'y':0.3}, 'zoom':{'scale':2,'x':0,'y':0}, 'element':'edge','attribute':'brightness','direction':'darker','severity':'high','scope':'region', 'policy':'lock', 'always':True}
        saved = app.submit(payload)
        self.assertTrue(saved['saved'])
        self.assertEqual(app.submit(payload), saved)
        app2 = self.app()
        self.assertEqual(len(app2.state()['notes']), 1)
        self.assertEqual(len(app2.state()['rules']), 1)
        self.assertEqual((self.root/'OWNER-PREFERENCES.md').read_text(), '# Original\nDo not edit.\n')
        self.assertIn('Generated portal rules', (self.root/'portal/data/OWNER-PREFERENCES.portal.md').read_text())
        events = [json.loads(x) for x in (self.root/'meta-loop/events/owner.jsonl').read_text().splitlines()]
        self.assertEqual(len(events), 1)
        self.assertIsNone(events[0]['stars'])
        self.assertIsNone(events[0]['trial_id'])
        import meta_loop as ml
        ml.validate_owner_label(events[0], {})
        queue = [json.loads(x) for x in (self.root/'portal/data/inbox.jsonl').read_text().splitlines()]
        self.assertEqual(queue[0]['id'], 'test-note')
        with self.assertRaises(ValueError):
            app.submit(dict(payload,text='changed'))

    def test_decision_and_pick_are_persistent_not_promotions(self):
        app = self.app()
        scene = app.state()['scenes'][0]
        result = app.submit({'id':'decision-1','kind':'decision','scene':'night','candidate':scene['candidate'],'decision_id':'demo','answer':'B'})
        self.assertTrue(result['saved'])
        self.assertEqual(self.app().state()['notes'][0]['answer'],'B')
        with self.assertRaises(ValueError):
            app.submit({'id':'decision-2','kind':'decision','scene':'night','candidate':scene['candidate'],'decision_id':'demo','answer':'not an option'})
        self.assertIn('pending owner',(self.root/'review-5-scenes/CURRENT.json').read_text())

    def test_preview_crop_history_and_http_security(self):
        app = self.app()
        self.assertTrue(hasattr(app,'image_bytes'), 'Preview/native crop service is missing')
        from io import BytesIO
        aid = app.state()['scenes'][0]['candidate']['id']
        image = Image.open(BytesIO(app.image_bytes(aid, {})))
        self.assertEqual(image.size, (120,180))
        crop = Image.open(BytesIO(app.image_bytes(aid, {'box':['0.1,0.2,0.5,0.5']})))
        self.assertEqual(crop.size, (60,90))
        history = app.history()
        self.assertEqual(history['entries'],[])
        from portal import make_portal_server
        import threading, urllib.request, urllib.error
        server = make_portal_server(app,0)
        worker = threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        url = 'http://127.0.0.1:'+str(server.server_port)
        try:
            self.assertEqual(json.load(urllib.request.urlopen(url+'/health'))['service'],'review-portal')
            with self.assertRaises(urllib.error.HTTPError):
                urllib.request.urlopen(urllib.request.Request(url+'/api/visit',data=b'{}',headers={'Content-Type':'application/json'}))
        finally:
            server.shutdown(); server.server_close(); worker.join()

if __name__ == '__main__':
    unittest.main()
