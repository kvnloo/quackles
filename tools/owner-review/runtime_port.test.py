"""Portability contracts. Runtime must work with Python site packages disabled."""
import copy
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
import meta_loop as ml

ROOT=Path(__file__).resolve().parent


def png(path, width=20, height=30):
    def chunk(kind, data):
        return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data))
    pixels=b''.join(b'\0'+bytes((255,0,0))*width for _ in range(height))
    path.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,2,0,0,0))+
                     chunk(b'IDAT',zlib.compress(pixels))+chunk(b'IEND',b''))


class PortableRuntime(unittest.TestCase):
    def run_isolated(self, source, *args, env=None):
        guard="import sys\nclass NoThirdParty:\n def find_spec(self,fullname,path=None,target=None):\n  if fullname.split('.')[0] in ('PIL','jsonschema','referencing'): raise ImportError('Runtime requested third-party '+fullname)\nsys.meta_path.insert(0,NoThirdParty())\n"
        return subprocess.run([sys.executable,'-S','-c',guard+source,*args],cwd=ROOT,
                              capture_output=True,text=True,env=env)

    def test_stdlib_validates_real_schema_and_polls_synthetic_lanes(self):
        result=self.run_isolated("import meta_loop as m; import live_rating; m.validate_trial(m.blank_trial('A','test','panel')); print('valid')")
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout.strip(),'valid')

    def test_defaults_use_external_cache_and_environment_overrides(self):
        env={k:v for k,v in os.environ.items() if k not in ('OWNER_REVIEW_DATA','XDG_CACHE_HOME')}
        result=self.run_isolated("import meta_loop; print(meta_loop.DEFAULT_DATA)",env=env)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(Path(result.stdout.strip()),Path.home()/'.cache/owner-review')
        env['OWNER_REVIEW_DATA']=str(ROOT/'synthetic-data')
        result=self.run_isolated("import meta_loop; print(meta_loop.DEFAULT_DATA)",env=env)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout.strip(),str(ROOT/'synthetic-data'))

    def test_configurable_artifact_root_drives_catalog_without_seed_module(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            root=Path(tmp);data=root/'data';data.mkdir();artifacts=root/'renders'
            (artifacts/'banner-generator').mkdir(parents=True)
            (artifacts/'stone-mosaic/A').mkdir(parents=True)
            target=root/'target.png';png(target)
            (artifacts/'banner-generator/target-statistics.json').write_text(json.dumps({'target':str(target)}))
            image=artifacts/'stone-mosaic/A/LOOK.png';png(image)
            row=ml.blank_trial('A','stone-mosaic','panel','geometry');row['status']='completed'
            row['artifacts']=[dict(path=str(image),sha256=ml.digest(image))]
            row['metrics']['renders']=[dict(path=str(image),master=[20,30],box=[0,0,20,30],look=True)]
            (data/'rows.json').write_text(json.dumps([row]))
            env=dict(os.environ,OWNER_REVIEW_ARTIFACTS=str(artifacts))
            result=self.run_isolated("import json,sys,live_rating; from pathlib import Path; d=Path(sys.argv[1]); c=live_rating.build_catalog(d,dict(candidates=[],assets={},history=[]),json.loads((d/'rows.json').read_text())); print(c['candidates'][0]['trial_id'])",str(data),env=env)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual(result.stdout.strip(),'A')

    def test_schema_guards_survive_without_jsonschema(self):
        row=ml.blank_trial('A','test','panel')
        changes=[{'status':'auto-approved'},{'parents':['A','A']},{'artifacts':[dict(path='x',sha256='bad')]},
                 {'cost':dict(gpu_seconds=True,wall_seconds=None)}, {'metrics':{}},
                 {'timestamp':'yesterday'},{'self_review':dict(status=1,notes='')},
                 {'owner_reaction':dict(status='auto-approved',receipt=None)}]
        for change in changes:
            invalid=copy.deepcopy(row);invalid.update(change)
            with self.subTest(change=change):
                result=self.run_isolated("import json,sys,meta_loop;\ntry: meta_loop.validate_trial(json.loads(sys.argv[1]))\nexcept ValueError: print('rejected')",json.dumps(invalid))
                self.assertEqual(result.returncode,0,result.stderr)
                self.assertEqual(result.stdout.strip(),'rejected')

    def test_synthetic_report_does_not_claim_private_historical_runs(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            data=Path(tmp)
            ml.publish_materialized(data,[ml.blank_trial('A','test','panel')],[])
            report=(data/'REPORT.md').read_text()
            self.assertNotIn('## Recipe library and actual transfer',report)
            self.assertNotRegex(report,r'/(?:workspace|mnt|home)/')
            self.assertIn('panel',report)

    def test_report_payoffs_use_the_same_calibration_as_the_published_snapshot(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            data=Path(tmp)
            calibration=dict(qualified=True,prospective_holdout=True,protocol_id='synthetic')
            (data/'calibration.json').write_text(json.dumps(dict(registry={'synthetic':calibration})))
            row=ml.blank_trial('A','test','panel')
            row['judge_verdicts']=[dict(preference='candidate',calibration_id='synthetic',protocol_id='synthetic',receipt='synthetic',evidence_verified=True)]
            ml.publish_materialized(data,[row],[])
            body=(data/'REPORT.md').read_text().split('## Payoffs\n\n```json\n')[1].split('\n```')[0]
            self.assertEqual(json.loads(body)['panel']['unknown']['judge_win']['n'],1)

    def test_stdlib_catalog_crop_is_source_bound_and_has_exact_dimensions(self):
        result=self.run_isolated("from catalog import Catalog; print('available')")
        self.assertEqual(result.returncode,0,result.stderr)
        from catalog import Catalog, asset_content
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            root=Path(tmp);image=root/'source.png';png(image)
            builder=Catalog(root);url=builder.crop(image,[2,3,7,11],'synthetic')
            asset=builder.assets[url.split('/')[-1]]
            self.assertEqual(asset['size'],[5,8])
            content,kind=asset_content(asset)
            self.assertEqual(kind,'image/svg+xml')
            self.assertIn(b'viewBox="2 3 5 8"',content)
            self.assertIn(b'data:image/png;base64,',content)
            png(image,21)
            with self.assertRaisesRegex(ValueError,'changed'):
                asset_content(asset)


if __name__=='__main__': unittest.main()
