"""The gate against the real Quackles masters, pyramids and shipped plates.

Skipped when the local masters are absent (CI). CPU only: masters are reduced
chunk-by-chunk (a 1GP master is never resident) and pyramids are checked on
sampled tiles. Run: QC_REALDATA=1 python3 -m unittest tools/compiler/tests/test_realdata.py
"""
from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(HERE.parent))

from qcompiler import api  # noqa: E402

MASTER_201 = Path("/mnt/zer0models/quackles-200mp/blue-p0-200mp.png")
GP_ROOT = Path("/mnt/zer0models/quackles-1gp")
ASSETS = GP_ROOT / "assets-repo"
PLATES = REPO / "public/preview-scene/sequence/cinematic-proof-v2"
MOSS = REPO / "public/preview-scene/sequence/hidden/night-moss.png"
MANIFEST = REPO / "public/preview-scene/sequence/manifest.json"
POLICY = REPO / "lib/sequence/inspection-source.ts"
THEMES = ("day", "white", "blue", "dark", "night")

ENABLED = os.environ.get("QC_REALDATA") == "1" and MASTER_201.exists() and ASSETS.exists()


def failed(proof):
    return {c["name"] for c in proof["checks"] if not c["pass"]}


@unittest.skipUnless(ENABLED, "set QC_REALDATA=1 with the local masters mounted")
class RealData(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = Path(tempfile.mkdtemp(prefix="qc-real-"))
        cls.reg = cls.tmp / "registry"
        cls.proofs = {}

    @classmethod
    def tearDownClass(cls):
        keep = os.environ.get("QC_KEEP")
        if keep:
            shutil.copytree(cls.reg, keep, dirs_exist_ok=True)
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def register_201(self):
        if not (self.reg / "masters/blue-201mp.json").exists():
            api.register(self.reg, "blue-201mp", theme="blue", family="legacy-201mp", source=MASTER_201,
                         recipe="render_blue_200mp.py@72b0786", sidecar=MASTER_201.with_suffix(".json"))

    def register_gp(self, scene):
        mid = f"{scene}-1gp-r1"
        if not (self.reg / f"masters/{mid}.json").exists():
            api.register(self.reg, mid, theme=scene, family="gp-1gp", source=GP_ROOT / scene / "chunks",
                         recipe="render_1gp.py")
        return mid

    def test_1_blue_201mp_accepts_against_shipped_hero(self):
        self.register_201()
        plate = PLATES / "blue/p0000000-1024.webp"
        api.adopt(self.reg, "blue-201mp", "plate", plate, url="cinematic-proof-v2/blue/p0000000-1024.webp")
        api.adopt(self.reg, "blue-201mp", "pyramid", ASSETS / "blue/p0000000", url="/quackles-assets/blue/p0000000")
        proof = api.verify(self.reg, "blue-201mp", plate=plate, pyramid=ASSETS / "blue/p0000000",
                           out_dir=self.reg / "proofs")
        full = proof["checks_by_name"]["plate-vs-master"]["metrics"]["full"]
        self.assertEqual(proof["verdict"], "ACCEPT", failed(proof))
        self.assertLessEqual(full["dE"], 5.0)
        self.assertGreater(full["dE"], 3.0)  # the frozen contract held at ~4.9, not trivially 0
        self.assertLessEqual(abs(full["dL"]), 3.0)
        type(self).proofs["blue-201mp"] = proof

    def test_2_mushroom_1gp_accepts_against_its_plate(self):
        mid = self.register_gp("mushroom")
        api.adopt(self.reg, mid, "plate", MOSS, url="/preview-scene/sequence/hidden/night-moss.png")
        api.adopt(self.reg, mid, "pyramid", ASSETS / "mushroom/p0000000/gp", url="/quackles-assets/mushroom/p0000000/gp")
        proof = api.verify(self.reg, mid, plate=MOSS, pyramid=ASSETS / "mushroom/p0000000/gp", out_dir=self.reg / "proofs")
        self.assertEqual(proof["verdict"], "ACCEPT", failed(proof))
        type(self).proofs["mushroom"] = proof

    def test_3_wrong_scene_1gp_refused_against_todays_plates(self):
        for theme in THEMES:
            with self.subTest(theme=theme):
                mid = self.register_gp(theme)
                ext = "png" if (PLATES / theme / "p0000000-1024.png").exists() else "webp"
                plate = PLATES / theme / f"p0000000-1024.{ext}"
                api.adopt(self.reg, mid, "plate", plate)
                api.adopt(self.reg, mid, "pyramid", ASSETS / f"{theme}/p0000000/gp", url=f"/quackles-assets/{theme}/p0000000/gp")
                proof = api.verify(self.reg, mid, plate=plate, pyramid=ASSETS / f"{theme}/p0000000/gp",
                                   out_dir=self.reg / "proofs")
                self.assertEqual(proof["verdict"], "REFUSE")
                self.assertIn("plate-vs-master", failed(proof))
                # the pyramid itself is a faithful derivative of its (wrong) master: the refusal is about scene identity
                self.assertNotIn("pyramid-level0", failed(proof))

    def test_4_raw_dev_manifest_mixes_blue_families(self):
        self.register_201()
        api.adopt(self.reg, "blue-201mp", "pyramid", ASSETS / "blue/p0000000", url="/quackles-assets/blue/p0000000")
        mid = self.register_gp("blue")
        api.adopt(self.reg, mid, "pyramid", ASSETS / "blue/p0000000/gp", url="/quackles-assets/blue/p0000000/gp")
        rep = api.check_manifest(self.reg, json.loads(MANIFEST.read_text()), root=REPO / "public/preview-scene/sequence")
        self.assertFalse(rep["ok"])
        mixed = [p for p in rep["problems"] if p["rule"] == "one-family" and p["theme"] == "blue"]
        self.assertTrue(mixed, rep["problems"][:5])
        self.assertEqual(set(mixed[0]["masters"]), {"blue-201mp", mid})

    def test_5_policy_filtered_manifest_passes_once_blue_201mp_is_promoted(self):
        if "blue-201mp" not in self.proofs:
            self.test_1_blue_201mp_accepts_against_shipped_hero()
        api.promote(self.reg, self.proofs["blue-201mp"]["proof_path"])
        rep = api.check_manifest(self.reg, json.loads(MANIFEST.read_text()), policy=POLICY,
                                 root=REPO / "public/preview-scene/sequence")
        self.assertTrue(rep["ok"], rep["problems"][:5])


if __name__ == "__main__":
    unittest.main()
