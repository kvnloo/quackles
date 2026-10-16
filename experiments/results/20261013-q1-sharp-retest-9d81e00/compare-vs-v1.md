# Paired comparison: `20261013-q1-sharp-retest-9d81e00`

Base `6f2ef5d2` vs `1b637ed1`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 12 | 7 | 7 | 0 | [-1, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 12 | 8 | 8 | 0 | [-1, 0] | 1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 12 | 17.9 | 17.5 | -0.3 | [-0.6, -0.1] | 0.2 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 12 | 23.3 | 22.5 | -1.3 | [-2.9, -0.7] | 0.6 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 12 | 132.6 | 127.1 | -0.5 | [-23.2, 7.4] | 8.2 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | inputToCameraMs | 12 | 42.5 | 39.6 | -0.9 | [-4.6, 5.3] | 1.3 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 12 | 2537 | 2522.2 | -1.1 | [-37.7, 28.4] | 14.8 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 12 | 7 | 8 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 12 | 2 | 2 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 12 | 5 | 6 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 12 | 7 | 7 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 12 | 527 | 576 | 44 | [-50, 83] | 34 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 12 | 867 | 374 | -485 | [-515, -475] | 15 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 12 | 198 | 202 | 3 | [-1, 7] | 1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 12 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 12 | 0 | 0 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 12 | 673 | 174 | -488 | [-518, -484] | 14 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 12 | 255 | 6 | -249 | [-254, -243] | 6 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 12 | 29440 | 16620 | -12780 | [-13250, -12670] | 90 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 12 | 8111.32 | 6768.87 | -1312.95 | [-1492.7, -1174.69] | 97.97 | **yes** |
