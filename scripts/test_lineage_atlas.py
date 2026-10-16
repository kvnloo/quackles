"""Exercise the actual build-time atlas, including content identity and every UV."""
import hashlib
import json
from pathlib import Path
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]

class AtlasTest(unittest.TestCase):
    def test_transfer_budget(self):
        name = json.loads((ROOT / 'content/lineage-atlas.json').read_text())['dataset']
        atlas = json.loads((ROOT / 'public/lineage' / name).read_text())
        self.assertLessEqual(sum(p['bytes'] for p in atlas['pages']), 3_000_000)

    def test_complete_content_bound_atlas(self):
        descriptor = ROOT / 'content/lineage-atlas.json'
        self.assertTrue(descriptor.exists(), 'build-time atlas is missing')
        name = json.loads(descriptor.read_text())['dataset']
        raw = (ROOT / 'public/lineage' / name).read_bytes()
        self.assertIn(hashlib.sha256(raw).hexdigest()[:16], name)
        atlas = json.loads(raw)
        archive = json.loads((ROOT / 'content/lineage.json').read_text())
        data = (ROOT / 'public/lineage' / archive['dataset']).read_bytes()
        self.assertEqual(atlas['datasetSha256'], hashlib.sha256(data).hexdigest())
        entries = json.loads(data)['entries']
        self.assertEqual(len(atlas['sprites']), len(entries))
        self.assertEqual(len({s['key'] for s in atlas['sprites']}), 665)
        pages = []
        for page in atlas['pages']:
            raw = (ROOT / 'public/lineage' / page['file']).read_bytes()
            self.assertIn(hashlib.sha256(raw).hexdigest()[:16], page['file'])
            self.assertEqual(len(raw), page['bytes'])
            image = Image.open(ROOT / 'public/lineage' / page['file'])
            self.assertEqual(image.size, (page['width'], page['height']))
            pages.append(image)
        for entry, sprite in zip(entries, atlas['sprites']):
            self.assertEqual(sprite['key'], entry['theme']+'/'+entry['version'])
            self.assertEqual(sprite['theme'], entry['theme'])
            self.assertEqual(sprite['status'], entry['status'])
            self.assertEqual(sprite['date'], entry['date'])
            u,v,w,h = sprite['uv']
            self.assertTrue(0 <= u < u+w <= 1 and 0 <= v < v+h <= 1)
            image = pages[sprite['page']]
            crop = image.crop((round(u*image.width),round(v*image.height),round((u+w)*image.width),round((v+h)*image.height)))
            self.assertGreater(sum(crop.convert('RGB').getextrema()[i][1]-crop.convert('RGB').getextrema()[i][0] for i in range(3)), 0)
            self.assertEqual(hashlib.sha256(crop.convert('RGB').tobytes()).hexdigest(), sprite.get('decodedSha256'), 'atlas crop must match its content-bound decoded identity')

if __name__ == '__main__':
    unittest.main()
