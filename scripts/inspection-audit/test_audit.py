import sys, tempfile, unittest
from pathlib import Path
import numpy as np
from PIL import Image
sys.path.insert(0, str(Path(__file__).parent))
import audit as a

class Prims(unittest.TestCase):
    def test_lab_known_values(self):
        lab = a.srgb_to_lab(np.array([[[255, 255, 255], [0, 0, 0], [255, 0, 0]]], np.uint8))[0]
        np.testing.assert_allclose(lab[0], [100, 0, 0], atol=0.05)
        np.testing.assert_allclose(lab[1], [0, 0, 0], atol=0.05)
        np.testing.assert_allclose(lab[2], [53.24, 80.09, 67.20], atol=0.3)  # sRGB red, D65

    def test_delta_e_identical_zero_and_positive(self):
        x = np.random.default_rng(1).integers(0, 255, (16, 16, 3), dtype=np.uint8)
        self.assertEqual(a.delta_e(x, x), 0.0)
        self.assertGreater(a.delta_e(x, 255 - x), 10)

    def test_registration_recovers_known_shift(self):
        rng = np.random.default_rng(2); base = rng.integers(0, 255, (128, 96), dtype=np.uint8)
        img = np.stack([base] * 3, -1); shifted = np.roll(img, (3, -5), (0, 1))
        dy, dx = a.registration_shift(img, shifted)
        self.assertEqual((round(dy), round(dx)), (-3, 5))
        self.assertEqual(a.registration_shift(img, img), (0.0, 0.0))

    def test_crop_stitch_uses_right_tiles_and_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            d = Path(d); (d / "1").mkdir()
            # level 1: 8x4 px image, tileSize 4 -> 2x1 tiles; left tile red, right tile blue
            Image.new("RGB", (4, 4), (255, 0, 0)).save(d / "1" / "0_0.png")
            Image.new("RGB", (4, 4), (0, 0, 255)).save(d / "1" / "1_0.png")
            fam = a.Family("t", str(d), {1: (8, 4)}, tile=4, ext="png")
            img, nbytes, tiles = a.crop(fam, 1, (0.5, 0.0, 0.5, 1.0), out=(4, 4))
            self.assertEqual(tiles, 1)
            self.assertEqual(tuple(np.asarray(img)[0, 0]), (0, 0, 255))
            self.assertGreater(nbytes, 0)

    def test_level_choice(self):
        fam = a.Family("t", "/x", {0: (1600, 2400), 1: (800, 1200), 2: (400, 600)}, tile=512)
        self.assertEqual(a.pick_level(fam, zoom=1, out_w=400), 2)
        self.assertEqual(a.pick_level(fam, zoom=2, out_w=400), 1)
        self.assertEqual(a.pick_level(fam, zoom=8, out_w=400), 0)  # max useful = largest

class Verdict(unittest.TestCase):
    def test_frozen_contract_boundaries(self):
        self.assertEqual(a.verdict(5.0, 3.0), "pass")
        self.assertEqual(a.verdict(5.01, 0), "marginal")
        self.assertEqual(a.verdict(4, 3.01), "marginal")
        self.assertEqual(a.verdict(10.5, 0), "diverges")

if __name__ == "__main__":
    unittest.main()
