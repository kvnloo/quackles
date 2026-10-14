# Robot theme studio

`/studio/` is a client-only editor in the static Next export. It does not alter the home preview or run a server-side API.

## Use

```sh
npm run build
python3 -m http.server 43217 --bind 127.0.0.1 --directory out
# http://127.0.0.1:43217/studio/
```

Choose Day, White, Blue, Dark or Night; select a texture slot; upload PNG/JPEG/WebP; adjust tint and lighting. Uploads are downscaled to 2K and embedded in theme JSON. Save/load uses one explicit localStorage slot; export JSON for portable backups (browser storage quotas still apply). Imports are validated and reject expired blob URLs and remote/script URLs. PNG export is 1024 × 1536 from the locked hero camera.

The 6.63 MB Draco GLB is a web derivative of `day-r101-print.blend`, with the visible robot and set, explicit Creation/RegisteredPosterUV mappings, and a recorded camera. `public/studio/scene.json` records source and GLB hashes, camera, material slots and mesh inventory. Procedural Cycles materials, light linking and glass optics are approximated with standard PBR; this is not a parity render. Scene geometry/pose and camera are not editable in this MVP.

## Harnesses

Only **Connect** or **Probe local ports** contacts a harness; nothing is scanned automatically. Uploads remain local until the user explicitly permits transfer and clicks a generation action. No API key or subscription token is collected by this application.

- **ComfyUI**, default `http://127.0.0.1:8188`: prefer installed `CodexChatGPTImage`, otherwise use an installed SDXL checkpoint. Both text-to-image and reference img2img are implemented. The fallback in this MVP is **SDXL**, not Flux. JSON workflows are in `lib/harness/workflows/`.
- **OpenAI-compatible / Hermes**, default `http://127.0.0.1:8642/v1`: configurable URL and model; `/models`, `/images/generations`, multipart `/images/edits`; base64 and URL outputs. A reachable `/models` does not prove image endpoint/model support. Intended for a user's already-configured harness, not direct authenticated cloud-provider login.
- **Ollama**, default `http://127.0.0.1:11434`: installed model discovery and prompt rewriting only. It does not generate or edit images.

Start ComfyUI with the exact browser origin when possible:

```sh
python main.py --listen 127.0.0.1 --port 8188 \
  --disable-auto-launch --enable-cors-header 'http://127.0.0.1:43217'
```

For Ollama, configure `OLLAMA_ORIGINS` before `ollama serve`. Browser Local Network Access permission may also be required. HTTPS sites may block non-loopback HTTP servers as mixed content. CORS failure is not proof that a harness is offline. Do not expose these unauthenticated harness ports to the internet. Wildcard CORS is convenient for a local test, not the recommended permanent configuration.

Generation jobs are submitted once, never automatically retried or silently redirected to another provider after submission. **Stop waiting** aborts the client wait, not the server's already-queued job. Inspect the harness before retrying. Image restyling is generative and is not a guarantee of exact geometry preservation. Nothing is applied automatically: inspect the side-by-side result, download it, or apply it to the selected material slot.

## Verify without spending image allowance

```sh
npm test
npm run typecheck
npm run lint -- app/studio components/studio lib/harness lib/studio eslint.config.mjs
npm run lint -- --no-ignore scripts/studio-*.mjs
npm run build
PREVIEW_EXPECT=home node --import ./scripts/register-ts-resolve.mjs scripts/preview-config-contracts.mjs
npm run test:studio:static
```

The static smoke owns an ephemeral loopback server and isolated headless Chromium, cleans both up, and uses **SwiftShader EMULATION**, not real-GPU evidence. It tests all texture slots, live preset pixels, persistence/import/export, and a mocked ComfyUI restyle UI cycle. The default replay image is an exported hero fixture, not an AI output. `STUDIO_REPLAY_IMAGE=/absolute/path/to/real-output.png` replays a saved real output without spending another generation. `STUDIO_LIVE_DETECT=1` additionally checks the real loopback ComfyUI connection (no generation).

## Opt-in real receipt

First run the smoke with `ARTIFACTS=<directory>` to export `hero.png`, then **with owner permission**:

```sh
ARTIFACTS=<directory> node --import ./scripts/register-ts-resolve.mjs scripts/studio-live.mjs --live
```

This invokes the same shipped adapter, submits exactly one real ChatGPT image edit, reads back history, and writes prompt, input/output hashes, seconds, job ID and output path. It refuses a directory with an existing `generation-attempt.json` so accidental reruns do not spend again. Do not delete the attempt guard as a retry shortcut.

## Re-export (CPU only)

```sh
env -i HOME="$HOME" PATH=/usr/bin:/bin blender --background /path/to/day-r101-print.blend \
  --python scripts/studio-export.py
```

The exporter never saves the blend and checks its hash before/after. It exports selected visible geometry, explicit UV bindings and camera, applies Draco, bounds image dimensions to 2048, and rejects a GLB over 25 MB. The near/far clipping range in the browser is widened to 0.001–100 to avoid web-preview clipping; optical pose, aspect and field of view remain the source values. Draco decoder binaries are vendored unchanged from Three.js with Apache licensing.
