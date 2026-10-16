# Lightweight functional browser pilot

## Scope

`scripts/learning/functional.mjs` extracts the learning explorer DOM/JavaScript
checks from `scripts/learning/browser.mjs`: six lessons, ten initial records,
loading the real immutable dataset, and the filter sequence yielding 5, 1, 0, 1.
It does not replace the existing browser check. No app code or assets change.

Run against a trusted local static preview, using Node 22+ and Lightpanda 1.0.1:

```sh
LIGHTPANDA=/path/to/lightpanda BASE_URL=http://127.0.0.1:43219 \
  node scripts/learning/functional.mjs
ENGINE=chromium BASE_URL=http://127.0.0.1:43219 \
  node scripts/learning/functional.mjs
```

The script owns an ephemeral Lightpanda CDP server (`--port 0`), disables its
telemetry and core dumps, and closes it in `finally`. It does not attach to or
stop another browser. Chromium uses the existing `playwright-core` dependency.
Nothing installs a browser automatically. Missing binaries or protocol methods
are failures, never fallback successes.

Lightpanda runs real page JavaScript, fetch and DOM. Its path invokes DOM
`click()` and dispatches `change`; Chromium retains Playwright's real
click/select path. Identical functional results do **not** establish physical
pointer, hit-testing, keyboard or rendering parity. In this environment,
Playwright `locator.click()` over Lightpanda CDP times out on the learning load
button because the engine's geometry does not satisfy viewport checks. Do not
silence those assertions with `force: true` in a visual test.

## Routing

- Pure data/parser/component contracts: Node tests, jsdom or happy-dom where
  their APIs suffice; no browser claim.
- DOM/data loading/filter behavior: this Lightpanda pilot. Expand only after a
  matched Chromium baseline and a seeded failure both agree.
- Agent text navigation: opt-in agent-browser with Lightpanda; fresh isolated
  sessions and `snapshot -i`, then escalate on unsupported APIs or ambiguous
  visibility. Default agent-browser still launches Chrome.
- Real layout, responsive screenshots, image decode, no-JS native disclosures,
  pointer/keyboard actions, Lighthouse and Chrome frame traces: rendering
  engine, preferably pinned Chrome headless shell where it passes the original
  suite. Keep full Chrome for fidelity-sensitive features and regressions.
- WebKit/Firefox: cross-engine coverage, not an assumed memory optimization.
- WebGL/WebGPU: real rendering engine and explicit successful context/adapter
  and workload checks. API presence is insufficient; software rendering is not
  hardware performance proof.
- 120 Hz acceptance: real 120 Hz phone. Desktop headless timings cannot certify it.

## Differential evidence

The local benchmark ran five fresh-process repeats per engine on the same
static preview. The functional pilot passed five times in both Chromium and
Lightpanda, reading 282 records and producing 5, 1, 0, 1. A loopback proxy that
removed the **actual filter change listeners** from served `explorer.js` caused
both engines to fail the same `#learn-method=conservative-review` assertion
(actual 24, expected 5). The healthy original then passed. The mutation touched
only the proxy response, never the repository or shared preview.

Existing `process-browser.mjs` also passed unchanged under Chromium and
headless shell: desktop/mobile no-JS keyboard behavior, 26 disclosures,
24 image instances, image decoding, no overflow and zero hydration errors.
The full learning pipeline contracts passed. No Hermes configuration was changed.

Private machine-specific timings, raw receipts and the complete routing report
are held outside Git in the assigned light-browser evidence lane. Performance
numbers are host-specific observations, not universal engine guarantees.
