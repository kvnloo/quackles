# Microduck — Tiny duck. Big waddle.

Fan-made **3D scrollytelling** for [Microduck](https://github.com/pollen-robotics/microduck). It opens on a studio product shot of the official mesh, scrolls through the features, then **morphs into [Try Micro Duck](https://trymicroduck.com/)** — the real in-browser twin (official MuJoCo physics + RL policies, optional camera hands).

This is not the official product site. Hardware facts come from the [press kit](https://pollen-robotics.com/microduck/press-kit/). Software is Apache-2.0; mechanical and electronic design files are **not** open hardware.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43217](http://localhost:43217).

Machines without WebGL get a flat SVG likeness; the Try Micro Duck iframe still loads at the end.

## GitHub Pages

The app is a static export (`next build` → `out/`). `.github/workflows/pages.yml` deploys on every push to `main`, on a nightly cron, and on manual dispatch. Lint and typecheck run as parallel jobs, then deploy.

Enable **Settings → Pages → GitHub Actions**. After the first green run the site is:

```text
https://<github-username>.github.io/<repo>/
```

If the repo is named `<username>.github.io`, it deploys at the domain root.

## Stack

Next.js (static export) · React Three Fiber · official Microduck GLB/kinematics · CrazyGL scroll-assemble · Lenis · Try Micro Duck iframe

## Official links

- Product: https://pollen-robotics.com/microduck/
- Try it: https://trymicroduck.com/
- Hugging Face playground: https://huggingface.co/spaces/pollen-robotics/microduck-simulator
- Runtime: https://github.com/pollen-robotics/microduck
- Training: https://github.com/pollen-robotics/microduck_rl
