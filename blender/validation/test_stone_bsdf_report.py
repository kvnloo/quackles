"""Real-file checks for ablation extraction and reporting."""
import hashlib
import json
import os
from pathlib import Path
import unittest

import numpy as np
from PIL import Image


@unittest.skipUnless(os.environ.get("STONE_BSDF_OUTPUT"), "requires actual BSDF evidence")
class BsdfReportTests(unittest.TestCase):
    def test_blender_display_export_is_hash_linked_and_roundtrips_composite(self):
        root = Path(os.environ["STONE_BSDF_OUTPUT"])
        path = root / "display" / "display-receipt.json"
        self.assertTrue(path.exists(), "Blender display conversion not run")
        receipt = json.loads(path.read_text())
        manifest = json.loads((root / "prepared/manifest.json").read_text())
        self.assertEqual(set(receipt["outputs"]), set(manifest["arrays"]))
        for row in receipt["outputs"].values():
            self.assertEqual(hashlib.sha256(Path(row["path"]).read_bytes()).hexdigest(), row["sha256"])
            with Image.open(row["path"]) as image:
                self.assertEqual(image.size, (470, 140))
        actual = np.asarray(Image.open(root / "render/composite.png"))
        converted = np.asarray(Image.open(receipt["outputs"]["composite"]["path"]))
        # Exact roundtrip failure is preserved separately, not converted into a tolerance.
        control_path = root / "measurements/measurements.json"
        self.assertTrue(control_path.exists(), "Exact display failure must be reported")
        control = json.loads(control_path.read_text())["controls"]["display_roundtrip"]
        delta = np.abs(actual.astype(np.float64)-converted.astype(np.float64))
        self.assertEqual(control["exact"], bool(np.array_equal(actual, converted)))
        self.assertEqual(control["changed_channels"], int(np.count_nonzero(delta)))
        self.assertEqual(control["max_abs"], float(delta.max()))

    def test_strict_gates_remain_failing_without_a_numeric_tolerance(self):
        import subprocess
        import sys
        script = Path(__file__).with_name("verify_stone_bsdf.py")
        self.assertTrue(script.exists(), "Explicit bit-exact gates not implemented")
        root = Path(os.environ["STONE_BSDF_OUTPUT"])
        command = [sys.executable, "-B", str(script), "--root", str(root)]
        result = subprocess.run(command, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout+result.stderr)
        for flag in ("--require-reconstruction-exact", "--require-display-exact", "--require-prior-linear-exact"):
            result = subprocess.run(command+[flag], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1, result.stdout+result.stderr)
            self.assertIn("exact", result.stdout)

    def test_report_uses_the_pinned_shared_mask_for_both_domains_and_native_panels(self):
        from stone_contract import analyze
        root = Path(os.environ["STONE_BSDF_OUTPUT"])
        path = root / "measurements/measurements.json"
        self.assertTrue(path.exists(), "Actual ablation measurement not executed")
        report = json.loads(path.read_text())
        manifest = json.loads((root / "prepared/manifest.json").read_text())
        self.assertEqual(report["mask_sha256"], manifest["mask_sha256"])
        self.assertEqual(set(report["measurements"]), set(manifest["arrays"]) | {"reference", "legacy-beauty", "legacy-emission"})
        mask = np.asarray(Image.open(manifest["mask_path"])) > 0
        for name in ("combined", "diffuse", "glossy", "without-glossy", "without-diffuse-indirect"):
            data = np.load(manifest["arrays"][name]["path"])
            expected, _ = analyze(data*255., mask, domain="scene-linear-rgb-times255")
            self.assertEqual(report["measurements"][name]["linear"], expected)
            self.assertEqual(report["measurements"][name]["display"]["mask"]["valid_pixels"], 58152)
        self.assertFalse(report["controls"]["reconstruction_full"]["exact"])
        self.assertTrue(report["controls"]["composite_minus_combined"]["exact"])
        for row in report["panels"]:
            image = np.asarray(Image.open(row["path"]))
            self.assertEqual(hashlib.sha256(Path(row["path"]).read_bytes()).hexdigest(), row["sha256"])
            for tile in row["tiles"]:
                expected = np.asarray(Image.open(tile["source"]).convert("RGB"))
                x, y = tile["xy"]
                np.testing.assert_array_equal(image[y:y+140, x:x+470], expected)
        self.assertEqual(hashlib.sha256(Path(report["graph"]["path"]).read_bytes()).hexdigest(), report["graph"]["sha256"])

    def test_preparation_reads_actual_passes_keeps_shared_mask_and_weights_colors(self):
        root = Path(os.environ["STONE_BSDF_OUTPUT"])
        manifest_path = root / "prepared" / "manifest.json"
        self.assertTrue(manifest_path.exists(), "Actual pass preparation not run")
        manifest = json.loads(manifest_path.read_text())
        self.assertEqual(manifest["contract"], "day-stone/1.0.0")
        self.assertEqual(manifest["mask_sha256"], "4e4ea9cb0b036c094b98c80e6b441e8abc6bc3e997c89cf9ea3ad77cca132468")
        mask = np.asarray(Image.open(manifest["mask_path"])) > 0
        self.assertEqual(int(mask.sum()), 58152)
        self.assertEqual(hashlib.sha256(Path(manifest["mask_path"]).read_bytes()).hexdigest(), manifest["mask_sha256"])
        arrays = {}
        for name, row in manifest["arrays"].items():
            self.assertEqual(hashlib.sha256(Path(row["path"]).read_bytes()).hexdigest(), row["sha256"])
            arrays[name] = np.load(row["path"], allow_pickle=False)
            self.assertEqual(arrays[name].shape, (140, 470, 3))
            self.assertTrue(np.isfinite(arrays[name]).all())
        np.testing.assert_array_equal(arrays["diffuse-direct"], (arrays["raw-diffuse-color"].astype(np.float64)*arrays["raw-diffuse-direct"]).astype(np.float32))
        np.testing.assert_array_equal(arrays["glossy-indirect"], (arrays["raw-glossy-color"].astype(np.float64)*arrays["raw-glossy-indirect"]).astype(np.float32))
        self.assertIn("combined", arrays)
        self.assertIn("composite", arrays)
        self.assertIn("without-glossy", arrays)
        self.assertIn("without-diffuse-indirect", arrays)
        self.assertIn("prior-emission", arrays)
        self.assertEqual(manifest["missing_passes"], [])


if __name__ == "__main__":
    unittest.main()
