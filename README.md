# Microduck

A mobile product study for [Pollen Robotics’ Microduck](https://github.com/pollen-robotics/microduck), with three studio themes: White, Blue and Dark.

Scroll changes the camera angle, cues a jump, then starts an exploded view at touchdown. The actual Blender set stays in world space and leaves the camera view through perspective and parallax. Scrolling backwards reconstructs the same pose. Reduced motion uses static assembled and exploded views.

The website is a work in progress. The native Cycles renders remain the visual reference for the browser scene; material, shadow and reflection parity is not complete. No physical Galaxy S25 / 120 Hz result has been established.

## Run

```sh
npm ci
npm run dev
```

Open [localhost:43217](http://localhost:43217). For the static production export:

```sh
npm test
npm run build
npm run preview
```

The high-resolution Blender still remains visible while the 3D assets load, or when WebGL cannot be used. Theme selection is synchronized across the robot, set and page. A canvas render error restores the still.

## Validate

```sh
npm run test:mobile:visual
npm run test:mobile:timing
python3 research-engine/ab_loop.py validate
```

The mobile harness separates deterministic screenshots from timing, records browser/GPU identity, and checks spatial continuity, touchdown order, reverse scrolling and reduced motion. Read the options in `scripts/mobile-validation.mjs` before selecting an output directory or GPU mode. Desktop Chromium with a phone viewport is not physical-phone evidence.

The original STL positions and triangle connectivity of the painted robot parts are retained. Authored color, roughness and normal atlases are transferred from Blender; alternate themes share geometry. The browser’s previous simplified tessellation is not identical to these original surfaces.

## Preview publishing

[GitHub Pages](https://kvnloo.github.io/quackles/) deploys this repository’s `nightly` branch using `.github/workflows/pages.yml`. Push authorized preview checkpoints to `nightly`; do not merge `main` or `dev`, and do not publish to the separate `quackles-nightly` repository.

Each export contains a `microduck-build` meta tag with its commit SHA and build time. A URL such as `https://kvnloo.github.io/quackles/?build=<sha>` helps distinguish a deployed checkpoint from a cached page.

## Research and provenance

`research-engine/` contains a portable concept graph, retrieved primary sources, falsifiable experiments and an alternating A/B research log. Source support and measured outcomes are recorded separately. Rejected experiments remain visible, including a lossless meshopt transport that enlarged the final compressed payload.

This is an unofficial fan study. The upstream [Microduck repository](https://github.com/pollen-robotics/microduck) supplies the model and product specifications; its licenses apply to the supplied assets. Contribution policy is in `AGENTS.md` and `CONTRIBUTING.md`.
