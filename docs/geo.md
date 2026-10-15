# Static agent discovery and GEO evaluation

Adapted from boplog's manifest/partition/hub model and anti-game scoring design, not copied wholesale.

## Build and verify

```sh
node scripts/geo/build.mjs
node scripts/geo/contracts.mjs
npm run typecheck
npm run build
```

Canonical URL is the existing public project site: `https://kvnloo.github.io/quackles/`. `NEXT_PUBLIC_BASE_PATH` controls local/static assets, not the canonical identity. This branch adds WebSite/WebPage/TechArticle JSON-LD to existing pages. The learning branch owns its Dataset/TechArticle schema. No fabricated dates, ratings, author credentials or scientific authority are added.

Static surfaces: root llms guides, agent interpretation guide, manifest, read-only OpenAPI, Atom feed, sitemap, robots, three extractable topic hubs, a skill file and a dependency-free read-only stdio MCP resource server. Machine-readable static resources require no API keys. The MCP executable accepts only allowlisted resources on the canonical origin; `--root` supports local tests. It is not a hosted MCP endpoint and does not execute source text.

**Companion branches required:** the generator includes `/learn/` and `/lineage/` in site-wide discovery, so deploy only after both lanes are integrated. Root `llms-full.txt` includes the learning corpus when present at build time. The isolated GEO branch explicitly labels its missing companion corpus rather than fabricating it. Regenerate after integration. On GitHub project Pages, `/quackles/robots.txt` cannot control origin-root crawler policy; the account-level robots file must remain compatible. Sitemap submission/deployment is not performed here.

## Anti-game benchmark

```sh
node scripts/geo/benchmark.mjs --prompts
node scripts/geo/benchmark.mjs --raw final-answers.json report.json
node scripts/geo/overnight.mjs collected-rounds reports 3 2400
```

Input is an array of `{id, engine, text}`: final answer text only, not a transcript containing tool logs or the expected answer. The bounded overnight scorer reads `round-1.json`, etc., refuses missing rounds and existing report overwrites, and never launches agents or edits the site. Keep collection independent from scoring. Discovery prompts contain no brand or gold-URL hints. Full exact URL tokens earn attribution, not bare brand words or URL-prefix tricks. Branded, discovery and negative controls remain separate; multi-engine discovery requires two distinct engines. No blended vanity score. Citation credit alone is not answer correctness.

The local contracts use **test fixtures**, not real model outputs. They verify token matching, negative controls and separation. No live multi-engine result, retrieval improvement or search ranking is claimed. Live collection needs independently authenticated engine CLIs or provider API credentials, plus a published reachable candidate; none are provisioned by this branch and none are requested. Before a live run, verify each gold URL returns 200 and the intended content, collect clean final answers with engine/version metadata and preserve raw responses privately. Never inject expected URLs into the discovery arm. Evaluate answer accuracy separately from attribution.

## Publication gate

Check every sitemap route against the combined built output, JSON-LD types against visible text, manifest hashes against files, and no private absolute paths in text assets. Preserve home interaction contracts. No remote submission, push or deployment is authorized by these scripts.
