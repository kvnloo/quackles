"""Actual Blender pass capture acceptance; no synthetic render substitution."""
import hashlib
import json
import os
from pathlib import Path
import unittest

import numpy as np


@unittest.skipUnless(os.environ.get("STONE_BSDF_OUTPUT"), "requires actual BSDF render")
class BsdfRenderTests(unittest.TestCase):
    def test_actual_pass_api_capture_preserves_prior_locks_and_float_channels(self):
        import OpenImageIO as oiio
        root = Path(os.environ["STONE_BSDF_OUTPUT"])
        path = root / "render" / "render-receipt.json"
        self.assertTrue(path.exists(), "Actual pass capture not executed yet")
        receipt = json.loads(path.read_text())
        self.assertEqual(receipt["source_base"], "0f42a301013c8430bb2e4f253fd668ab89e67594")
        self.assertTrue(receipt["prior_locks_equal_after_root_relocation"])
        self.assertEqual(receipt["material_interventions"], [])
        self.assertEqual(receipt["locks_before"], receipt["locks_after"])
        self.assertEqual(receipt["locks_before"]["cycles"]["samples"], 256)
        self.assertEqual(receipt["locks_before"]["render"]["threads"], 4)
        for name in ("diffuse", "glossy", "transmission"):
            for kind in ("direct", "indirect", "color"):
                self.assertTrue(receipt["pass_api"][f"use_pass_{name}_{kind}"])
        for row in receipt["outputs"].values():
            self.assertEqual(hashlib.sha256(Path(row["path"]).read_bytes()).hexdigest(), row["sha256"])
        src = oiio.ImageInput.open(receipt["outputs"]["passes.exr"]["path"])
        self.assertIsNotNone(src)
        spec = src.spec()
        self.assertEqual((spec.width, spec.height), (470, 140))
        names = list(spec.channelnames)
        rgb = src.read_image(format=oiio.FLOAT)
        src.close()
        self.assertIsNotNone(rgb)
        self.assertTrue(np.isfinite(np.asarray(rgb)).all())
        for name in ("Combined", "Diffuse Direct", "Diffuse Indirect", "Diffuse Color", "Glossy Direct", "Glossy Indirect", "Glossy Color", "Transmission Direct", "Transmission Indirect", "Transmission Color", "Emission", "Environment", "Volume Direct", "Volume Indirect"):
            for channel in "RGB":
                self.assertIn(f"{receipt['layer']}.{name}.{channel}", names)
        for source, expected in receipt["sources"].items():
            self.assertEqual(hashlib.sha256(Path(source).read_bytes()).hexdigest(), expected)
        self.assertEqual(hashlib.sha256(Path(receipt["donor"]).read_bytes()).hexdigest(), receipt["donor_sha256"])


if __name__ == "__main__":
    unittest.main()
