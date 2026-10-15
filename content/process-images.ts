export type ProcessImage = { src: string; width: number; height: number; alt: string; caption: string };

export const processImages: Record<string, ProcessImage> = {
  "hero": {
    "src": "/process/images/hero.webp",
    "width": 1024,
    "height": 1536,
    "alt": "Cobalt Microduck robot on stone plinths beneath a portrait and concrete arch.",
    "caption": "Blue, captured for the October 14 critique. A working render, not the reference."
  },
  "references": {
    "src": "/process/images/references.webp",
    "width": 1500,
    "height": 450,
    "alt": "Five reference posters showing Day, White, Blue, Dark and Night.",
    "caption": "The five reference stills. These are image-led targets, not renders of the finished scene."
  },
  "fidelity": {
    "src": "/process/images/fidelity.webp",
    "width": 1600,
    "height": 1804,
    "alt": "Reference, baseline and combined sharpness experiment with enlarged robot and stone details.",
    "caption": "September 30. Reference, baseline and combined filter, supersampling and artwork experiment. Better detail did not solve the material gap."
  },
  "warp": {
    "src": "/process/images/warp.webp",
    "width": 1600,
    "height": 900,
    "alt": "Reference and robot texture tests overlaid with a measurement grid.",
    "caption": "The apparent projection bug came from our own per-part stretches and head-registration warps."
  },
  "eyes": {
    "src": "/process/images/eyes.webp",
    "width": 1600,
    "height": 1350,
    "alt": "Five rows of eye crops comparing references, before and after image-free material repair.",
    "caption": "October 13 eye repair. The extra early-material example appears only in the Day row; it is not an earlier Day-lighting render."
  },
  "day-loop": {
    "src": "/process/images/day-loop.webp",
    "width": 1600,
    "height": 1262,
    "alt": "Day reference beside rounds 3, 70 and 73, with close-ups of the stone and print.",
    "caption": "The overnight Day continuation. Read the full frame first, then the stone, step and print crops. These rounds used a robot-masked review scope."
  },
  "day-stairs": {
    "src": "/process/images/day-stairs.webp",
    "width": 1600,
    "height": 1188,
    "alt": "Day reference next to the render with the rebuilt lower stair.",
    "caption": "The new stair at round 90. The owner locked this geometry, not the entire scene."
  },
  "day-seam": {
    "src": "/process/images/day-seam.webp",
    "width": 1420,
    "height": 540,
    "alt": "Close-ups of the plinth-to-step seam before and after the flush join.",
    "caption": "A notch-and-weld solution replaced the unsuccessful copy and parallel-step trials."
  },
  "day-print": {
    "src": "/process/images/day-print.webp",
    "width": 1024,
    "height": 1518,
    "alt": "Target and Day hand-print variants, including the wider outpainted arm.",
    "caption": "The hand print was widened by outpainting the arm, not stretching the existing image."
  },
  "day-sun": {
    "src": "/process/images/day-sun.webp",
    "width": 1600,
    "height": 984,
    "alt": "Day target compared with warm-yellow, orange and less-orange sunlight candidates.",
    "caption": "The sunlight trials. Separating the plinth illumination helped, but this comparison was not a final lighting approval."
  },
  "themes": {
    "src": "/process/images/themes.webp",
    "width": 1600,
    "height": 1007,
    "alt": "Five columns of scene references above the merged review renders.",
    "caption": "October 14 review selection: reference above, merged render below. None of the subsequent polish passes cleared the keep rule."
  },
  "blue-recovery": {
    "src": "/process/images/blue-recovery.webp",
    "width": 1600,
    "height": 790,
    "alt": "Canonical Blue print, generic port and recovered photo3 print on the robot.",
    "caption": "A recovered asset, not a new generation: the earlier cobalt-and-ivory print restored after the shared port dulled it."
  },
  "night-pivot": {
    "src": "/process/images/night-pivot.webp",
    "width": 1600,
    "height": 826,
    "alt": "Night reference and polish variants showing glowing robot, orb and planted stone.",
    "caption": "Night polish comparison. The final-pass component work started from polish F; the scene remains in progress."
  },
  "night-stone": {
    "src": "/process/images/night-stone.webp",
    "width": 1020,
    "height": 908,
    "alt": "Reference wet stone and moss beside the smoother current stone blocks.",
    "caption": "The owner checkpoint: the stone needed a different surface form, not another brightness adjustment."
  },
  "night-head": {
    "src": "/process/images/night-head.webp",
    "width": 1600,
    "height": 351,
    "alt": "Night reference head beside two rendered heads with different shell finishes.",
    "caption": "Paint under a glossy coat was the brief. Brushed-metal-looking microdetail was not."
  },
  "night-mushrooms": {
    "src": "/process/images/night-mushrooms.webp",
    "width": 1600,
    "height": 645,
    "alt": "Reference sprouts, current sprouts and older mushroom caps in comparison rows.",
    "caption": "A component can move backwards: recover the older cap shapes while keeping the newer stem variation."
  },
  "night-early": {
    "src": "/process/images/night-early.webp",
    "width": 1536,
    "height": 800,
    "alt": "Early Night mushroom reference beside rounds two and three of the lighting experiment.",
    "caption": "An earlier, separate Night experiment. A controlled fill-light move was kept, but reference-fidelity acceptance was not reached."
  },
  "critic-blue": {
    "src": "/process/images/critic-blue.webp",
    "width": 1600,
    "height": 1800,
    "alt": "Eight Blue critique regions paired reference-left and capture-right.",
    "caption": "Blue critique walkthrough, October 14. Reference left, capture right. These are diagnostic crops, not a global similarity score."
  },
  "critic-night": {
    "src": "/process/images/critic-night.webp",
    "width": 1536,
    "height": 1720,
    "alt": "Eight Night critique regions paired reference-left and capture-right.",
    "caption": "Night critique walkthrough, October 14. The crop pairs expose local readability and material problems hidden by the full-frame mood."
  },
  "stone-relief": {
    "src": "/process/images/stone-relief.webp",
    "width": 1600,
    "height": 1378,
    "alt": "Reference stone, frozen baseline and new relief in detailed comparison rows.",
    "caption": "October 15 relief trial: the blocker was reduced, not removed. Inferred height is not a measured scan."
  },
  "zoom": {
    "src": "/process/images/zoom.webp",
    "width": 1071,
    "height": 2379,
    "alt": "Mobile gigapixel-single preview during a pinch-and-pan test.",
    "caption": "Historical mobile preview used to inspect zoom behavior. This capture is not proof of current phone performance."
  },
  "editor": {
    "src": "/process/images/editor.webp",
    "width": 1440,
    "height": 1080,
    "alt": "Blue home poster with the head selected and an in-place editing panel.",
    "caption": "A separate local editor experiment moved from a second WebGL scene into the poster itself. It is not included in this page’s home build."
  },
  "identity": {
    "src": "/process/images/identity.webp",
    "width": 1600,
    "height": 1573,
    "alt": "Robot identity comparison grid across five material variants.",
    "caption": "An early identity audit: change the surface without silently changing the robot."
  }
};
