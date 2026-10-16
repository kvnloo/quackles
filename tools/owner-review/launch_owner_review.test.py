"""Local CLI integration; creates only synthetic data under the test directory."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import urllib.request

ROOT=Path(__file__).resolve().parent


class Launch(unittest.TestCase):
    def test_fixture_then_launch_with_env_and_cli_data(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            data=Path(tmp)/'data'
            fixture=subprocess.run([sys.executable,str(ROOT/'synthetic_fixture.py'),'--data',str(data)],capture_output=True,text=True)
            self.assertEqual(fixture.returncode,0,fixture.stderr)
            self.assertTrue((data/'ledger.json').is_file())
            initial=(data/'events/owner.jsonl').read_bytes()
            for override in (False,True):
                env=dict(os.environ,OWNER_REVIEW_DATA=str(data) if not override else str(data/'missing'))
                args=[sys.executable,'-u',str(ROOT/'owner_rating.py'),'--port','0','--no-watch']
                if override:args+=['--data',str(data)]
                process=subprocess.Popen(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    line=process.stdout.readline()
                    if not line:self.fail(process.stderr.read())
                    url=json.loads(line)['url']
                    with urllib.request.urlopen(url+'api/state') as response:
                        state=json.load(response)
                    self.assertEqual(state['candidates'][0]['element'],'sample-panel')
                    self.assertFalse(state['polling']['active'])
                    self.assertEqual(len(state['labels']),2)
                finally:
                    process.terminate();process.communicate(timeout=5)
            self.assertEqual((data/'events/owner.jsonl').read_bytes(),initial)
            retry=subprocess.run([sys.executable,str(ROOT/'synthetic_fixture.py'),'--data',str(data)],capture_output=True,text=True)
            self.assertNotEqual(retry.returncode,0)
            self.assertEqual((data/'events/owner.jsonl').read_bytes(),initial)


if __name__=='__main__': unittest.main()
