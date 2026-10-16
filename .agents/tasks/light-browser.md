# Lightweight browser lane

- Owner: delegated light-browser lane; local only, no publication.
- Branch: `chore/light-browser-tests`.
- Base: `integ/site-2026-10-15`, `724e4ce9b693e2967d41eeb1edf2233a4e0cb111`.
- Scope: compare browser tooling externally; add one DOM/JS functional test pilot.
- Owned paths: `scripts/learning/functional.mjs`, `docs/light-browser-tests.md`, this task receipt.
- Protected: app components, styles, art, existing visual/performance tests, dependencies and Hermes configuration.
- Lease: acquired through `scripts/branch_lease.py`; private ID outside Git.
- Preview: existing owner-provided loopback integration preview, no new deployment.

## Acceptance and proof

- Real lesson count, initial records, immutable dataset load and filter sequence
  agree with the existing Chromium browser check.
- Five healthy repeats per engine; Lightpanda and Chromium both report PASS.
- Red: remove served explorer filter change listeners with an owned loopback
  proxy; both engines exit 1 at the same expected-5/actual-24 assertion.
- Green: original preview, no source mutation; both engines pass.
- `node --check scripts/learning/functional.mjs`.
- `eslint --no-ignore scripts/learning/functional.mjs`.
- `npm run test:learning`.
- Existing `scripts/process-browser.mjs` passes unchanged in full Chromium and
  headless shell using the integration static build.
- Browser package versions, five-run metrics, capability failures, screenshots,
  raw traces and report remain in the private evidence lane outside Git.
- No public push, protected branch merge, Hermes reconfiguration or rendering
  gate deletion. Full product build is not repeated: only a test and docs change.
