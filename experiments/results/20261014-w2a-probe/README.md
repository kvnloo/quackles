# W2A forced-redraw probe

Command: `node scripts/lab/redraw-probe.mjs --refs 1b637ed1…,18bb1dec…,11d42fd4… --trials 3` (harness `5fc18dc`). 3 trials per cell. Blue 201 MP, 1440x1000 at DPR 2, SwiftShader. Paints counted in the 2.5 s after the trigger. Paint frames are the Long Animation Frames (>= 50 ms) that contain a paint.

| state | trigger | C paints | G paints | P paints | C paint frames (LoAF ms) | G, P end-state pixel diff vs C (maxDiff) |
|---|---|---|---|---|---|---|
| 2.5x-zero-slack | unchanged | 2, 2, 2 | 0, 0, 0 | 2, 2, 2 | 138, 137, 154, 187, 149, 125 | G 0/0/0, P 0/0/0 |
| 2.5x-zero-slack | theme-same | 5, 5, 5 | 0, 0, 0 | 5, 5, 5 | 171, 170, 135, 130, 147, 147, 151, 138, 131, 154, 188, 155, 118, 129, 143 | G 0/0/0, P 0/0/0 |
| 2.5x-zero-slack | theme-switch | 2, 2, 2 | 1, 1, 1 | 2, 2, 2 | 146, 164, 141 | G 0/0/0, P 0/0/0 |
| 2.5x-zero-slack | late-plate | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | — | G 0/0/0, P 0/0/0 |
| 2.5x-zero-slack | resize | 4, 4, 4 | 0, 0, 0 | 4, 4, 4 | 150, 140, 164, 140, 173, 145, 165, 177, 187, 198, 197, 147 | G 0/0/0, P 0/0/0 |
| 8x-interior | unchanged | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | — | G 0/0/0, P 0/0/0 |
| 8x-interior | theme-same | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | — | G 0/0/0, P 0/0/0 |
| 8x-interior | theme-switch | 1, 1, 1 | 1, 1, 1 | 1, 1, 1 | — | G 0/0/0, P 0/0/0 |
| 8x-interior | late-plate | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | — | G 0/0/0, P 0/0/0 |
| 8x-interior | resize | 0, 0, 0 | 0, 0, 0 | 0, 0, 0 | — | G 0/0/0, P 0/0/0 |
