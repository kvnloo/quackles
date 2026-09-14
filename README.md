# Microduck — Tiny duck. Big waddle.

A fan-made **3D scrollytelling landing page** for [Microduck](https://github.com/pollen-robotics/microduck), the 25 cm biped from Pollen Robotics (Hugging Face’s Bordeaux robotics team).

Scroll the page: the official robot mesh walks, explodes into parts, picks something up, falls over, gets back up, puts skates on, lines up in the four colourways, then **morphs into the official in-browser simulator**.

This is not the official product site. Hardware facts come from the [press kit](https://pollen-robotics.com/microduck/press-kit/). Software is Apache-2.0; the mechanical and electronic design files are **not** open hardware.

## Don’t reinvent the wheel

The 3D duck is not a procedural stand-in. It is the official kinematic rig from the Hugging Face simulator:

| Piece | Source |
| --- | --- |
| `duck.js` rig + `microduck.glb` + `kinematics.json` | [pollen-robotics/microduck-simulator](https://huggingface.co/spaces/pollen-robotics/microduck-simulator) |
| Cream / Graphite / Lavender / Sky materials | `variants.js` from that same Space |
| Exploded anatomy chapter | [`@crazygl/hero-scroll-assemble-product`](https://crazygl.com/hero/scroll-assemble-product) pointed at the official GLB |
| Last chapters | iframe of the official MuJoCo WASM + ONNX playground |
| Smooth scroll | `lenis` (same family as a lot of the 3D landings in the flock) |

Vendored simulator files live in `vendor/microduck-simulator/` with a `NOTICE`. The GLB is ~1.3 MB in `public/robot/mjlab/`.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:43217](http://localhost:43217).

Machines without WebGL get a flat SVG likeness and the story still scrolls; the simulator iframe still loads at the end.

## Stack

Next.js (App Router) · React Three Fiber · Drei · Lenis · CrazyGL scroll-assemble · Tailwind v4 · shadcn/ui

## Official links

- Product: https://pollen-robotics.com/microduck/
- Store: https://store.pollen-robotics.com/collections/microduck
- Runtime: https://github.com/pollen-robotics/microduck
- Training: https://github.com/pollen-robotics/microduck_rl
- Simulator: https://huggingface.co/spaces/pollen-robotics/microduck-simulator
