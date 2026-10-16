# Input / deep zoom / performance

Look: `components/sequence/HeroInspection.tsx`, `SequencePlayer.tsx`, `lib/sequence/{render,cache,request-budget,motion-quality,perf-profile}.ts`, `lib/preview.ts`. Existing `preview/gp-*`, `preview/scroll-*` and `fix/i5-scroll-feel` are tuning channels; inspect their own contracts before editing.
Run: `npm test`, `npm run test:request-budget`; `node --import ./scripts/register-ts-resolve.mjs scripts/gigapixel-engine-contracts.mjs`; camera-settle/preview-config contracts; perf READY runtime command on a static build.
Protect: D6/F7 motion decode hold, no blank/stale detail, scene-family purity, home no-story. Request-budget tests are not device frame-time proof. Do not merge gp-all as a shortcut.
