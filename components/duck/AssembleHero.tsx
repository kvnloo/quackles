"use client";

import { assetPath } from "@/lib/paths";
import "@crazygl/hero-scroll-assemble-product/style.css";
import ScrollAssembleProduct from "@crazygl/hero-scroll-assemble-product";

export function AssembleHero() {
  return (
    <ScrollAssembleProduct
      productModel={assetPath("/robot/mjlab/microduck.glb")}
      heading="Helmet head. Serious internals."
      subheading="The official mesh, exploded with CrazyGL’s scroll-assemble hero — visor camera, 8×8 ToF, stacked neck servos, RK3566 in the trunk."
      layout="content-left"
      modelScale={4.8}
      restSpin={28}
      positionX={0.16}
      positionY={-0.04}
      explodeDistance={1.12}
      explodeFromAxis={0.4}
      assembleEnd={0.68}
      swirlAmount={0.12}
      restBreath={0.1}
      cameraDistance={1.15}
      cameraPathAmount={0.22}
      showLabels
      benefitLabels={[
        "Visor camera + 8×8 ToF",
        "Grasping beak",
        "15 Dynamixel motors",
        "RK3566 in the trunk",
      ]}
      accentColor="#e56b1a"
      keyLightColor="#fff4e5"
      fillLightColor="#9eb6ff"
      rimLightColor="#ffd8b0"
      transparent
      bgTopColor="#100e0c"
      bgBottomColor="#100e0c"
      scrollLength={220}
    />
  );
}
