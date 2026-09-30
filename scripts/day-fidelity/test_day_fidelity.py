"""Contract tests for the Day-vs-reference measurement (issue #41 item 1).

Independent expectations: identical images -> zero error; a known uniform
offset -> exact known MAE; crop boxes are pinned; the locked reference hash is
the one recorded on fix/day-visual (day_look_ledger.json).
"""
import hashlib, subprocess, sys, unittest
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
import measure as m

REF_SHA = "1481b570e247a9420c39a634d9019142d3b03160d07d00cb9051dffcfca27891"
ROOT = Path(__file__).resolve().parents[2]

class Metrics(unittest.TestCase):
    def test_identical_is_zero(self):
        a = np.random.default_rng(0).integers(0, 255, (64, 48, 3), dtype=np.uint8)
        r = m.region_metrics(a, a)
        self.assertEqual(r["mae"], 0.0)
        self.assertEqual(r["mean_delta"], [0.0, 0.0, 0.0])

    def test_known_offset(self):
        a = np.full((10, 10, 3), 100, np.uint8); b = a + np.array([10, 20, 30], np.uint8)
        r = m.region_metrics(b, a)
        self.assertAlmostEqual(r["mae"], 20.0)
        self.assertEqual(r["mean_delta"], [10.0, 20.0, 30.0])

    def test_regions_inside_frame_and_named(self):
        for name, (x0, y0, x1, y1) in m.REGIONS.items():
            self.assertTrue(0 <= x0 < x1 <= 1024 and 0 <= y0 < y1 <= 1536, name)
        self.assertEqual(set(m.REGIONS), {"full", "robot", "plinth", "poster"})

class Chroma(unittest.TestCase):
    def test_bright_pixel_chroma_known_values(self):
        # 4 pixels: two bright neutral (200,200,200), one bright warm (240,220,160), one dark (10,0,0)
        a = np.array([[[200,200,200],[200,200,200],[240,220,160],[10,0,0]]], np.uint8)
        c = m.bright_chroma(a, thresh=120)
        self.assertEqual(c["n"], 3)
        self.assertAlmostEqual(c["r_minus_b"], (0 + 0 + 80) / 3, places=3)

class Actual(unittest.TestCase):
    def test_reference_is_hash_locked(self):
        ref = m.load_reference(ROOT)
        self.assertEqual(hashlib.sha256(ref.read_bytes()).hexdigest(), REF_SHA)

    def test_baseline_is_deterministic_and_reproduces_gap(self):
        r1 = m.measure(ROOT); r2 = m.measure(ROOT)
        self.assertEqual(r1, r2)
        self.assertEqual(r1["reference_sha256"], REF_SHA)
        self.assertIn("bright_chroma_plate", r1["regions"]["robot"])
        self.assertGreater(r1["regions"]["full"]["mae"], 0.0)  # the gap exists and is measured, not assumed

if __name__ == "__main__":
    unittest.main()
