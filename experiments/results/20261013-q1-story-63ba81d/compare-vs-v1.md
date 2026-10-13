# Paired comparison: `20261013-q1-story-63ba81d`

Base `6f2ef5d2` vs `99a629f9`, `1b637ed1`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | framesOver50Ms | 7 | 462 | 6 | -456 | [-459, -422] | 3 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | framesOver33Ms | 7 | 738 | 7 | -731 | [-743, -721] | 10 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | rafP95Ms | 7 | 67.9 | 17.3 | -50.6 | [-54.3, -47.9] | 2.6 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | rafP99Ms | 7 | 88.8 | 19.6 | -69.4 | [-71.5, -64.1] | 2.3 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | maxFrameMs | 7 | 184.6 | 146.2 | -44.2 | [-88.2, 14.7] | 18.7 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | inputToCameraMs | 7 | 3800.9 | 3799.9 | -4.7 | [-7, 0.3] | 1.8 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | timeToSharpMs | 7 | 2548 | 2539.6 | -24.8 | [-82.1, 16.3] | 83.5 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | detailPaints | 7 | 737 | 6 | -733 | [-743, -721] | 9 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | detailPaintsAtRest | 7 | 734 | 3 | -731 | [-744, -721] | 10 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | detailPaintsMoving | 7 | 3 | 3 | 0 | [-2, 1] | 1 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | longFramesWithPaint | 7 | 461 | 6 | -456 | [-459, -420] | 4 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | loafScriptMs | 7 | 25483 | 449 | -25046 | [-26250, -24715] | 770 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | decodes | 7 | 2030 | 443 | -1576 | [-1607, -1552] | 17 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | requests | 7 | 204 | 202 | -1 | [-5, 0] | 0 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | runRedecodes | 7 | 1827 | 240 | -1584 | [-1616, -1561] | 24 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | runMaxDecodesPerAsset | 7 | 363 | 37 | -325 | [-328, -316] | 2 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | runProcessCpuMs | 7 | 102090 | 17970 | -84090 | [-84260, -83970] | 320 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | runMainThreadMs | 7 | 50848.73 | 6135.36 | -44857.98 | [-44950.12, -44699.22] | 448.57 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | stationaryDecodes | 7 | 918 | 0 | -918 | [-931, -891] | 14 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | stationaryEvictions | 7 | 918 | 0 | -918 | [-931, -891] | 14 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | stationaryDetailPaints | 7 | 418 | 0 | -418 | [-431, -411] | 7 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | stationaryProcessCpuMs | 7 | 48930 | 1380 | -47540 | [-47910, -47330] | 280 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | stationaryOver33Ms | 7 | 419 | 1 | -418 | [-428, -410] | 9 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | refineSettleMs | 7 | 20046 | 1511 | -18536 | [-18557, -18511] | 24 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | scrollFwdP95Ms | 7 | 18.3 | 18.1 | 0 | [-0.8, 0.1] | 0.6 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | scrollFwdMaxMs | 7 | 22.8 | 22.7 | -0.6 | [-3.7, 1.9] | 0.5 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | scrollRevP95Ms | 7 | 17.9 | 17.9 | 0 | [-0.2, 0.3] | 0.1 | no |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | scrollRevMaxMs | 7 | 21.4 | 22.6 | 1.8 | [0.9, 4.8] | 1.5 | **yes** |
| q1-story-hold | A | desktop | `99a629f9ea43b117208a6b5e04ce15dd8c873d7b` | scrollOver33Ms | 7 | 0 | 0 | 0 | [0, 1] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 462 | 6 | -456 | [-458, -423] | 3 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 738 | 7 | -730 | [-742, -721] | 10 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 67.9 | 17.3 | -50.6 | [-54.2, -48] | 2.6 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 88.8 | 19.7 | -68.4 | [-71.4, -64.6] | 2.3 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 184.6 | 142.8 | -27.1 | [-81.4, -23.1] | 18.7 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | inputToCameraMs | 7 | 3800.9 | 3793.7 | -7.7 | [-12.6, 0.9] | 1.8 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2548 | 2586.4 | 38.4 | [-22, 105] | 83.5 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 737 | 6 | -732 | [-744, -722] | 9 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 734 | 3 | -731 | [-744, -721] | 10 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 3 | 3 | 0 | [-1, 1] | 1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 461 | 6 | -455 | [-459, -421] | 4 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 25483 | 460 | -25027 | [-26209, -24653] | 770 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 2030 | 380 | -1649 | [-1666, -1620] | 17 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 204 | 204 | 0 | [-1, 4] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 1827 | 176 | -1655 | [-1677, -1627] | 24 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 363 | 6 | -358 | [-359, -346] | 2 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 102090 | 16120 | -86000 | [-86390, -85490] | 320 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 50848.73 | 5999.92 | -44844.41 | [-44951.63, -44621.32] | 448.57 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryDecodes | 7 | 918 | 0 | -918 | [-931, -891] | 14 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryEvictions | 7 | 918 | 0 | -918 | [-931, -891] | 14 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryDetailPaints | 7 | 418 | 0 | -418 | [-431, -411] | 7 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryProcessCpuMs | 7 | 48930 | 1360 | -47580 | [-47900, -47300] | 280 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | stationaryOver33Ms | 7 | 419 | 1 | -419 | [-427, -409] | 9 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | refineSettleMs | 7 | 20046 | 1512 | -18532 | [-18563, -18510] | 24 | **yes** |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollFwdP95Ms | 7 | 18.3 | 18.2 | -0.2 | [-0.5, 0.4] | 0.6 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollFwdMaxMs | 7 | 22.8 | 22.3 | -0.4 | [-2.4, 2.7] | 0.5 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollRevP95Ms | 7 | 17.9 | 18 | 0.1 | [0, 0.5] | 0.1 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollRevMaxMs | 7 | 21.4 | 21.6 | 1.2 | [-2.2, 2.4] | 1.5 | no |
| q1-story-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | scrollOver33Ms | 7 | 0 | 0 | 0 | [0, 1] | 0 | no |
