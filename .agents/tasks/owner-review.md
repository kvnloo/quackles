# Task: local owner chat evidence and public review tool

- Owner/lane: owner-review-backfill, explicit local owner assignment.
- Branch: `feat/owner-review`; base `14bb4e44d40dded965bc8c0613c083465b6b4957`, from `integ/site-2026-10-15`.
- Owned paths: `tools/owner-review/`, npm scripts, generated branch registry and this receipt. No site application behavior or private dataset changes.
- Runtime preview/URL: not deployed. Tests start disposable loopback servers on ephemeral ports.
- Lease: existing owner assignment retained; private lease ID omitted.
- Acceptance: chat source metadata, original UTC timestamps and verbatim quotes survive confirmation; null stars require a real source; UI wins per trial/aspect in either order; component feedback never grants trial acceptance; distinct unknown-trial receipts stay separate; repeated events deduplicate; pairwise evidence survives confirmation and other aspects; quote-only confirmation leaves optics unset.
- Public distribution: stdlib server/catalog/schema runtime, synthetic fixture, copied MIT license, source-of-truth README, explicit external data/artifact/evals configuration. Private history seed scripts and all dataset/image files excluded.
- Synchronized dream-loop commit: `8cad41c9a0d4e416844b48aa86347ae7cf1593e2` on `feat/owner-chat-backfill`, merged forward into `feat/blender-meta-loop` without discarding concurrent work.
- Mirror: `sync_mirror.py --check` confirms 20 runtime/test/schema files match dream-loop byte for byte, including the concurrently developed dream planner.
- RED proof: synthetic chat labels rejected by the original source validator; null bindings rejected; unbound receipts collapsed; null-star confirmation rejected; browser queues absent; portable catalog module absent and imaging imports blocked; review regressions reproduced lost pairwise evidence and invented LOOK optics before fixes.
- GREEN proof: `npm run test:owner-review` passed 56 tests including two headless browser cases; dream-loop `python3 scripts/run_tests.py` passed all 20 commands; `npm test` and `npm run lint` passed; `python3 scripts/test_agent_gitops.py` passed 5 tests; registry `snapshot` and `check --live` passed; both diffs pass `git diff --check`.
- Environment: existing dependencies shared through an ignored node_modules symlink after package-lock hashes matched; no dependency installation. Browser tests use an explicit owned headless Chromium binary and module, with profiles in disposable test directories.
- Existing warnings: unused `detailMix` in `components/sequence/SequencePlayer.tsx:185`; Node's process-contract runner reports module-type metadata warning. No errors.
- Independent read-only review: pairwise confirmation and quote-only optics findings fixed with observed RED then GREEN regressions. Additional intake tests cover source authentication, malformed metadata and calibration-consistent reports.
- Local integration follow-up: retained concurrent whole-frame scan and dream planner; portable CLI regression reproduced RED and fixed GREEN. Public tool suite now passes 67 tests; merged dream-loop passes 22 commands. Repo `npm test` and lint pass with the documented existing warnings. Live loopback verification uses separately held private data; no such data is committed. No fetch, push, PR or public deployment.
- Merge order: parent must integrate the latest dream-loop `feat/blender-meta-loop` with the owner-backfill mirror, then admit this quackles branch to the assigned local integration. Re-test the resulting merge; resolve any shared runtime conflicts from the public source of truth.
- READY SHA: the local commit containing this receipt, reported in the parent handoff. Registry records a generated inventory snapshot; moving tips do not invalidate identity coverage.
- Owner/parent actions: actual historical backfill, explicit data-directory configuration on restart, integration and any publication.
