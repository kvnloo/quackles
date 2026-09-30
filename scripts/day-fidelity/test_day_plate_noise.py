"""Day plate render-noise contract (issue #41 item 1). Expresses the user-visible requirement on the plate FILES,
independent of how they were produced:
  1. NOISE: no Day frame may be speckled more than 2x the median of its sibling Day frames (robot region).
  2. AUTHORED LOOK: the hero plate's tone/colour/lighting (low-pass) must match the previously shipped hero within
     dE 1.5 / |dL| 1.0 — i.e. only noise may change. The previous hero is fetched by hash from git.
Speckle = fraction of robot-region pixels whose luma differs from their 3x3 median by more than 40 levels.
The 2x-of-siblings bound is derived from data: siblings 0.0018-0.0062 (median ~0.0044); noisy hero 0.0419.
"""
import glob, hashlib, subprocess, sys, unittest
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts" / "inspection-audit"))
import audit as a  # dE / Lab

DAY = ROOT / "public/preview-scene/sequence/cinematic-proof-v2/day"
BOX = (350, 400, 890, 1210)
PREV_HERO_SHA = "26884144fcad9503c18dc615aa28e4f18d6d6fd08e6ef288032a7f618875c8c7"
PREV_HERO_GIT = "c2d84b6:public/preview-scene/sequence/cinematic-proof-v2/day/p0000000-1024.png"

def luma(im):
    x = np.asarray(im.convert("RGB")).astype(np.float64)[BOX[1]:BOX[3], BOX[0]:BOX[2]]
    return x[..., 0] * .2126 + x[..., 1] * .7152 + x[..., 2] * .0722

def median3(l):
    p = np.pad(l, 1, mode="edge"); h, w = l.shape
    stack = np.stack([p[dy:dy + h, dx:dx + w] for dy in range(3) for dx in range(3)])
    return np.median(stack, axis=0)

def speckle(path_or_img, T=40):
    im = Image.open(path_or_img) if isinstance(path_or_img, (str, Path)) else path_or_img
    l = luma(im); return float((np.abs(l - median3(l)) > T).mean())

THEMES = ("day", "white", "blue", "dark", "night")
def frames(theme="day"):
    return sorted(Path(p) for p in glob.glob(str(DAY.parent / theme / "p*-1024.*")))

class DayNoise(unittest.TestCase):
    def test_primitive_speckle(self):
        flat = Image.new("RGB", (1024, 1536), (120, 120, 120)); self.assertEqual(speckle(flat), 0.0)
        rng = np.random.default_rng(0); n = np.asarray(flat).copy().astype(int); n += rng.choice([-80, 0, 80], n.shape, p=[.1, .8, .1])
        self.assertGreater(speckle(Image.fromarray(np.clip(n, 0, 255).astype(np.uint8))), 0.05)

    def test_no_frame_is_noisier_than_twice_its_siblings(self):
        # every theme, every frame: measured 2026-09-30 all 80 plates within 1.9x of their sibling median after the Day hero fix
        for theme in THEMES:
            fs = frames(theme); self.assertEqual(len(fs), 16, theme)
            vals = {f.name: speckle(f) for f in fs}
            for f in fs:
                sib = sorted(v for k, v in vals.items() if k != f.name); bound = 2 * sib[len(sib) // 2]
                self.assertLessEqual(vals[f.name], bound, f"{theme}/{f.name} speckle {vals[f.name]:.5f} > 2x sibling median {bound:.5f}")

    def test_hero_only_changes_noise_not_the_authored_look(self):
        prev_bytes = subprocess.run(["git", "show", PREV_HERO_GIT], cwd=ROOT, capture_output=True, check=True).stdout
        self.assertEqual(hashlib.sha256(prev_bytes).hexdigest(), PREV_HERO_SHA)
        import io
        prev = Image.open(io.BytesIO(prev_bytes)).convert("RGB"); cur = Image.open(DAY / "p0000000-1024.png").convert("RGB")
        self.assertEqual(prev.size, cur.size)
        lp = lambda x: np.asarray(x.filter(ImageFilter.GaussianBlur(6)))
        de = a.delta_e(lp(prev), lp(cur)); dl = float((a.srgb_to_lab(lp(cur))[..., 0] - a.srgb_to_lab(lp(prev))[..., 0]).mean())
        self.assertLessEqual(de, 1.5, f"low-pass dE {de:.2f}"); self.assertLessEqual(abs(dl), 1.0, f"low-pass dL {dl:+.2f}")

if __name__ == "__main__":
    unittest.main()
