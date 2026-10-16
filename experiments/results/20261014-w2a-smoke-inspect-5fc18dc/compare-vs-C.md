# Paired comparison: `20261014-w2a-smoke-inspect-5fc18dc`

Base `1b637ed1` vs `18bb1dec`, `11d42fd4`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver50Ms | 6 | 6 | 6 | 0 | [-1, 1] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver33Ms | 6 | 16 | 16 | -2 | [-2, 4] | 1 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP95Ms | 6 | 23.8 | 24 | 0 | [-2, 1.5] | 0.2 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP99Ms | 6 | 38.3 | 37.7 | -1.2 | [-2.7, 2] | 1.7 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | maxFrameMs | 6 | 272.2 | 283.6 | 0 | [-62.6, 34.1] | 18.5 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | inputToCameraMs | 6 | 65.6 | 63.2 | -4.6 | [-9.5, 1] | 2.3 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | timeToSharpMs | 6 | 2945.8 | 2916.3 | -67.7 | [-183.2, 49.3] | 38.2 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaints | 6 | 6 | 6 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsAtRest | 6 | 3 | 3 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsMoving | 6 | 3 | 3 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | longFramesWithPaint | 6 | 6 | 6 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | loafScriptMs | 6 | 1099 | 1022 | -69 | [-194, 30] | 91 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodes | 6 | 331 | 323 | -8 | [-22, 1] | 8 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | requests | 6 | 195 | 199 | 3 | [-5, 7] | 2 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runRedecodes | 6 | 132 | 125 | -7 | [-22, 2] | 8 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMaxDecodesPerAsset | 6 | 4 | 5 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runProcessCpuMs | 6 | 28030 | 28600 | -140 | [-680, 670] | 90 | no |
| smoke-inspect | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMainThreadMs | 6 | 10852.04 | 10938.73 | -182.02 | [-248.29, 295.3] | 213.32 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver50Ms | 6 | 6 | 6 | -1 | [-2, 1] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver33Ms | 6 | 16 | 19 | 1 | [-6, 6] | 1 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP95Ms | 6 | 23.8 | 23.7 | -0.2 | [-1.8, 0.8] | 0.2 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP99Ms | 6 | 38.3 | 37.5 | -1.7 | [-2, 1.4] | 1.7 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | maxFrameMs | 6 | 272.2 | 276.4 | -4.5 | [-25.8, 11.2] | 18.5 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | inputToCameraMs | 6 | 65.6 | 67.7 | -5 | [-13.1, 6.6] | 2.3 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | timeToSharpMs | 6 | 2945.8 | 2950.2 | -11.4 | [-134, 5.5] | 38.2 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaints | 6 | 6 | 6 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsAtRest | 6 | 3 | 3 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsMoving | 6 | 3 | 3 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | longFramesWithPaint | 6 | 6 | 6 | 0 | [-1, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | loafScriptMs | 6 | 1099 | 1138 | -8 | [-176, 160] | 91 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodes | 6 | 331 | 322 | -8 | [-41, 2] | 8 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | requests | 6 | 195 | 196 | -1 | [-7, 5] | 2 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runRedecodes | 6 | 132 | 123 | -9 | [-41, 3] | 8 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMaxDecodesPerAsset | 6 | 4 | 5 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runProcessCpuMs | 6 | 28030 | 28540 | 30 | [-650, 600] | 90 | no |
| smoke-inspect | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMainThreadMs | 6 | 10852.04 | 10950.4 | 5.16 | [-132.76, 196.46] | 213.32 | no |
