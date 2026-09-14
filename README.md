# Microduck — Tiny duck. Big waddle.

A fan-made **3D scrollytelling landing page** for [Microduck](https://github.com/pollen-robotics/microduck), the 25 cm biped from Pollen Robotics (Hugging Face’s Bordeaux robotics team).

Scroll the page and a studio-lit 3D duck walks, explodes into parts, picks something up, falls over, gets back up, puts skates on, and lines up in the four official colourways.

This is not the official product site. Hardware facts come from the [press kit](https://pollen-robotics.com/microduck/press-kit/). Software is Apache-2.0; the mechanical and electronic design files are **not** open hardware.

## What I looked at first

There isn’t one canonical “the Microduck 3D landing page repo.” The flock posted a lot of takes. The ones that actually map onto this robot:

| Page | What it is |
| --- | --- |
| [pollen-robotics.com/microduck](https://pollen-robotics.com/microduck/) | Official product page — film, colourways, specs, store |
| [trymicroduck.com](https://trymicroduck.com/) | Browser twin: real MuJoCo + official ONNX policies at 50 Hz |
| [Hugging Face simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator) | Official in-browser RL playground (R3F + WASM MuJoCo) |
| [Sulat Kimi demo](https://microduck-landing-page.k3.demos.sulat.com/) | One-shot landing with an exploded hardware view |
| [microduck.net](https://microduck.net/) | Community promo page |
| [joeynyc/awesome-microduck](https://github.com/joeynyc/awesome-microduck) | Index of simulators, policies, and coverage |

For 3D scrollytelling craft (the “food repo” pattern: pinned WebGL + GSAP/R3F scroll), [leey611/world-of-halal](https://github.com/leey611/world-of-halal) is a clean reference: React Three Fiber scene, GSAP-driven scroll chapters, HTML overlay.

This page takes that structure and aims it at Microduck: one duck, nine chapters, scroll is the timeline.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43217](http://localhost:43217) (or whatever port you pass).

```bash
npm run dev -- --port 43217
```

## Stack

Next.js (App Router) · React Three Fiber · Drei · Lenis · Tailwind v4 · shadcn/ui

The duck is a procedural studio model (helmet visor, camera ring, stacked servos, colourway shells). It is a likeness, not the official mesh from `microduck_rl`.

## Official links

- Product: https://pollen-robotics.com/microduck/
- Store: https://store.pollen-robotics.com/collections/microduck
- Runtime: https://github.com/pollen-robotics/microduck
- Training: https://github.com/pollen-robotics/microduck_rl
