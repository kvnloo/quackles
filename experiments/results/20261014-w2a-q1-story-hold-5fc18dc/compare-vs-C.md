# Paired comparison: `20261014-w2a-q1-story-hold-5fc18dc`

Base `1b637ed1` vs `18bb1dec`, `11d42fd4`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver50Ms | 6 | 5 | 5 | 1 | [-2, 1] | 1 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver33Ms | 6 | 14 | 10 | -5 | [-5, 2] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP95Ms | 6 | 19.1 | 19.2 | -0.1 | [-0.7, 0.1] | 0.2 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP99Ms | 6 | 26 | 25.9 | -1.5 | [-1.7, -0.1] | 0.8 | **yes** |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | maxFrameMs | 6 | 290 | 280 | -13.2 | [-71.6, 7.2] | 17.2 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | inputToCameraMs | 6 | 3809.7 | 3799.9 | -9.9 | [-99, -0.3] | 2.5 | **yes** |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | timeToSharpMs | 6 | 2965.1 | 2941.7 | -23.4 | [-113.7, 75.7] | 51.4 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaints | 6 | 4 | 4 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsAtRest | 6 | 3 | 3 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsMoving | 6 | 1 | 1 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | longFramesWithPaint | 6 | 4 | 4 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | loafScriptMs | 6 | 653 | 660 | -4 | [-145, 59] | 22 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodes | 6 | 296 | 296 | -1 | [-15, 10] | 5 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | requests | 6 | 179 | 180 | -3 | [-10, 4] | 1 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runRedecodes | 6 | 123 | 122 | -1 | [-13, 5] | 4 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMaxDecodesPerAsset | 6 | 5 | 5 | 0 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runProcessCpuMs | 6 | 27650 | 27560 | -50 | [-750, 540] | 370 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMainThreadMs | 6 | 10283.1 | 10174.18 | 62.55 | [-391.05, 336.17] | 212.92 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | stationaryDecodes | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | stationaryEvictions | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | stationaryDetailPaints | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | stationaryProcessCpuMs | 6 | 2290 | 2270 | -10 | [-50, 40] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | stationaryOver33Ms | 6 | 1 | 0 | -1 | [-3, 0] | 0 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | refineSettleMs | 6 | 1632 | 1661 | -5 | [-65, 29] | 15 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | scrollFwdP95Ms | 6 | 20 | 19.8 | -0.3 | [-1.5, 2.5] | 0.4 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | scrollFwdMaxMs | 6 | 27.1 | 27.4 | -2.2 | [-219.5, 3.1] | 3.1 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | scrollRevP95Ms | 6 | 19.5 | 19.7 | -0.7 | [-2.6, 0.6] | 0.5 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | scrollRevMaxMs | 6 | 28.5 | 32.7 | -0.7 | [-13.5, 6.1] | 0.7 | no |
| q1-story-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | scrollOver33Ms | 6 | 0 | 0 | 0 | [-3, 1] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver50Ms | 6 | 5 | 5 | 0 | [-1, 1] | 1 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver33Ms | 6 | 14 | 11 | -3 | [-6, -3] | 0 | **yes** |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP95Ms | 6 | 19.1 | 19.1 | -0.2 | [-0.6, 0.2] | 0.2 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP99Ms | 6 | 26 | 25.4 | -0.8 | [-2.3, -0.1] | 0.8 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | maxFrameMs | 6 | 290 | 296.1 | -15.9 | [-70.5, 53.6] | 17.2 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | inputToCameraMs | 6 | 3809.7 | 3801.5 | -12.1 | [-64.5, -2.8] | 2.5 | **yes** |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | timeToSharpMs | 6 | 2965.1 | 2911.3 | -56.3 | [-144, 6.5] | 51.4 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaints | 6 | 4 | 4 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsAtRest | 6 | 3 | 3 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsMoving | 6 | 1 | 1 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | longFramesWithPaint | 6 | 4 | 4 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | loafScriptMs | 6 | 653 | 632 | -37 | [-174, 10] | 22 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodes | 6 | 296 | 300 | 1 | [-7, 6] | 5 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | requests | 6 | 179 | 179 | -3 | [-8, 6] | 1 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runRedecodes | 6 | 123 | 116 | -7 | [-9, -5] | 4 | **yes** |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMaxDecodesPerAsset | 6 | 5 | 5 | 0 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runProcessCpuMs | 6 | 27650 | 27290 | -260 | [-360, -60] | 370 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMainThreadMs | 6 | 10283.1 | 10014.31 | -207.1 | [-285.86, -7.57] | 212.92 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | stationaryDecodes | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | stationaryEvictions | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | stationaryDetailPaints | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | stationaryProcessCpuMs | 6 | 2290 | 2300 | 10 | [-100, 60] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | stationaryOver33Ms | 6 | 1 | 2 | 0 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | refineSettleMs | 6 | 1632 | 1619 | -35 | [-153, 26] | 15 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | scrollFwdP95Ms | 6 | 20 | 20.1 | 0.3 | [-1.2, 0.7] | 0.4 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | scrollFwdMaxMs | 6 | 27.1 | 27.8 | -1.8 | [-219.2, 0.7] | 3.1 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | scrollRevP95Ms | 6 | 19.5 | 18.9 | -1.5 | [-2.2, -0.1] | 0.5 | **yes** |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | scrollRevMaxMs | 6 | 28.5 | 25.9 | -6.6 | [-33.6, 3.6] | 0.7 | no |
| q1-story-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | scrollOver33Ms | 6 | 0 | 0 | 0 | [-3, 0] | 0 | no |
