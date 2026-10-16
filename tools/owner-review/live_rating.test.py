#!/usr/bin/env python3
"""Disposable fixtures only; never touches the real owner event log."""
import json
from pathlib import Path
import tempfile
import unittest
from synthetic_fixture import png
import meta_loop as ml
import owner_rating as ui


class LiveRating(unittest.TestCase):
    def test_labels_require_and_preserve_judged_on(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = Path(tmp)
            (data/'events').mkdir()
            row = ml.blank_trial('A', 'lane', 'night-banner', 'geometry')
            (data/'ledger.json').write_text(json.dumps([row]))
            (data/'rating-catalog.json').write_text(json.dumps(dict(candidates=[], assets={}, history=[])))
            app = ui.RatingApp(data)
            payload = dict(event_id='test', trial_id='A', element='night-banner', stars=4, verdict='maybe')
            for value in (None, '', 'unknown', ['look']):
                with self.subTest(value=value), self.assertRaises(ValueError):
                    app.submit(dict(payload, judged_on=value))
            self.assertFalse((data/'events/owner.jsonl').exists())
            for value in ('look', 'clear', 'both'):
                result = app.submit(dict(payload, event_id='test-'+value, judged_on=value))
                self.assertEqual(result['event']['judged_on'], value)
            self.assertEqual([e['judged_on'] for e in ml.read_jsonl(data/'events/owner.jsonl')[0]], ['look', 'clear', 'both'])

    def test_http_does_not_serve_changed_pixels_under_old_asset_identity(self):
        from catalog import Catalog
        import threading
        import urllib.request
        import urllib.error
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);path=data/'render.png'
            png(path,20,30,(255,0,0))
            catalog=Catalog(data);url=catalog.asset(path)
            (data/'rating-catalog.json').write_text(json.dumps(dict(candidates=[],history=[],assets=catalog.assets)))
            app=ui.RatingApp(data);server=ui.make_server(app,0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            try:
                base=f'http://127.0.0.1:{server.server_port}'
                with urllib.request.urlopen(base+url) as response:
                    self.assertEqual(response.status,200)
                png(path,20,30,(0,0,255))
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(base+url)
                self.assertEqual(error.exception.code,409)
                error.exception.close()
            finally:
                server.shutdown();server.server_close();thread.join()

    def test_replaced_image_gets_new_asset_identity(self):
        from catalog import Catalog
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);path=data/'render.png'
            png(path,20,30,(255,0,0))
            catalog=Catalog(data);before=catalog.asset(path)
            png(path,20,30,(0,0,255))
            after=catalog.asset(path)
            self.assertNotEqual(before,after)
            self.assertEqual(catalog.assets[after.split('/')[-1]]['sha256'],ml.digest(path))

    def test_render_receipt_fallback_and_post_only_look(self):
        import live_rating as live
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); data=root/'meta-loop'; data.mkdir()
            night=root/'night-v2'; folder=night/'optics/D';folder.mkdir(parents=True)
            (night/'banner-generator').mkdir()
            png(root/'target.png')
            (night/'banner-generator/target-statistics.json').write_text(json.dumps({'target':str(root/'target.png')}))
            image=folder/'render.png';png(image)
            receipt=folder/'receipt.json'
            receipt.write_text(json.dumps({'mode':'LOOK','renders':[dict(path=str(image),master=[20,30],border=None,dof=False)]}))
            row=ml.blank_trial('optics-D','optics','night-optics','post');row['status']='completed'
            row['metrics'].update(mode='LOOK',renders=[])
            row['artifacts']=[dict(path=str(p),sha256=ml.digest(p)) for p in (image,receipt)]
            self.assertEqual(live.render_metadata(row,image).get('master'),[20,30])
            result=live.build_catalog(data,dict(candidates=[],history=[],assets={}),[row])
            self.assertTrue(result['candidates'][0]['views'][0].get('look'))
            self.assertFalse(result['candidates'][0]['views'][0].get('clear'))

    def test_rejects_unavailable_judging_mode(self):
        with tempfile.TemporaryDirectory() as tmp:
            data=Path(tmp);(data/'events').mkdir()
            (data/'ledger.json').write_text(json.dumps([ml.blank_trial('A','lane','night-stone','geometry')]))
            (data/'rating-catalog.json').write_text(json.dumps(dict(candidates=[dict(trial_id='A',views=[dict(clear='/assets/test')])],history=[],assets={})))
            app=ui.RatingApp(data)
            for mode in ('look','both'):
                with self.assertRaisesRegex(ValueError,'unavailable'):
                    app.submit(dict(event_id='bad',trial_id='A',element='night-stone',stars=4,verdict='maybe',judged_on=mode))
            self.assertFalse((data/'events/owner.jsonl').exists())

    def test_live_refresh_pairs_crops_and_polls_for_four_hours(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            data, night = root/'meta-loop', root/'night-v2'
            (data/'events').mkdir(parents=True)
            (night/'banner-generator').mkdir(parents=True)
            png(root/'target.png',200,300)
            (night/'banner-generator/target-statistics.json').write_text(json.dumps({'target':str(root/'target.png')}))
            (night/'stone-mosaic').mkdir()
            (night/'stone-mosaic/measurements.json').write_text(json.dumps({'regions':{'front':{'box':[80, 260, 130, 300]}}}))
            (data/'ledger.json').write_text('[]')
            (data/'rating-catalog.json').write_text(json.dumps(dict(candidates=[], assets={}, history=[])))
            folder = night/'stone-mosaic/A'
            folder.mkdir()
            row = ml.blank_trial('stone-A', 'stone-mosaic', 'night-stone', 'geometry')
            row['status'] = 'completed'
            row['metrics']['renders'] = []
            for mode in ('LOOK', 'CLEAR'):
                path = folder/(mode+'.png')
                png(path,200,80,(30,50,70))
                row['artifacts'].append(dict(path=str(path), sha256=ml.digest(path)))
                row['metrics']['renders'].append(dict(path=str(path), master=[200,300], box=[0,220,200,300], look=mode=='LOOK'))
            path = data/'events/stone-mosaic.jsonl'
            path.write_text(json.dumps(row)+'\n')
            app = ui.RatingApp(data)
            self.assertTrue(hasattr(app, 'poll'), 'bounded lane polling is missing')
            start = app.watch_start
            self.assertTrue(app.poll(now=start))
            candidate = app.state()['candidates'][0]
            self.assertEqual(candidate['default_view'], {'kind':'hero','region':'plinth front face'})
            view = candidate['views'][0]
            self.assertTrue(view['look'] and view['clear'] and view['target'])
            for mode in ('look', 'clear', 'target'):
                self.assertEqual(app.catalog['assets'][view[mode].split('/')[-1]]['size'], [50,40])
            # New trial appears only on the next due poll, with no owner events.
            row.update(event_id='second', trial_id='stone-B')
            with path.open('a') as stream:
                stream.write(json.dumps(row)+'\n')
            self.assertFalse(app.poll(now=start+899))
            self.assertTrue(app.poll(now=start+900))
            self.assertEqual(len(app.catalog['candidates']),2)
            self.assertFalse((data/'events/owner.jsonl').exists())
            # Incomplete writer tails do not discard existing catalog entries.
            with path.open('a') as stream:
                stream.write('{')
            self.assertFalse(app.poll(now=start+1800))
            self.assertEqual(len(app.catalog['candidates']),2)
            self.assertTrue(app.poll_status['error'])
            self.assertFalse(app.poll(now=start+14401))
            self.assertEqual(app.poll_status['active'],False)
            self.assertFalse(json.loads((data/'rating-poll.json').read_text())['active'])


if __name__ == '__main__':
    unittest.main()
