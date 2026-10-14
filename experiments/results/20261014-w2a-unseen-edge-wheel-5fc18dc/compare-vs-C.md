# Paired comparison: `20261014-w2a-unseen-edge-wheel-5fc18dc`

Base `1b637ed1` vs `18bb1dec`, `11d42fd4`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver50Ms | 6 | 2 | 2 | 0 | [-3, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver33Ms | 6 | 11 | 9 | -3 | [-8, 3] | 2 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP95Ms | 6 | 22.5 | 21.4 | -1 | [-2.3, -0.6] | 0.1 | **yes** |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP99Ms | 6 | 31.3 | 28.5 | -1.5 | [-8, 4.3] | 2.2 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | maxFrameMs | 6 | 339 | 331.8 | -29.1 | [-60.7, 22.7] | 35.5 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | inputToCameraMs | 6 | 61.9 | 66.1 | -3.4 | [-8.1, 12.1] | 2.6 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | timeToSharpMs | 4 | 3666.1 | 3652.3 | -28.7 | [-91.1, 81.8] | 95.6 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaints | 6 | 2 | 2 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsAtRest | 6 | 1 | 1 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsMoving | 6 | 1 | 1 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | longFramesWithPaint | 6 | 2 | 2 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | loafScriptMs | 6 | 567 | 510 | -68 | [-1482, -4] | 37 | **yes** |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodes | 6 | 258 | 259 | -1 | [-29, 11] | 4 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | requests | 6 | 178 | 176 | 3 | [-29, 9] | 5 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodedPeakBytes | 6 | 67106176 | 67073408 | 0 | [-305664, 2688] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runRedecodes | 6 | 81 | 84 | -1 | [-6, 8] | 2 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMaxDecodesPerAsset | 6 | 4 | 4 | 0 | [-1, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runProcessCpuMs | 6 | 29530 | 29610 | -360 | [-3620, 500] | 140 | no |
| unseen-edge-wheel | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMainThreadMs | 6 | 10736.5 | 10797.85 | -18.57 | [-3179.56, 334.62] | 74.72 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver50Ms | 6 | 2 | 3 | 0 | [-3, 2] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver33Ms | 6 | 11 | 11 | -2 | [-8, 5] | 2 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP95Ms | 6 | 22.5 | 21.8 | -1.2 | [-2.2, 0.3] | 0.1 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP99Ms | 6 | 31.3 | 32.1 | -3.1 | [-10.1, 4.5] | 2.2 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | maxFrameMs | 6 | 339 | 345.1 | 16.4 | [-110.4, 44.3] | 35.5 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | inputToCameraMs | 6 | 61.9 | 60.3 | -2.4 | [-6.1, 2.1] | 2.6 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | timeToSharpMs | 4 | 3666.1 | 3750.1 | -20.4 | [-21, 131.9] | 95.6 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaints | 6 | 2 | 2 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsAtRest | 6 | 1 | 1 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsMoving | 6 | 1 | 1 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | longFramesWithPaint | 6 | 2 | 2 | 0 | [-5, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | loafScriptMs | 6 | 567 | 584 | -8 | [-1551, 64] | 37 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodes | 6 | 258 | 256 | -4 | [-7, 5] | 4 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | requests | 6 | 178 | 173 | 2 | [-10, 6] | 5 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodedPeakBytes | 6 | 67106176 | 67106176 | 0 | [-32768, 207360] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runRedecodes | 6 | 81 | 82 | 0 | [-9, 3] | 2 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMaxDecodesPerAsset | 6 | 4 | 4 | 0 | [-1, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runProcessCpuMs | 6 | 29530 | 29140 | -460 | [-3700, -280] | 140 | **yes** |
| unseen-edge-wheel | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMainThreadMs | 6 | 10736.5 | 10436.96 | -224.82 | [-2734.37, -13.72] | 74.72 | **yes** |
