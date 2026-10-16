import importlib.util
import unittest
from pathlib import Path

class PublicRowTests(unittest.TestCase):
    def test_projection_is_allowlisted_not_a_path_redaction(self):
        spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build_lineage.py'))
        self.assertTrue(Path(spec.origin).exists(), 'public lineage builder must exist')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        row = dict(theme='day', version='v42', date='2026-10-01T12:00:00+00:00',
                   date_source='ledger citation: /private/secret.tsv', phase='Day dream-loop · rounds/r73/capture.png',
                   status='kept', hash='a'*64, path='/private/customer/image.png', subject='PRIVATE CUSTOMER',
                   notes='token=private', occurrences=[{'secret': 'private'}])
        actual = module.public_row(row)
        self.assertEqual(set(actual), {'theme','version','date','dateSource','phase','status','hash','caption'})
        self.assertEqual(actual['dateSource'], 'ledger citation')
        self.assertEqual(actual['phase'], 'Day dream-loop')
        self.assertEqual(actual['caption'], 'Day · r73')
        self.assertNotIn('private', str(actual).lower())
        with self.assertRaises(ValueError):
            module.public_row({**row, 'theme': '../secret'})
        with self.assertRaises(ValueError):
            module.public_row({**row, 'hash': '../../secret'})
        with self.assertRaises(ValueError):
            module.public_row({**row, 'date_source': 'unknown secret'})

if __name__ == '__main__': unittest.main()
