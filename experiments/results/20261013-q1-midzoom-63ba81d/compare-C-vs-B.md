# Paired comparison: `20261013-q1-midzoom-63ba81d`

Base `99a629f9` vs `1b637ed1`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 13 | 15 | 3 | [1, 3] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 17 | 18 | 1 | [0, 3] | 0 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 17.5 | 17.5 | -0.1 | [-0.3, 0.3] | 0 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 52.9 | 55.7 | 2.8 | [-1.8, 6] | 2.9 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 143.9 | 152.1 | 8.2 | [-18.5, 38] | 20.4 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2816 | 2821.2 | 14.7 | [-58, 43.2] | 38 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 16 | 17 | 1 | [0, 4] | 1 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 2 | 2 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 14 | 15 | 1 | [0, 4] | 1 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 13 | 15 | 2 | [1, 3] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 993 | 1038 | 43 | [-21, 115] | 70 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 566 | 338 | -222 | [-257, -218] | 18 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 138 | 137 | 0 | [-5, 3] | 2 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 434 | 203 | -225 | [-260, -221] | 17 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 120 | 7 | -113 | [-114, -108] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 22220 | 16190 | -6090 | [-6390, -5750] | 130 | **yes** |
| heldout-midzoom-hold | A | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 8064.94 | 7486.42 | -642.56 | [-759.64, -458.9] | 117.15 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver50Ms | 7 | 13 | 16 | 2 | [1, 5] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | framesOver33Ms | 7 | 18 | 20 | 2 | [0, 5] | 1 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP95Ms | 7 | 17.6 | 17.6 | 0.1 | [-0.1, 0.3] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | rafP99Ms | 7 | 54.9 | 58.4 | 6.5 | [-4.3, 12.8] | 3 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | maxFrameMs | 7 | 145.9 | 156.1 | 10.2 | [-20.4, 51.7] | 24 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | timeToSharpMs | 7 | 2813.9 | 2806.6 | -27.1 | [-86, 43.4] | 29.4 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaints | 7 | 16 | 18 | 1 | [-1, 3] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsAtRest | 7 | 2 | 2 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | detailPaintsMoving | 7 | 14 | 16 | 1 | [-1, 3] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | longFramesWithPaint | 7 | 13 | 15 | 1 | [0, 5] | 1 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | loafScriptMs | 7 | 971 | 1150 | 174 | [18, 217] | 38 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodes | 7 | 641 | 391 | -250 | [-268, -215] | 23 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | requests | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | decodedPeakBytes | 7 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | blankFrames | 7 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runRedecodes | 7 | 644 | 391 | -253 | [-271, -219] | 23 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMaxDecodesPerAsset | 7 | 119 | 8 | -111 | [-112, -108] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runProcessCpuMs | 7 | 22570 | 17000 | -5620 | [-5990, -4870] | 280 | **yes** |
| heldout-midzoom-hold | C | desktop | `1b637ed1e7128789419a06d46d62a7f044a46a02` | runMainThreadMs | 7 | 8424.14 | 8186.44 | -346.17 | [-420.85, 248.23] | 72.41 | no |
