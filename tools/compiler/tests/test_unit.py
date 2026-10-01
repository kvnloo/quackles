"""Gate behaviour on synthetic masters. Fast (seconds), no real data.

Run: python3 -m unittest discover -s tools/compiler/tests -p 'test_*.py'
"""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from helpers import scene, write_chunks  # noqa: E402
from qcompiler import api  # noqa: E402
from qcompiler.api import Refused  # noqa: E402


def sha(p: Path) -> str:
    return hashlib.sha256(Path(p).read_bytes()).hexdigest()


def failed(proof: dict) -> set[str]:
    return {c["name"] for c in proof["checks"] if not c["pass"]}


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="qc-unit-"))
        self.reg = self.tmp / "registry"
        self.blend = self.tmp / "scene.blend"
        self.blend.write_bytes(b"fake blend")
        self.edits = self.tmp / "edits.json"
        self.edits.write_text('{"wall": 1}')

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def master(self, mid="a", seed=0, theme="blue", tint=(0, 0, 0)) -> dict:
        p = self.tmp / f"{mid}.png"
        scene(seed=seed, tint=tint).save(p)
        return api.register(self.reg, mid, theme=theme, family=f"{mid}-family", source=p,
                            recipe="unit-recipe", blend=self.blend, edits=self.edits,
                            renderer={"engine": "CYCLES", "samples": 16})


class Register(Base):
    def test_single_master_provenance(self):
        m = self.master()
        self.assertEqual(m["sha256"], sha(self.tmp / "a.png"))
        self.assertEqual((m["width"], m["height"]), (640, 960))
        self.assertEqual(m["recipe"]["id"], "unit-recipe")
        self.assertEqual(m["blend"]["sha256"], sha(self.blend))
        self.assertEqual(m["edits"]["sha256"], sha(self.edits))
        self.assertEqual(m["renderer"]["samples"], 16)
        self.assertTrue((self.reg / "masters" / "a.json").exists())

    def test_chunked_master_identity_is_content_addressed(self):
        img = scene()
        d = write_chunks(img, self.tmp / "chunks", 2, 2)
        m = api.register(self.reg, "c", theme="blue", family="f", source=d, recipe="r")
        self.assertEqual((m["width"], m["height"]), (640, 960))
        self.assertEqual(len(m["chunks"]), 4)
        again = api.register(self.reg, "c2", theme="blue", family="f", source=d, recipe="r")
        self.assertEqual(m["sha256"], again["sha256"])
        scene(seed=9).crop((0, 0, 320, 480)).save(d / "c1_1.png")
        (d / "c1_1.json").unlink()
        changed = api.register(self.reg, "c3", theme="blue", family="f", source=d, recipe="r")
        self.assertNotEqual(m["sha256"], changed["sha256"])

    def test_sidecar_hash_mismatch_is_refused(self):
        d = write_chunks(scene(), self.tmp / "chunks", 2, 2)
        scene(seed=3).crop((0, 0, 320, 480)).save(d / "c0_0.png")  # sidecar now stale
        with self.assertRaises(Refused):
            api.register(self.reg, "bad", theme="blue", family="f", source=d, recipe="r")

    def test_reregistering_an_id_with_different_content_is_refused(self):
        self.master("a", seed=0)
        with self.assertRaises(Refused):
            self.master("a", seed=1)


class PlateGate(Base):
    def test_derived_plate_is_accepted_and_records_parent(self):
        m = self.master()
        d = api.derive_plate(self.reg, "a", self.tmp / "plate.webp", width=256)
        self.assertEqual(d["parent"], m["sha256"])
        self.assertEqual(d["sha256"], sha(self.tmp / "plate.webp"))
        proof = api.verify(self.reg, "a", plate=self.tmp / "plate.webp")
        self.assertEqual(proof["verdict"], "ACCEPT", proof)

    def test_recoloured_plate_is_refused(self):
        """The #43 failure: a recoloured scene presented as the canonical plate."""
        self.master()
        scene(tint=(-20, 5, 30)).resize((256, 384), Image.LANCZOS).save(self.tmp / "plate.png")
        api.adopt(self.reg, "a", "plate", self.tmp / "plate.png")
        proof = api.verify(self.reg, "a", plate=self.tmp / "plate.png")
        self.assertEqual(proof["verdict"], "REFUSE")
        self.assertIn("plate-vs-master", failed(proof))
        self.assertGreater(proof["checks_by_name"]["plate-vs-master"]["metrics"]["full"]["dE"], 5)

    def test_plate_without_provenance_is_refused(self):
        self.master()
        scene().resize((256, 384), Image.LANCZOS).save(self.tmp / "orphan.png")
        proof = api.verify(self.reg, "a", plate=self.tmp / "orphan.png")
        self.assertEqual(proof["verdict"], "REFUSE")
        self.assertIn("provenance", failed(proof))

    def test_plate_changed_after_derivation_is_refused(self):
        self.master()
        api.derive_plate(self.reg, "a", self.tmp / "plate.png", width=256)
        scene(seed=0).resize((256, 384), Image.BILINEAR).save(self.tmp / "plate.png")
        proof = api.verify(self.reg, "a", plate=self.tmp / "plate.png")
        self.assertIn("provenance", failed(proof))


class PyramidGate(Base):
    def test_derived_pyramid_nests_and_is_accepted(self):
        self.master()
        api.derive_pyramid(self.reg, "a", self.tmp / "pyr", tile=64, min_width=128)
        proof = api.verify(self.reg, "a", pyramid=self.tmp / "pyr")
        self.assertEqual(proof["verdict"], "ACCEPT", failed(proof))
        levels = proof["checks_by_name"]["pyramid-nesting"]["metrics"]["pairs"]
        self.assertGreaterEqual(len(levels), 2)

    def test_non_nesting_level_is_refused(self):
        self.master()
        pyr = self.tmp / "pyr"
        api.derive_pyramid(self.reg, "a", pyr, tile=64, min_width=128)
        for t in (pyr / "1").glob("*.webp"):  # level 1 replaced by another scene's pixels
            im = Image.open(t)
            scene(seed=7).resize(im.size).save(t, "WEBP", quality=90)
        api.adopt(self.reg, "a", "pyramid", pyr)  # re-claim the tampered tree
        proof = api.verify(self.reg, "a", pyramid=pyr)
        self.assertEqual(proof["verdict"], "REFUSE")
        self.assertIn("pyramid-nesting", failed(proof))

    def test_displaced_level_is_refused(self):
        """Same pixels, 1 px off: colour alone would pass, registration must not."""
        self.master()
        pyr = self.tmp / "pyr"
        api.derive_pyramid(self.reg, "a", pyr, tile=64, min_width=128)
        whole = Image.new("RGB", (320, 480))
        for t in (pyr / "1").glob("*.webp"):
            x, y = (int(v) for v in t.stem.split("_"))
            whole.paste(Image.open(t).convert("RGB"), (x * 64, y * 64))
        shifted = Image.fromarray(np.roll(np.asarray(whole), (1, 1), (0, 1)))
        for t in (pyr / "1").glob("*.webp"):
            x, y = (int(v) for v in t.stem.split("_"))
            shifted.crop((x * 64, y * 64, x * 64 + 64, y * 64 + 64)).save(t, "WEBP", quality=90)
        api.adopt(self.reg, "a", "pyramid", pyr)
        proof = api.verify(self.reg, "a", pyramid=pyr)
        self.assertIn("pyramid-nesting", failed(proof))

    def test_level0_from_another_master_is_refused(self):
        self.master("a", seed=0)
        self.master("b", seed=5)
        api.derive_pyramid(self.reg, "b", self.tmp / "pyr", tile=64, min_width=128)
        api.adopt(self.reg, "a", "pyramid", self.tmp / "pyr")
        proof = api.verify(self.reg, "a", pyramid=self.tmp / "pyr")
        self.assertEqual(proof["verdict"], "REFUSE")
        self.assertIn("pyramid-level0", failed(proof))


class Families(Base):
    def test_plate_and_pyramid_from_two_masters_is_refused(self):
        self.master("a", seed=0)
        self.master("b", seed=0, tint=(0, 0, 0))  # identical pixels, different identity
        api.derive_plate(self.reg, "a", self.tmp / "plate.png", width=256)
        api.derive_pyramid(self.reg, "b", self.tmp / "pyr", tile=64, min_width=128)
        proof = api.verify(self.reg, "a", plate=self.tmp / "plate.png", pyramid=self.tmp / "pyr")
        self.assertEqual(proof["verdict"], "REFUSE")
        self.assertIn("one-family", failed(proof))


class Promotion(Base):
    def accepted(self, mid="a", theme="blue", seed=0):
        self.master(mid, seed=seed, theme=theme)
        api.derive_plate(self.reg, mid, self.tmp / f"{mid}-plate.png", width=256)
        api.derive_pyramid(self.reg, mid, self.tmp / f"{mid}-pyr", tile=64, min_width=128)
        return api.verify(self.reg, mid, plate=self.tmp / f"{mid}-plate.png", pyramid=self.tmp / f"{mid}-pyr",
                          out_dir=self.reg / "proofs")

    def test_promote_accepted_proof_writes_ledger(self):
        proof = self.accepted()
        entry = api.promote(self.reg, proof["proof_path"])
        ledger = json.loads((self.reg / "promoted.json").read_text())
        self.assertEqual(ledger["blue"]["master_id"], "a")
        self.assertEqual(entry["master_sha256"], proof["master"]["sha256"])

    def test_refused_proof_cannot_be_promoted(self):
        self.master()
        scene(tint=(30, 0, -30)).resize((256, 384)).save(self.tmp / "p.png")
        api.adopt(self.reg, "a", "plate", self.tmp / "p.png")
        proof = api.verify(self.reg, "a", plate=self.tmp / "p.png", out_dir=self.reg / "proofs")
        with self.assertRaises(Refused):
            api.promote(self.reg, proof["proof_path"])

    def test_second_family_for_a_theme_is_refused_without_supersede(self):
        api.promote(self.reg, self.accepted("a")["proof_path"])
        second = self.accepted("b", seed=4)
        with self.assertRaises(Refused):
            api.promote(self.reg, second["proof_path"])
        api.promote(self.reg, second["proof_path"], supersede="a")
        ledger = json.loads((self.reg / "promoted.json").read_text())
        self.assertEqual(ledger["blue"]["master_id"], "b")
        self.assertEqual(ledger["blue"]["supersedes"], "a")

    def test_derivative_changed_after_proof_is_refused(self):
        proof = self.accepted()
        scene(seed=0).resize((256, 384), Image.NEAREST).save(self.tmp / "a-plate.png")
        with self.assertRaises(Refused):
            api.promote(self.reg, proof["proof_path"])


class Manifest(Base):
    def ladder(self, plate_url, plate_sha, *bases):
        v = [{"url": plate_url, "width": 256, "height": 384, "sha256": plate_sha}]
        for base in bases:
            v.append({"width": 640, "height": 960, "tiles": {"tileSize": 64, "overlap": 0, "columns": 10, "rows": 15,
                      "urlTemplate": f"{base}/0/{{x}}_{{y}}.webp"}})
        return {"version": 1, "id": "t", "themes": [{"id": "blue"}],
                "frames": [{"id": "p0000000", "assets": {"blue": v}}]}

    def setup_two(self):
        self.master("a", seed=0)
        self.master("b", seed=3)
        api.derive_plate(self.reg, "a", self.tmp / "plate.png", width=256, url="seq/blue/p0.png")
        api.derive_pyramid(self.reg, "a", self.tmp / "pa", tile=64, min_width=128, url="/assets/blue/p0")
        api.derive_pyramid(self.reg, "b", self.tmp / "pb", tile=64, min_width=128, url="/assets/blue/p0/gp")
        proof = api.verify(self.reg, "a", plate=self.tmp / "plate.png", pyramid=self.tmp / "pa", out_dir=self.reg / "proofs")
        api.promote(self.reg, proof["proof_path"])

    def test_single_family_ladder_passes(self):
        self.setup_two()
        m = self.ladder("seq/blue/p0.png", sha(self.tmp / "plate.png"), "/assets/blue/p0")
        rep = api.check_manifest(self.reg, m)
        self.assertTrue(rep["ok"], rep)

    def test_mixed_family_ladder_is_refused(self):
        self.setup_two()
        m = self.ladder("seq/blue/p0.png", sha(self.tmp / "plate.png"), "/assets/blue/p0", "/assets/blue/p0/gp")
        rep = api.check_manifest(self.reg, m)
        self.assertFalse(rep["ok"])
        self.assertTrue(any(p["rule"] == "one-family" for p in rep["problems"]), rep)

    def test_plate_hash_drift_is_refused(self):
        self.setup_two()
        m = self.ladder("seq/blue/p0.png", "0" * 64, "/assets/blue/p0")
        rep = api.check_manifest(self.reg, m)
        self.assertTrue(any(p["rule"] == "plate-provenance" for p in rep["problems"]), rep)

    def test_edited_proof_breaks_the_invariant(self):
        self.setup_two()
        proof = Path(json.loads((self.reg / "promoted.json").read_text())["blue"]["proof"])
        doc = json.loads(proof.read_text())
        doc["created_at"] = "edited"
        proof.write_text(json.dumps(doc))
        m = self.ladder("seq/blue/p0.png", sha(self.tmp / "plate.png"), "/assets/blue/p0")
        rep = api.check_manifest(self.reg, m)
        self.assertTrue(any(p["rule"] == "proof-integrity" for p in rep["problems"]), rep)

    def test_unregistered_tiles_are_refused(self):
        self.setup_two()
        m = self.ladder("seq/blue/p0.png", sha(self.tmp / "plate.png"), "/assets/elsewhere")
        rep = api.check_manifest(self.reg, m)
        self.assertTrue(any(p["rule"] == "promoted-source" for p in rep["problems"]), rep)


class Cli(Base):
    def test_verify_cli_exits_nonzero_and_writes_proof_and_report(self):
        self.master()
        scene(tint=(0, 0, 40)).resize((256, 384)).save(self.tmp / "p.png")
        api.adopt(self.reg, "a", "plate", self.tmp / "p.png")
        out = self.tmp / "proof"
        r = subprocess.run([sys.executable, str(HERE.parent / "compile.py"), "--registry", str(self.reg), "verify",
                            "a", "--plate", str(self.tmp / "p.png"), "--out", str(out)], capture_output=True, text=True)
        self.assertEqual(r.returncode, 1, r.stderr)
        proofs = list(out.glob("*.json"))
        reports = list(out.glob("*.md"))
        self.assertEqual((len(proofs), len(reports)), (1, 1))
        self.assertEqual(json.loads(proofs[0].read_text())["verdict"], "REFUSE")
        self.assertIn("REFUSE", reports[0].read_text())


if __name__ == "__main__":
    unittest.main()


class RepoInvariant(unittest.TestCase):
    """The build-time invariant, runnable in CI without the masters: the committed
    manifest + runtime policy only serve tiles from promoted masters, one family per
    ladder, and every promoted plate in public/ still hashes to its proof."""

    REPO = HERE.parents[2]

    def test_served_manifest_matches_promoted_registry(self):
        seq = self.REPO / "public/preview-scene/sequence"
        rep = api.check_manifest(HERE.parent / "registry", seq / "manifest.json",
                                 policy=self.REPO / "lib/sequence/inspection-source.ts", root=seq,
                                 hidden=seq / "hidden-pyramids.json")
        self.assertTrue(rep["ok"], json.dumps(rep["problems"][:5], indent=1))
        self.assertGreaterEqual(rep["ladders_with_tiles"], 2)  # blue hero + hidden mushroom

    def test_raw_manifest_still_mixes_blue_families(self):
        """Without the runtime policy the shipped manifest interleaves 201MP and 1GP Blue
        tiles in one width ladder - the #43 hazard, now caught statically."""
        seq = self.REPO / "public/preview-scene/sequence"
        rep = api.check_manifest(HERE.parent / "registry", seq / "manifest.json", root=seq)
        self.assertTrue(any(p["rule"] == "one-family" and p["theme"] == "blue" for p in rep["problems"]))

    def test_policy_parser_reads_the_runtime_switch(self):
        pol = api.parse_policy(self.REPO / "lib/sequence/inspection-source.ts")
        self.assertEqual(pol["blue"], ("legacy-201mp", "production-201-250mp"))
        self.assertEqual(pol["white"], (None, "disabled"))
        self.assertEqual(pol["mushroom"], ("gp-1gp", "production-1gp"))
