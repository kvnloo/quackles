"""Public distribution boundaries and synchronization, using synthetic trees."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parent


class PublicPort(unittest.TestCase):
    def test_cli_is_runnable_without_repository_data(self):
        result=subprocess.run([sys.executable,str(ROOT/'owner_rating.py'),'--help'],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('--data',result.stdout)
        self.assertIn('--no-watch',result.stdout)

    def test_bundle_has_no_private_host_paths_seed_mappings_or_image_files(self):
        self.assertTrue((ROOT/'meta_loop.py').is_file(),'runtime bundle missing')
        for path in ROOT.rglob('*'):
            if not path.is_file() or '__pycache__' in path.parts:
                continue
            with self.subTest(path=path.name):
                self.assertNotIn(path.suffix.lower(),('.png','.jpg','.jpeg','.webp'))
                text=path.read_text()
                self.assertNotRegex(text,r'/(?:mnt|home|workspace)/')
                self.assertNotRegex(text,r'owner:[0-9]{4,}')
                self.assertNotEqual(path.name,'seed_owner_rating.py')

    def test_sync_copies_only_public_runtime_and_detects_drift(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as tmp:
            mirror=Path(tmp);(mirror/'scripts').mkdir();(mirror/'templates').mkdir()
            command=[sys.executable,str(ROOT/'sync_mirror.py'),'--mirror',str(mirror)]
            result=subprocess.run(command+['--write'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertEqual((mirror/'scripts/owner_rating.py').read_bytes(),(ROOT/'owner_rating.py').read_bytes())
            self.assertFalse((mirror/'scripts/public_port.test.py').exists())
            result=subprocess.run(command+['--check'],capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)
            (mirror/'scripts/owner_rating.py').write_text('drift')
            result=subprocess.run(command+['--check'],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0)
            self.assertEqual((mirror/'scripts/owner_rating.py').read_text(),'drift')


if __name__=='__main__': unittest.main()
