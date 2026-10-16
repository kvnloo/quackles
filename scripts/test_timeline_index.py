import unittest
import json
import hashlib
from pathlib import Path
from timeline_index import build_index, THEMES
from build_lineage_timeline import main

ROOT = Path(__file__).resolve().parents[1]


class TimelineIndexTests(unittest.TestCase):
    def test_content_bound_index_and_complete_states(self):
        main()
        manifest = json.loads((ROOT / 'content/lineage.json').read_text())
        raw = (ROOT / 'public/lineage' / manifest['dataset']).read_bytes()
        rows = json.loads(raw)['entries']
        output = json.loads((ROOT / 'content/lineage-timeline.json').read_text())
        index = json.loads((ROOT / 'public/lineage' / output['dataset']).read_text())
        self.assertEqual(index['datasetSha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(sorted(index['order']), list(range(len(rows))))
        self.assertEqual(index['times'], sorted(index['times']))
        self.assertEqual(rows[index['order'][index['start']]]['theme'], 'blue')
        latest = [-1] * 5
        for i, source in enumerate(index['order']):
            latest[THEMES.index(rows[source]['theme'])] = i
            self.assertEqual(index['states'][i*5:i*5+5], latest)
        self.assertEqual(index['order'], build_index(rows)['order'])
        self.assertTrue(any(m['label'] == 'Theme ports begin' for m in index['milestones']))
        self.assertTrue(any(m['label'] == 'Night v2 begins' for m in index['milestones']))


if __name__ == '__main__':
    unittest.main()
