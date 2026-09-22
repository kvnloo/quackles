"""Opt-in integration tests on immutable real files; no visual pass threshold."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent


@unittest.skipUnless(os.environ.get("STONE_TEST_WORK"), "requires actual preserved Day files")
class ActualFileTests(unittest.TestCase):
    def test_actual_reference_saved_images_and_refusal_to_overwrite(self):
        work = Path(os.environ["STONE_TEST_WORK"])
        ref = work / "calibration/references/day.png"
        saved = work / "cinematic/stone-extract/morph/mosaic/new-beauty-s256.png"
        before = {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ref, saved)}
        self.assertEqual(before[str(ref)], "1481b570e247a9420c39a634d9019142d3b03160d07d00cb9051dffcfca27891")
        with tempfile.TemporaryDirectory(prefix="stone-files-", dir=os.environ["TMPDIR"]) as tmp:
            out = Path(tmp) / "measurements"
            cmd = [sys.executable, "-B", str(HERE / "measure_stone.py"), "--image", f"reference={ref}", "--image", f"saved={saved}", "--out", str(out)]
            result = subprocess.run(cmd, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((out / "measurements.json").read_text())
            self.assertEqual(len(report["images"]), 2)
            self.assertEqual(report["contract"], "day-stone/1.0.0")
            original = np.array(Image.open(ref).convert("RGB"))[1365:1505, 430:900]
            np.testing.assert_array_equal(np.array(Image.open(out / "reference/crop.png")), original)
            for image in report["images"]:
                self.assertEqual(image["source_sha256"], before[image["source"]])
                self.assertEqual(set(image["modes"]), {"unmasked", "ink_excluded", "shared_ink_excluded"})
            second = subprocess.run(cmd, text=True, capture_output=True)
            self.assertNotEqual(second.returncode, 0)
            self.assertIn("exists", second.stderr.lower())
        self.assertEqual(before, {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ref, saved)})

    def test_existing_unmasked_cli_still_reproduces_older_scalar_receipt(self):
        work = Path(os.environ["STONE_TEST_WORK"])
        sweep = work / "cinematic/stone-extract/morph/scale-sweep"
        cp = subprocess.run([sys.executable, "-B", str(sweep / "measure_pores.py"), str(work / "calibration/references/day.png")], capture_output=True, text=True)
        self.assertEqual(cp.returncode, 0, cp.stderr)
        actual = json.loads(cp.stdout)
        expected = json.loads((sweep / "scalar-scores.json").read_text())["reference"]
        self.assertEqual(actual, expected)
        self.assertEqual(actual["components"], 1059)
        self.assertEqual(actual["mm_per_px"], .563888888888889)


if __name__ == "__main__":
    unittest.main()
