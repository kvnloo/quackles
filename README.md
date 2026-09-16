# Microduck — Tiny duck. Big waddle.

Fan-made **mobile product page** for [Microduck](https://github.com/pollen-robotics/microduck). One well-lit 3D product shot, HTML type and specs, then two scroll beats: **Explode** and **Jump**. Three studio finishes — White, Poster (cobalt), Dark — with a 360ms lerp.

Desktop layout is deferred — the live site is a 430px phone column.

This is not the official product site. Hardware facts come from the [press kit](https://pollen-robotics.com/microduck/press-kit/). Software is Apache-2.0; mechanical and electronic design files are **not** open hardware.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43217](http://localhost:43217).

Machines without WebGL get a cream-studio line drawing.

## Perf check

```bash
npm run test:scroll
```

Records WebGL frame times at 430×932 while scrolling explode → jump.

## GitHub Pages

The app is a static export (`next build` → `out/`). `.github/workflows/pages.yml` deploys:

- [`kvnloo/quackles`](https://github.com/kvnloo/quackles) from [`nightly`](https://github.com/kvnloo/quackles/tree/nightly) → [https://kvnloo.github.io/quackles/](https://kvnloo.github.io/quackles/)
- [`kvnloo/quackles-nightly`](https://github.com/kvnloo/quackles-nightly) from `main` (`NEXT_PUBLIC_BASE_PATH=/quackles-nightly`) → [https://kvnloo.github.io/quackles-nightly/](https://kvnloo.github.io/quackles-nightly/)

Each export stamps `<meta name="microduck-build" content="<git sha> <ISO UTC>">` and a matching footer line so a stale tab is obvious.

GitHub Pages serves `index.html` with `Cache-Control: max-age=600`. Hashed `_next/static/*` assets are cached much longer. If HTML is stale, the browser keeps old JS/CSS and the old slider/theme. After a deploy, hard-refresh once (Cmd/Ctrl-Shift-R). Unique URLs that force a distinct HTML cache key:

- `https://kvnloo.github.io/quackles/?v=<sha>`
- `https://kvnloo.github.io/quackles-nightly/?v=<sha>`

After each working commit, push both live branches (`git push origin main nightly && git push github main nightly && git push nightly-pages main`).

## Verified OSS Loop

Onboarded with [`oss-onboard --with-automation --scheme rolling`](https://github.com/kvnloo/verified-oss-loop) from [kvnloo/verified-oss-loop](https://github.com/kvnloo/verified-oss-loop). Contribution contract: `AGENTS.md`, `CONTRIBUTING.md`, `prompt.md`. Workers never merge `main` or `dev`.

## Stack

Next.js (static export) · React Three Fiber · official Microduck GLB/kinematics · native scroll
