# Paired comparison: `20261012-w1b-heldout-c052457`

Base `71c9813` vs `6f2ef5d2`, `93821ef5`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver50Ms | 10 | 47 | 28 | -20 | [-23, -17] | 2 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver33Ms | 10 | 48 | 31 | -19 | [-21, -16] | 2 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP95Ms | 10 | 32.2 | 22.9 | -20.9 | [-53.4, -8.4] | 3.6 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP99Ms | 10 | 186.9 | 104.9 | -79.6 | [-90.3, -64.8] | 6.2 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | maxFrameMs | 10 | 304 | 233.2 | -74.9 | [-141.6, -57.1] | 15 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | timeToSharpMs | 10 | 3837.2 | 2987.1 | -805 | [-998.1, -770.7] | 86.1 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaints | 10 | 46 | 28 | -20 | [-23, -17] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsAtRest | 10 | 18 | 19 | 0 | [0, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsMoving | 10 | 30 | 9 | -20 | [-23, -18] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | longFramesWithPaint | 10 | 46 | 28 | -20 | [-23, -17] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | loafScriptMs | 10 | 5964 | 2885 | -3100 | [-3472, -2884] | 207 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodes | 10 | 574 | 701 | 134 | [113, 143] | 5 | **yes** |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | requests | 10 | 128 | 128 | 0 | [-2, 1] | 1 | no |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver50Ms | 10 | 47 | 27 | -21 | [-25, -18] | 2 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver33Ms | 10 | 48 | 29 | -21 | [-26, -17] | 2 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP95Ms | 10 | 32.2 | 21.8 | -23.3 | [-56, -8.2] | 3.6 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP99Ms | 10 | 186.9 | 146 | -34.8 | [-53, -27.6] | 6.2 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | maxFrameMs | 10 | 304 | 314.1 | 12.5 | [-57.5, 25.2] | 15 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | timeToSharpMs | 10 | 3837.2 | 3052.2 | -783.8 | [-966.9, -671.6] | 86.1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaints | 10 | 46 | 26 | -21 | [-25, -20] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsAtRest | 10 | 18 | 2 | -16 | [-18, -15] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsMoving | 10 | 30 | 24 | -6 | [-8, -4] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | longFramesWithPaint | 10 | 46 | 26 | -21 | [-25, -20] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | loafScriptMs | 10 | 5964 | 3186 | -2743 | [-3129, -2510] | 207 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodes | 10 | 574 | 725 | 152 | [147, 168] | 5 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | requests | 10 | 128 | 128 | 0 | [-2, 3] | 1 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver50Ms | 10 | 50 | 31 | -19 | [-23, -17] | 2 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | framesOver33Ms | 10 | 54 | 34 | -18 | [-29, -17] | 3 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP95Ms | 10 | 76.2 | 24.7 | -53 | [-62.2, -39.8] | 5.8 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | rafP99Ms | 10 | 208.2 | 98 | -111.1 | [-113.2, -90.1] | 5 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | maxFrameMs | 10 | 336.9 | 235.7 | -120.4 | [-151.6, -46.6] | 12.6 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | timeToSharpMs | 10 | 4044.9 | 2928.7 | -1147.2 | [-1195, -1074.2] | 40.1 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaints | 10 | 47 | 30 | -18 | [-20, -16] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsAtRest | 10 | 19 | 20 | 0 | [-2, 2] | 1 | no |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | detailPaintsMoving | 10 | 28 | 11 | -19 | [-19, -17] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | longFramesWithPaint | 10 | 47 | 30 | -18 | [-20, -16] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | loafScriptMs | 10 | 6218 | 2903 | -3232 | [-3563, -3051] | 80 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodes | 10 | 559 | 860 | 293 | [274, 324] | 12 | **yes** |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | requests | 10 | 1 | 0 | -1 | [-6, 0] | 1 | no |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `6f2ef5d216e9d24633a6ad62000912ac0c4e7e08` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver50Ms | 10 | 50 | 27 | -24 | [-26, -22] | 2 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver33Ms | 10 | 54 | 31 | -26 | [-30, -18] | 3 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP95Ms | 10 | 76.2 | 22 | -55.3 | [-61.8, -45] | 5.8 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP99Ms | 10 | 208.2 | 158.6 | -42.2 | [-62, -32.7] | 5 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | maxFrameMs | 10 | 336.9 | 322.1 | -35.5 | [-111.7, 28.6] | 12.6 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | timeToSharpMs | 10 | 4044.9 | 3071.9 | -1001.2 | [-1118.4, -820.7] | 40.1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaints | 10 | 47 | 24 | -24 | [-25, -23] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsAtRest | 10 | 19 | 2 | -17 | [-18, -17] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsMoving | 10 | 28 | 22 | -6 | [-8, -5] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | longFramesWithPaint | 10 | 47 | 24 | -24 | [-25, -23] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | loafScriptMs | 10 | 6218 | 3257 | -3047 | [-3305, -2826] | 80 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodes | 10 | 559 | 724 | 166 | [155, 186] | 12 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | requests | 10 | 1 | 1 | -1 | [-6, 1] | 1 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
