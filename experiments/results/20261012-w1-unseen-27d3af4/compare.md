# Paired comparison: `20261012-w1-unseen-27d3af4`

Base `71c9813` vs `d269afba`, `6f2ef5d2`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | framesOver50Ms | 10 | 47 | 9 | -41 | [-44, -37] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | framesOver33Ms | 10 | 49 | 10 | -41 | [-44, -36] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | rafP95Ms | 10 | 33.6 | 19.8 | -31.1 | [-36.9, -5.8] | 9.1 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | rafP99Ms | 10 | 202.6 | 29 | -172.6 | [-178.9, -157.9] | 3.1 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | maxFrameMs | 10 | 331.4 | 304 | -17.8 | [-73.6, 10.4] | 25.6 | no |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | inputToCameraMs | 10 | 60.2 | 60.8 | -2.8 | [-7.4, 8.7] | 4.1 | no |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | timeToSharpMs | 1 | 3393.6 | 3449.4 | 55.8 | [, ] | 0 | no |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaints | 10 | 47 | 9 | -42 | [-44, -37] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaintsAtRest | 10 | 19 | 2 | -17 | [-18, -16] | 1 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaintsMoving | 10 | 28 | 7 | -26 | [-28, -20] | 3 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | longFramesWithPaint | 10 | 47 | 9 | -41 | [-44, -37] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | loafScriptMs | 10 | 6480 | 1869 | -4909 | [-6045, -4349] | 257 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | decodes | 10 | 436 | 594 | 139 | [122, 181] | 19 | **yes** |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | requests | 10 | 200 | 203 | 3 | [-15, 8] | 7 | no |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | decodedPeakBytes | 10 | 67106176 | 67106176 | 0 | [-161152, 161152] | 0 | no |
| unseen-edge-wheel | A | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver50Ms | 10 | 47 | 7 | -42 | [-50, -39] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver33Ms | 10 | 49 | 7 | -42 | [-49, -38] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP95Ms | 10 | 33.6 | 19.5 | -32.2 | [-38, -5.5] | 9.1 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP99Ms | 10 | 202.6 | 27.8 | -174.8 | [-179.2, -165.1] | 3.1 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | maxFrameMs | 10 | 331.4 | 315.4 | -49 | [-66.1, 33.7] | 25.6 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | inputToCameraMs | 10 | 60.2 | 57.9 | -4.9 | [-7.3, 7.4] | 4.1 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | timeToSharpMs | 1 | 3569.5 | 3512.4 | -57.1 | [, ] | 0 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaints | 10 | 47 | 7 | -44 | [-51, -39] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsAtRest | 10 | 19 | 1 | -18 | [-19, -17] | 1 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsMoving | 10 | 28 | 6 | -25 | [-32, -22] | 3 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | longFramesWithPaint | 10 | 47 | 7 | -43 | [-50, -39] | 4 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | loafScriptMs | 10 | 6480 | 1577 | -4903 | [-6351, -4810] | 257 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodes | 10 | 436 | 628 | 202 | [180, 214] | 19 | **yes** |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | requests | 10 | 200 | 203 | 0 | [-8, 8] | 7 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodedPeakBytes | 10 | 67106176 | 67106176 | 0 | [0, 128384] | 0 | no |
| unseen-edge-wheel | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | framesOver50Ms | 10 | 73 | 35 | -37 | [-42, -33] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | framesOver33Ms | 10 | 80 | 40 | -38 | [-43, -36] | 2 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | rafP95Ms | 10 | 257.4 | 32.4 | -224.9 | [-235.2, -223.5] | 2.4 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | rafP99Ms | 10 | 350.3 | 329 | -36 | [-48.4, 2.8] | 19.6 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | maxFrameMs | 10 | 410.1 | 424 | 17.9 | [-201.8, 71.1] | 22.3 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | inputToCameraMs | 10 | 63.8 | 60.2 | -2.7 | [-6.8, 1.9] | 1.5 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaints | 10 | 72 | 33 | -39 | [-43, -35] | 2 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaintsAtRest | 10 | 17 | 2 | -15 | [-17, -14] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | detailPaintsMoving | 10 | 55 | 31 | -23 | [-25, -22] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | longFramesWithPaint | 10 | 71 | 33 | -38 | [-42, -35] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | loafScriptMs | 10 | 11823 | 7879 | -4054 | [-4177, -3914] | 164 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | decodes | 10 | 148 | 301 | 144 | [133, 154] | 7 | **yes** |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | requests | 10 | 0 | 0 | 0 | [-2, 1] | 0 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | decodedPeakBytes | 10 | 66800512 | 66800512 | 240128 | [-327680, 327680] | 0 | no |
| unseen-edge-wheel | C | desktop | `d269afba2df89b0ba0f778ba46da75278b3c5edd` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver50Ms | 10 | 73 | 9 | -64 | [-68, -62] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver33Ms | 10 | 80 | 14 | -66 | [-69, -60] | 2 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP95Ms | 10 | 257.4 | 21.8 | -236.9 | [-247.4, -233] | 2.4 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP99Ms | 10 | 350.3 | 35.1 | -332.6 | [-338.6, -290.3] | 19.6 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | maxFrameMs | 10 | 410.1 | 373 | -76.4 | [-214.3, -45.2] | 22.3 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | inputToCameraMs | 10 | 63.8 | 56.8 | -6.6 | [-11.2, -0.9] | 1.5 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaints | 10 | 72 | 9 | -63 | [-67, -61] | 2 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsAtRest | 10 | 17 | 1 | -16 | [-18, -15] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsMoving | 10 | 55 | 8 | -47 | [-49, -46] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | longFramesWithPaint | 10 | 71 | 9 | -62 | [-66, -60] | 1 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | loafScriptMs | 10 | 11823 | 2155 | -9856 | [-10444, -9504] | 164 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodes | 10 | 148 | 725 | 593 | [528, 612] | 7 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | requests | 10 | 0 | 16 | 16 | [9, 39] | 0 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodedPeakBytes | 10 | 66800512 | 67108864 | 308352 | [308352, 636032] | 0 | **yes** |
| unseen-edge-wheel | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
