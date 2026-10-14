# Paired comparison: `20261014-w2a-heldout-midzoom-hold-5fc18dc`

Base `1b637ed1` vs `18bb1dec`, `11d42fd4`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver50Ms | 6 | 9 | 9 | 0 | [-4, 1] | 2 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | framesOver33Ms | 6 | 21 | 19 | -2 | [-8, 0] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP95Ms | 6 | 24.5 | 24 | -0.9 | [-2.6, -0.3] | 0.7 | **yes** |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | rafP99Ms | 6 | 40.8 | 41.9 | -5.5 | [-81.7, 3.6] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | maxFrameMs | 6 | 292.4 | 299 | 3.6 | [-13.9, 17.2] | 4.4 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | timeToSharpMs | 6 | 3185.8 | 3220.6 | 31.9 | [-150.5, 91.7] | 8.4 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaints | 6 | 8 | 9 | 1 | [-3, 1] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsAtRest | 6 | 2 | 2 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | detailPaintsMoving | 6 | 6 | 7 | 1 | [-3, 1] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | longFramesWithPaint | 6 | 8 | 9 | 1 | [-3, 1] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | loafScriptMs | 6 | 1801 | 1838 | 69 | [-380, 123] | 93 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodes | 6 | 317 | 312 | -5 | [-31, 5] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | requests | 6 | 126 | 129 | -2 | [-12, 3] | 1 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runRedecodes | 6 | 183 | 181 | -2 | [-24, 7] | 3 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMaxDecodesPerAsset | 6 | 5 | 6 | 1 | [-1, 1] | 0 | no |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runProcessCpuMs | 6 | 27070 | 26630 | -300 | [-1020, -90] | 200 | **yes** |
| heldout-midzoom-hold | A | desktop | `18bb1dec055cbb71b17a2a3c53b3314b789f2267` | runMainThreadMs | 6 | 10907.42 | 10823.36 | -87.61 | [-360.06, -43.79] | 45.79 | **yes** |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver50Ms | 6 | 9 | 10 | 1 | [-2, 2] | 2 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | framesOver33Ms | 6 | 21 | 19 | -5 | [-9, 0] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP95Ms | 6 | 24.5 | 23.9 | -1.7 | [-2.4, 0.1] | 0.7 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | rafP99Ms | 6 | 40.8 | 41.8 | 2 | [-4.5, 2.8] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | maxFrameMs | 6 | 292.4 | 357.1 | 14.5 | [-40.7, 96.4] | 4.4 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | timeToSharpMs | 6 | 3185.8 | 3247.7 | -89.1 | [-144.9, 332.4] | 8.4 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaints | 6 | 8 | 10 | 0 | [-2, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsAtRest | 6 | 2 | 2 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | detailPaintsMoving | 6 | 6 | 8 | 0 | [-2, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | longFramesWithPaint | 6 | 8 | 10 | 0 | [-2, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | loafScriptMs | 6 | 1801 | 1997 | 267 | [-59, 480] | 93 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodes | 6 | 317 | 305 | -11 | [-26, -7] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | requests | 6 | 126 | 132 | -1 | [-10, 7] | 1 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | decodedPeakBytes | 6 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | blankFrames | 6 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runRedecodes | 6 | 183 | 176 | -7 | [-23, -7] | 3 | **yes** |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMaxDecodesPerAsset | 6 | 5 | 5 | 0 | [-1, 1] | 0 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runProcessCpuMs | 6 | 27070 | 26970 | -110 | [-610, 380] | 200 | no |
| heldout-midzoom-hold | A | desktop | `11d42fd452eeb915eb2cfc6a2fdcb392302735c0` | runMainThreadMs | 6 | 10907.42 | 11211.03 | 122.98 | [57.62, 512.34] | 45.79 | **yes** |
