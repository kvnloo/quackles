# Paired comparison: `20261013-q1-smoke-63ba81d`

Base `99a629f9` vs `1b637ed1`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 7 | 7 | 0 | [-1, 1] | 1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 8 | 9 | 1 | [-1, 2] | 1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 17.9 | 17.7 | -0.2 | [-0.5, 0] | 0.1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 23.6 | 23 | -0.6 | [-2.9, 1.2] | 0.6 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 127 | 127.9 | -4.8 | [-18.1, 34.1] | 12.8 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | inputToCameraMs | 7 | 40.9 | 43.8 | 3 | [0.5, 8.2] | 0.8 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2546.4 | 2518.6 | -41.9 | [-62.9, 53] | 35.1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 8 | 8 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 2 | 2 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 6 | 6 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 7 | 7 | 0 | [0, 1] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 547 | 546 | 4 | [-40, 89] | 25 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 861 | 381 | -480 | [-498, -473] | 10 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 199 | 197 | -4 | [-8, 4] | 1 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 661 | 182 | -479 | [-506, -472] | 13 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 248 | 6 | -242 | [-250, -238] | 6 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 29640 | 16740 | -12950 | [-13250, -12770] | 130 | **yes** |
| smoke-inspect | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 8397.5 | 6885.64 | -1511.86 | [-1771.27, -1239.6] | 156.92 | **yes** |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 7 | 7 | 0 | [-1, 0] | 1 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 9 | 8 | -1 | [-4, 0] | 0 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 17.7 | 17.5 | -0.3 | [-0.6, 0] | 0.2 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 24.9 | 24.5 | 0.5 | [-4.4, 0.8] | 2.4 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 143 | 130.2 | -9.2 | [-26.6, 5.5] | 14.9 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | inputToCameraMs | 7 | 44.9 | 48.3 | 10.9 | [-4.1, 15.1] | 4.7 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2344 | 2320 | 14.4 | [-63.5, 18.7] | 24 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 8 | 8 | 0 | [-1, 2] | 1 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 2 | 2 | 0 | [0, 0] | 0 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 6 | 6 | 0 | [-1, 2] | 1 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 7 | 7 | 0 | [-1, 2] | 1 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 556 | 570 | 4 | [-50, 14] | 30 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 899 | 390 | -490 | [-540, -481] | 23 | **yes** |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 2 | 2 | 0 | [0, 3] | 0 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 900 | 390 | -492 | [-539, -482] | 19 | **yes** |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 256 | 6 | -250 | [-255, -241] | 6 | **yes** |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 30000 | 16930 | -12880 | [-13590, -12340] | 170 | **yes** |
| smoke-inspect | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 8806.71 | 7444.65 | -1316.94 | [-1914.57, -866.94] | 128.32 | **yes** |
