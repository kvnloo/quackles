# Microduck — Tiny duck. Big waddle.

Fan-made **mobile poster + 3D scrollytelling** for [Microduck](https://github.com/pollen-robotics/microduck). It opens on a cream-and-cobalt magazine frame (classical bust, stone plinths, editorial type). Scroll from that first frame through the robot’s features; the last chapters **morph into [Try Micro Duck](https://trymicroduck.com/)**.

Desktop layout is intentionally deferred — the live site is a 430px phone column.

This is not the official product site. Hardware facts come from the [press kit](https://pollen-robotics.com/microduck/press-kit/). Software is Apache-2.0; mechanical and electronic design files are **not** open hardware.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43217](http://localhost:43217).

Machines without WebGL get a flat SVG likeness standing on the same poster; the Try Micro Duck iframe still loads at the end.

## GitHub Pages

The app is a static export (`next build` → `out/`). `.github/workflows/pages.yml` deploys on every push to `main`, on a nightly cron, and on manual dispatch. Lint and typecheck run as parallel jobs, then deploy.

Enable **Settings → Pages → GitHub Actions**. After the first green run the site is:

```text
https://<github-username>.github.io/<repo>/
```

If the repo is named `<username>.github.io`, it deploys at the domain root.

## Stack

Next.js (static export) · React Three Fiber · official Microduck GLB/kinematics · Lenis · Try Micro Duck iframe

## Official links

- Product: https://pollen-robotics.com/microduck/
- Try it: https://trymicroduck.com/
- Hugging Face playground: https://huggingface.co/spaces/pollen-robotics/microduck-simulator
- Runtime: https://github.com/pollen-robotics/microduck
- Training: https://github.com/pollen-robotics/microduck_rl
