# Microduck — Tiny duck. Big waddle.

Fan-made **mobile product page** for [Microduck](https://github.com/pollen-robotics/microduck). One well-lit 3D product shot, HTML type and specs, then two scroll beats: **Explode** and **Jump**. Quiet cream / cobalt, optional paper→cobalt→ink slider.

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

The app is a static export (`next build` → `out/`). `.github/workflows/pages.yml` deploys on every push to `main`.

Development snapshots land on [`nightly`](https://github.com/kvnloo/quackles/tree/nightly). After each working commit, push that branch too (`git push origin nightly && git push github nightly`).

## Stack

Next.js (static export) · React Three Fiber · official Microduck GLB/kinematics · native scroll
