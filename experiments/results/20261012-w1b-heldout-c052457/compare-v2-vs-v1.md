# Paired comparison: `20261012-w1b-heldout-c052457`

Base `6f2ef5d2` vs `93821ef5`. Pairs = same trial number. Diff = candidate - base (negative = fewer/faster). CI: seeded bootstrap of the median diff. beyondNoise = CI excludes 0 and |median diff| > base MAD.

| scenario | mode | profile | candidate | metric | n | base median | cand median | median diff | 95% CI | base MAD | beyond noise |
|---|---|---|---|---|---|---|---|---|---|---|---|
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver50Ms | 10 | 28 | 27 | -3 | [-5, 1] | 2 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver33Ms | 10 | 31 | 29 | -1 | [-7, 0] | 2 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP95Ms | 10 | 22.9 | 21.8 | -1.7 | [-2.6, 0.6] | 0.9 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP99Ms | 10 | 104.9 | 146 | 42.1 | [16.1, 49.5] | 4.3 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | maxFrameMs | 10 | 233.2 | 314.1 | 76.7 | [57.2, 117.7] | 14.9 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | timeToSharpMs | 10 | 2987.1 | 3052.2 | 76.6 | [-24, 105.9] | 17.5 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaints | 10 | 28 | 26 | -3 | [-6, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsAtRest | 10 | 19 | 2 | -18 | [-19, -16] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsMoving | 10 | 9 | 24 | 15 | [12, 16] | 1 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | longFramesWithPaint | 10 | 28 | 26 | -3 | [-6, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | loafScriptMs | 10 | 2885 | 3186 | 328 | [217, 343] | 13 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodes | 10 | 701 | 725 | 24 | [12, 39] | 11 | **yes** |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | requests | 10 | 128 | 128 | -1 | [-2, 2] | 1 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | A | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver50Ms | 10 | 31 | 27 | -5 | [-7, -2] | 2 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | framesOver33Ms | 10 | 34 | 31 | -4 | [-12, 1] | 2 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP95Ms | 10 | 24.7 | 22 | -2.7 | [-4.4, 0.4] | 0.9 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | rafP99Ms | 10 | 98 | 158.6 | 57.3 | [36.8, 68.6] | 8 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | maxFrameMs | 10 | 235.7 | 322.1 | 77.9 | [30.3, 139.2] | 15.8 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | timeToSharpMs | 10 | 2928.7 | 3071.9 | 158.8 | [39.8, 257.9] | 49.9 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaints | 10 | 30 | 24 | -7 | [-7, -4] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsAtRest | 10 | 20 | 2 | -19 | [-19, -16] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | detailPaintsMoving | 10 | 11 | 22 | 12 | [10, 13] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | longFramesWithPaint | 10 | 30 | 24 | -7 | [-7, -4] | 1 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | loafScriptMs | 10 | 2903 | 3257 | 225 | [-54, 426] | 108 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodes | 10 | 860 | 724 | -136 | [-181, -114] | 21 | **yes** |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | requests | 10 | 0 | 1 | 0 | [-2, 3] | 0 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | decodedPeakBytes | 10 | 67108864 | 67108864 | 0 | [0, 0] | 0 | no |
| heldout-midzoom-hold | C | desktop | `93821ef545b3ed345c336a87fed7ef3290da36c4` | blankFrames | 10 | 0 | 0 | 0 | [0, 0] | 0 | no |
