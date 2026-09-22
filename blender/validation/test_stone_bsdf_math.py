"""Synthetic math fixtures only; integration tests provide real render evidence."""
import importlib.util
from pathlib import Path
import unittest

import numpy as np


class BsdfMathTests(unittest.TestCase):
    def api(self):
        path = Path(__file__).with_name("stone_bsdf.py")
        self.assertTrue(path.exists(), "BSDF contribution math not implemented")
        spec = importlib.util.spec_from_file_location("stone_bsdf", path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return module

    def test_energy_budget_uses_shared_linear_luminance_not_display_or_channel_averages(self):
        api = self.api()
        self.assertTrue(hasattr(api, "energy_budget"), "linear budget missing")
        base = np.full((2, 2, 3), .5)
        a = base*.25
        b = base*.75
        mask = np.array([[True, True], [True, False]])
        a[1, 1] = 10
        row = api.energy_budget({"a": a, "b": b}, base, mask)
        self.assertAlmostEqual(row["a"]["luma_share"], .25)
        self.assertAlmostEqual(row["b"]["luma_share"], .75)
        self.assertAlmostEqual(row["a"]["mean_linear_luma"], .125)

    def test_leave_one_out_uses_linear_sum_without_clipping_or_renormalizing(self):
        api = self.api()
        self.assertTrue(hasattr(api, "ablations"), "leave-one-out algebra missing")
        terms = {"diffuse-direct": np.full((2, 2, 3), 1.5), "diffuse-indirect": np.full((2, 2, 3), .5), "glossy-direct": np.full((2, 2, 3), .25), "glossy-indirect": np.full((2, 2, 3), .125), "emission": np.full((2, 2, 3), .125)}
        variants = api.ablations(terms)
        np.testing.assert_array_equal(variants["without-glossy"], 2.125)
        np.testing.assert_array_equal(variants["without-diffuse-indirect"], 2.0)
        np.testing.assert_array_equal(variants["diffuse"], 2.0)
        np.testing.assert_array_equal(variants["direct"], 1.75)
        np.testing.assert_array_equal(variants["indirect"], .625)

    def test_rejects_missing_nonfinite_or_inconsistent_passes(self):
        api = self.api()
        names = [f"{f} {k}" for f in ("Diffuse", "Glossy", "Transmission") for k in ("Color", "Direct", "Indirect")]
        names += ["Emission", "Environment", "Volume Direct", "Volume Indirect"]
        p = {n: np.zeros((3, 4, 3)) for n in names}
        for bad in ({**p, "Diffuse Color": np.zeros((3, 1, 3))}, {**p, "Emission": np.full((3, 4, 3), np.nan)}, {n: v for n, v in p.items() if n != "Glossy Direct"}):
            with self.assertRaises(ValueError):
                api.contributions(bad)

    def test_reconstruction_weights_direct_indirect_by_own_color_and_adds_other_terms(self):
        api = self.api()
        p = {}
        for family, scale in (("Diffuse", 1), ("Glossy", 2), ("Transmission", 4)):
            p[family+" Color"] = np.full((3, 4, 3), .125*scale, np.float32)
            p[family+" Direct"] = np.full((3, 4, 3), .25*scale, np.float32)
            p[family+" Indirect"] = np.full((3, 4, 3), .5*scale, np.float32)
        for name in ("Emission", "Environment", "Volume Direct", "Volume Indirect"):
            p[name] = np.full((3, 4, 3), .125, np.float32)
        terms, total = api.contributions(p)
        np.testing.assert_array_equal(terms["diffuse-direct"], .03125)
        np.testing.assert_array_equal(terms["glossy-indirect"], .25)
        np.testing.assert_array_equal(terms["transmission-direct"], .5)
        np.testing.assert_array_equal(total, 2.46875)
        self.assertEqual(len(terms), 10)
        self.assertEqual(total.dtype, np.float64)


if __name__ == "__main__":
    unittest.main()
