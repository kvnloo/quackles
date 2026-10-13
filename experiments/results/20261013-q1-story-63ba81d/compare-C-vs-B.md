# Paired comparison: `20261013-q1-story-63ba81d`

Base `99a629f9` vs `1b637ed1`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 6 | 6 | 0 | [-1, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 7 | 7 | 0 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 17.3 | 17.3 | 0 | [-0.1, 0] | 0.1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 19.6 | 19.7 | 0.1 | [-0.3, 0.7] | 0.2 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 146.2 | 142.8 | -5.2 | [-37.2, 30.6] | 32.2 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | inputToCameraMs | 7 | 3799.9 | 3793.7 | -3.4 | [-8, -0.6] | 1.4 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2539.6 | 2586.4 | 51.8 | [18.6, 63.2] | 16.4 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 6 | 6 | 0 | [-1, 1] | 1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 3 | 3 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 3 | 3 | 0 | [-1, 1] | 1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 6 | 6 | 0 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 449 | 460 | -3 | [-23, 41] | 31 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 443 | 380 | -63 | [-74, -58] | 11 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 202 | 204 | 0 | [-2, 5] | 2 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 240 | 176 | -64 | [-75, -61] | 8 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 37 | 6 | -32 | [-34, -30] | 1 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 17970 | 16120 | -1810 | [-2040, -1230] | 170 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 6135.36 | 5999.92 | -145.19 | [-290.56, 197.31] | 299.9 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryDecodes | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryEvictions | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryDetailPaints | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryProcessCpuMs | 7 | 1380 | 1360 | 0 | [-40, 20] | 30 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryOver33Ms | 7 | 1 | 1 | 1 | [-1, 1] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | refineSettleMs | 7 | 1511 | 1512 | -1 | [-5, 3] | 1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollFwdP95Ms | 7 | 18.1 | 18.2 | 0 | [-0.3, 0.4] | 0.2 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollFwdMaxMs | 7 | 22.7 | 22.3 | 0.1 | [-1.4, 3.3] | 2.7 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollRevP95Ms | 7 | 17.9 | 18 | 0.2 | [0.1, 0.2] | 0.1 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollRevMaxMs | 7 | 22.6 | 21.6 | -0.7 | [-34.3, 1.1] | 0.9 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollOver33Ms | 7 | 0 | 0 | 0 | [-1, 1] | 0 | no |
