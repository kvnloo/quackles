# RFC-001 implementation notes: the source compiler

**Status:** research tooling on `preview/rfc-001-compiler`. Nothing in the shipped site changes. #41 stays the production authority.
**Tracking:** #44
**Code:** `tools/compiler/`

## What exists

This is the issue's `compile-inspection-source` / `audit-source` / `promote-source`, built as one CLI:

```text
python3 tools/compiler/compile.py [--registry DIR] <verb>
  register ID --theme T --family F --source PNG|CHUNKDIR --recipe R [--blend B] [--edits E] [--renderer JSON] [--sidecar J]
  derive   ID plate|pyramid (--out PATH | --adopt PATH) [--url U]
  verify   ID [--plate F] [--pyramid D] [--out DIR]        -> proof .json + report .md, exit 1 = REFUSE
  promote  PROOF.json [--supersede OLD_ID]                 -> registry/promoted.json, exit 1 = REFUSE
  check-manifest manifest.json [--policy inspection-source.ts] [--root DIR] [--hidden hidden-pyramids.json]
```

### Provenance manifest

Each master has one file, `registry/masters/<id>.json`. It records:

- the recipe id;
- the blend path and sha256;
- the edits path and sha256;
- the renderer settings (engine, samples, devices, crop tiling);
- the resolution;
- the master sha256.

Two kinds of master are supported:

- A **single image**, such as the 201MP Blue PNG. Its identity is the file's sha, which is cross-checked against the render sidecar.
- A **chunk grid**, `c{col}_{row}.png`, as `render_1gp.py` writes it. Its identity is the sha of the canonical chunk list. Every chunk is cross-checked against its sidecar sha, so a 1GP master is content-addressed without ever being stitched or held in RAM.

Each derivative entry records `kind`, `status`, `sha256`, `parent` (the master sha) and its URL. The status is one of two values:

- `derived`: made by `derive --out` from the master;
- `claimed`: an existing artifact attached with `--adopt`, which the gate must still prove.

### The gate

`verify` returns ACCEPT only if every check below passes. Each check works on reductions or sampled tiles, so it runs on CPU.

| check | refuses when |
|---|---|
| master-integrity | the master no longer hashes to its registered identity |
| provenance | an input is not a recorded derivative, or changed since it was recorded |
| one-family | an input's recorded parent is a different master |
| plate-vs-master | the frozen contract (D2) fails at 384 px wide: full-frame mean dE ≤ 5, \|dL\| ≤ 3, registration ≤ 1 px, aspect ≤ 0.5 %. Grid cells with dE > 10 are reported for review but do not fail the check |
| pyramid-geometry | `source.dzi` is missing; its levels differ from the level dirs; the level sizes are not the master size halved with ceil; a level's tile grid is incomplete; or the pyramid stops above the 1024 px plate floor |
| pyramid-level0 | sampled level-0 tiles, edge tiles included, are not the master's pixels (dE > 1) |
| pyramid-nesting | the textured sampled tiles of level n+1 are not a 2× box of level n: dE > 2.5 or \|dL\| > 1 after a further 4× box, or median registration > 0.5 px |

`promote` never trusts a proof file. It **re-runs the gate** on the proof's inputs and writes only a fresh ACCEPT whose hashes match the proof. The theme must also have no other master in the ledger. Replacing a theme's master needs `--supersede <old>`, and the whole hierarchy is swapped in one step.

Hashes are always re-read from file content. A stat-keyed cache exists only as an opt-in (`QC_TRUST_HASH_CACHE=1`) for local iteration. Master reductions are recomputed every time and never read from disk.

By default each check samples 6 tiles, preferring textured ones. `--samples 0` checks every tile of every level, which is slow on 1GP.

## Results on today's data

These come from `tools/compiler/bootstrap.sh`, whose proofs are in `registry/proofs/`, and from `tests/test_realdata.py`. A run takes about 5 min on CPU, and no full 1GP frame is ever held in RAM.

| master | against | verdict | plate full dE / dL | note |
|---|---|---|---|---|
| blue-201mp | shipped Blue hero + legacy `0-3` pyramid | **ACCEPT** | 4.93 / −0.89 | Two cells are flagged: top-right poster at dE 14 and bottom-left plinth at dE 20. These are the poster and plinth defects already known from #43 |
| mushroom-1gp-r1 | `hidden/night-moss.png` + `gp/0-4` | **ACCEPT** | 0.89 / 0.26 | D8 is still open |
| blue-1gp-r1 | today's Blue plate | **REFUSE** | 66.4 / 4.5 | |
| day-1gp-r1 | today's Day plate | **REFUSE** | 36.3 / −34.3 | Was dE 9 against the pre-recipe plate. The `candidate-1gp` status for Day is now stale |
| white / dark / night 1gp-r1 | today's plates | **REFUSE** | 21.6 / 28.1 / 30.6 | |

All six 1GP pyramids pass level-0 (dE 0) and nesting. Each one is a faithful derivative of its own master. The refusals are about **scene identity**, which is exactly the #43 failure.

`check-manifest` gives two results on the shipped manifest:

- **Raw:** REFUSE. The Blue p0000000 ladder interleaves `blue-201mp` and `blue-1gp-r1` tiles, so today only the runtime policy in `lib/sequence/inspection-source.ts` keeps the families apart.
- **With that policy applied:** OK.

## Becoming a build-time invariant

Masters are hundreds of MB to GB and never enter git or CI. The invariant therefore splits in two:

1. **Offline (render box):** `register`, `derive` and `verify`, then `promote`. This step needs the masters. Its output is small and committed: the master JSON, the proof JSON and MD, and `promoted.json`. The ledger pins the sha256 of each proof.
2. **CI (no masters):** `npm run test:compiler`. It runs the unit suite, then `check-manifest` with the runtime policy and the hidden pyramids. The check fails if any of these hold:
   - a served ladder mixes masters, plate-only ladders included;
   - tiles come from an unpromoted or unregistered master;
   - a tile's level index or width is not a level of the promoted pyramid;
   - a plate in `public/` no longer hashes to its promoted derivative;
   - a promotion proof was edited after promotion.

   The policy parser strips comments and refuses duplicate rows. The check is cheap: only the plates are hashed.

To switch it on, add a job that runs on PRs touching any of these paths:

- `public/preview-scene/sequence/**`
- `lib/sequence/inspection-source.ts`
- `tools/compiler/**`

```yaml
- run: npm run test:compiler
```

The job is not wired into `.github/workflows` on this branch. The CI checks run in about 1 s plus the unit suite (about 50 s), and the real-data tests skip themselves without `QC_REALDATA=1`.

Two follow-ups would make the invariant explicit:

- **Explicit source ids in the manifest** (#44 step 1). Each tile variant would carry `source: {master, sha256}` emitted by the compiler. Both `check-manifest` and the runtime would then key on ids instead of the `/gp/` URL heuristic.
- **Deploy-side check.** The ledger pins the pyramid tree hash, but the copy published in `quackles-assets` is not verified. A publish step should re-hash the deployed tree against the ledger.

## Adversarial review

A blind adversarial verifier, given only the raw inputs, fooled the first version of the gate in nine ways:

- hand-editing a proof's verdict;
- same-size, same-mtime edits that the stat hash cache did not see;
- a planted reduction cache;
- policy rows hidden inside comments;
- unsampled partial edge tiles;
- truncated pyramids, or a missing `source.dzi`;
- plate-only ladders that mix masters;
- tile URLs pointing at levels that do not exist.

It also found false refusals:

- tile URLs starting with `/` were refused;
- a plate-only promotion dropped the pyramid promoted earlier.

Each of these now has a regression test (`Adversarial*` in `tests/test_unit.py`) and is fixed. Some limits remain and are accepted for now:

- **Tiles are not re-hashed in CI.** They live in `quackles-assets`, so a deploy-side hash check is still needed.
- **Candidate ladders are outside the invariant.** These are the `candidate-1gp` ladders, served only with `?inspectionCandidates=1`. Including them today would fail, because Day's candidate 1GP cannot be promoted.
- **The contract is full-frame.** It still permits:
  - a local defect covering about 6 % of the frame (reported as a cell note, not a failure);
  - mild blur;
  - a tiny or slightly cropped plate.

  The Blue hero passes with only 0.07 dE of margin, so a lossy re-encode of it would be refused. Tightening any of this changes the frozen contract (D2), which is the owner's call.
- **Nesting tolerance is fitted to the real data.** It was set from the real q82 mips. On synthetic, very high-frequency content, the compiler's own pyramid can exceed it.

## Still missing for "one master → every derivative"

- **Accepted masters for four themes.** Only Blue (201MP) and the mushroom have one. Day, White, Dark and Night need masters rendered from their accepted cinematic scenes, meaning the `scene-match/recipes.sh` scene plus edits, not the `quality-final-*` studio. Lane L3 is rendering ~201MP-class masters. Each should be registered at render time with `--blend` and `--edits`, then derived. A Blue 1GP-class candidate from the accepted Blue scene is still to be rendered (RFC-001 "Blue first"). It must beat the `blue-201mp` control through `verify`, then go through `promote --supersede blue-201mp`.
- **Plates are not derived yet.** The shipped plates are independent 48-spp denoised renders. Even the Blue hero only matches its master within the contract (dE 4.9), not by derivation. True single-master derivation means replacing each hero with `derive plate` output from the master. That changes pixels the owner has accepted (16-spp undenoised master versus a denoised plate), so it is an owner decision, and possibly a denoised-master render contract.
- **Render-side provenance.** The renderers should write the master manifest themselves, including the Blender version, the camera and render-contract hash, and the edits sha. Today `register` reconstructs these from sidecars, and the 1GP sidecars carry no edits or camera contract.
- **The other 51 frames per theme** have no masters. The invariant covers only ladders that serve tiles, by design.
- **RFC promotion criteria outside source correctness are not covered:**
  - semantic-crop identity beyond colour;
  - LOD pop;
  - device performance (RFC-002 and real hardware).

  Registration on near-black tiles is unmeasurable. Those tiles are skipped for the shift check and reported as `null`.
- **Owner decisions:**
  - D8: is the mushroom egg's audit reference acceptable?
  - Day `candidate-1gp`: it now fails at dE 36, so it should become `disabled`. This is not changed here because it is a runtime-policy edit.
