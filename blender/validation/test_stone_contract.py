"""Synthetic fixtures prove math only, never artistic appearance."""
import math
import unittest
import numpy as np
import stone_contract as contract


class StoneContractTests(unittest.TestCase):
    def require(self, name):
        self.assertTrue(callable(getattr(contract, name, None)), f"Missing behavior: {name}")
        return getattr(contract, name)

    def test_luma_is_display_rec709_weighted_float_not_uint8(self):
        luma = self.require("luma")
        rgb = np.array([[[255, 0, 0], [0, 255, 0], [0, 0, 255], [80, 80, 80]]], dtype=np.uint8)
        np.testing.assert_allclose(luma(rgb), [[255*.2126, 255*.7152, 255*.0722, 80]], atol=1e-12)
        self.assertEqual(luma(rgb).dtype, np.float64)

    def test_photometry_counts_strict_dark_threshold_on_valid_domain(self):
        photometry = self.require("photometry")
        rgb = np.repeat(np.array([[0., 63., 64., 128.]] )[:, :, None], 3, axis=2)
        valid = np.array([[False, True, True, True]])
        result = photometry(rgb, valid)
        self.assertEqual(result["valid_pixels"], 3)
        self.assertAlmostEqual(result["luma_mean"], 85.)
        self.assertEqual(result["dark_pixels_lt64"], 1)
        self.assertAlmostEqual(result["dark_occupancy_lt64"], 1/3)
        np.testing.assert_allclose(result["luma_quantiles_p05_p50_p95"], np.percentile([63., 64., 128.], [5, 50, 95]))
        np.testing.assert_allclose(result["chromaticity_ratio_of_means"], [1/3]*3)
        with self.assertRaises(ValueError):
            photometry(rgb, np.zeros((1, 4), bool))

    def test_chromaticity_is_ratio_of_means_not_mean_of_ratios(self):
        photometry = self.require("photometry")
        rgb = np.array([[[90., 0., 0.], [0., 10., 0.]]])
        result = photometry(rgb, np.ones((1, 2), bool))
        np.testing.assert_allclose(result["chromaticity_ratio_of_means"], [.9, .1, 0])
        self.assertIsNone(photometry(rgb*0, np.ones((1, 2), bool))["chromaticity_ratio_of_means"])

    def test_plane_fits_only_valid_samples_and_removes_known_affine_field(self):
        residual = self.require("plane_residual")
        yy, xx = np.mgrid[:8, :9]
        signal = 11 + 2*xx + 3*yy.astype(float)
        valid = np.ones(signal.shape, bool)
        valid[1:3, 1:4] = False
        signal[~valid] = -999
        result, coef = residual(signal, valid)
        np.testing.assert_allclose(coef, [2, 3, 11], atol=1e-11)
        np.testing.assert_allclose(result[valid], 0, atol=1e-11)
        with self.assertRaises(ValueError):
            residual(signal, np.zeros(signal.shape, bool))

    def test_feature_diameter_spacing_and_eight_connectivity_in_pixel_units(self):
        features = self.require("features")
        residual = np.zeros((12, 16), float)
        residual[2, 2] = residual[3, 3] = -15  # Diagonal: one area-2 feature.
        residual[8:10, 10:12] = -15  # area 4, centroid (10.5, 8.5).
        residual[1, 8] = -14  # Strict threshold: excluded.
        valid = np.ones(residual.shape, bool)
        result, dark = features(residual, valid, mm_per_px=.5)
        self.assertEqual(result["components"], 2)
        self.assertEqual(result["areas_px"], [2, 4])
        self.assertEqual(result["dark_pixels"], 6)
        self.assertEqual(result["occupancy"], 6/192)
        expected = [2*math.sqrt(2/math.pi), 2*math.sqrt(4/math.pi)]
        np.testing.assert_allclose(result["diameter_px_p50_p90_p95"], np.percentile(expected, [50, 90, 95]))
        np.testing.assert_allclose(result["diameter_mm_p50_p90_p95"], np.percentile(expected, [50, 90, 95])*.5)
        self.assertAlmostEqual(result["nn_spacing_px_median"], 10.)
        self.assertAlmostEqual(result["nn_spacing_mm_median"], 5.)
        self.assertAlmostEqual(result["per_cm2"], 2/(192*.5*.5/100))
        self.assertEqual(result["boundary_components"], 0)
        valid[2, 2] = False
        changed, _ = features(residual, valid, mm_per_px=.5)
        self.assertEqual(changed["areas_px"], [1, 4])
        self.assertEqual(changed["boundary_components"], 1)
        self.assertEqual(int(dark.sum()), 6)

    def test_area_bins_have_explicit_half_open_edges_and_empty_components(self):
        bins = self.require("area_bins")
        result = bins(np.array([1, 4, 5, 16, 17, 32, 33]), valid_pixels=200)
        self.assertEqual([r["components"] for r in result], [2, 2, 2, 1])
        self.assertEqual([r["area_px"] for r in result], [5, 21, 49, 33])
        self.assertEqual(sum(r["occupancy_contribution"] for r in result), 108/200)
        result, dark = contract.features(np.zeros((3, 4)), np.ones((3, 4), bool))
        self.assertEqual(result["components"], 0)
        self.assertIsNone(result["diameter_px_p50_p90_p95"])
        self.assertIsNone(result["nn_spacing_px_median"])
        self.assertFalse(dark.any())

    def test_anisotropy_uses_only_neighbor_pairs_with_two_valid_endpoints(self):
        anisotropy = self.require("anisotropy")
        yy, xx = np.mgrid[:5, :6]
        signal = 2.*xx + yy
        valid = np.ones(signal.shape, bool)
        valid[2, 2] = False
        signal[~valid] = 9999
        result = anisotropy(signal, valid)
        self.assertEqual(result["horizontal_pairs"], 23)
        self.assertEqual(result["vertical_pairs"], 22)
        self.assertAlmostEqual(result["mean_dx2"], 4.)
        self.assertAlmostEqual(result["mean_dy2"], 1.)
        self.assertAlmostEqual(result["ratio_dx2_dy2"], 4.)
        self.assertIsNone(anisotropy(signal*0, valid)["ratio_dx2_dy2"])

    def test_density_uses_full_32px_bins_valid_denominators_and_population_variance(self):
        density = self.require("density")
        dark = np.zeros((65, 65), bool)
        valid = np.ones(dark.shape, bool)
        dark[:32, 32:64] = True
        dark[32:48, :32] = True
        dark[32:64, 32:64] = True
        valid[32:49, 32:64] = False  # Last full tile below 75% valid: omit.
        valid[:8, 32:64] = False  # Exactly 75% valid: keep.
        result = density(dark & valid, valid)
        self.assertEqual(result["tile_px"], 32)
        self.assertEqual(result["used_tiles"], 3)
        self.assertEqual(result["omitted_full_tiles"], 1)
        self.assertEqual(result["discarded_partial_pixels"], 129)
        self.assertEqual([row["valid_px"] for row in result["bins"] if row["used"]], [1024, 768, 1024])
        self.assertEqual([row["occupancy"] for row in result["bins"] if row["used"]], [0., 1., .5])
        self.assertAlmostEqual(result["variance_ddof0"], 1/6)

    def test_ink_mask_uses_signed_channels_fixed_dilation_and_left_guard(self):
        mask = self.require("ink_valid")
        rgb = np.full((12, 24, 3), 80, np.uint8)
        rgb[5, 18] = [20, 25, 40]
        rgb[1, 22] = [255, 100, 0]  # No uint8 wrapping into blue.
        valid = mask(rgb)
        expected = np.ones((12, 24), bool)
        expected[:, :12] = False
        expected[3:8, 16:21] = False
        np.testing.assert_array_equal(valid, expected)

    def test_spectrum_reports_pixel_bands_and_excludes_dc(self):
        spectrum = self.require("spectrum")
        yy, xx = np.mgrid[:128, :128]
        valid = np.ones(xx.shape, bool)
        fine = spectrum(np.cos(2*np.pi*xx/3), valid)
        mid = spectrum(np.cos(2*np.pi*xx/8), valid)
        self.assertGreater(fine["shares"]["2_to_4_px"], .99)
        self.assertGreater(mid["shares"]["4_to_12_px"], .99)
        self.assertIsNone(spectrum(xx*0., valid)["fine_to_mid"])

    def test_analyze_exposes_versioned_masked_receipt_and_rejects_nonfinite_rgb(self):
        analyze = self.require("analyze")
        rgb = np.full((64, 64, 3), 100.)
        rgb[31:33, 31:33] = 0
        valid = np.ones((64, 64), bool)
        result, planes = analyze(rgb, valid, domain="display-rgb255")
        self.assertEqual(result["contract"], "day-stone/1.0.0")
        self.assertEqual(result["domain"], "display-rgb255")
        self.assertEqual(result["features"]["components"], 1)
        self.assertEqual(result["features"]["dark_pixels"], 4)
        self.assertAlmostEqual(result["residual"]["std"], np.std(planes["residual"]))
        self.assertEqual(result["features"]["area_bins"][0]["components"], 1)
        rgb[0, 0, 0] = np.nan
        with self.assertRaises(ValueError):
            analyze(rgb, valid, domain="display-rgb255")
        with self.assertRaises(ValueError):
            analyze(np.ones((2, 2, 3)), np.ones((2, 2), bool), domain="unknown")

    def test_contract_can_serialize_edge_cases_without_nonstandard_nan_json(self):
        import json
        for rgb, valid in ((np.zeros((8, 8, 3)), np.ones((8, 8), bool)),
                           (np.full((8, 8, 3), 100.), np.eye(8, dtype=bool))):
            if np.all(valid):
                result, _ = contract.analyze(rgb, valid, domain="scene-linear-rgb-times255")
                json.dumps(result, allow_nan=False)
                self.assertIsNone(result["features"]["nn_spacing_px_median"])
                self.assertIsNone(result["density"]["variance_ddof0"])
            else:
                with self.assertRaises(ValueError):
                    contract.analyze(rgb, valid, domain="display-rgb255")


if __name__ == "__main__":
    unittest.main()
