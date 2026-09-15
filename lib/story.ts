export const STORY = [
  {
    id: "hero",
    kicker: "Unofficial product film · Pollen Robotics",
    title: "Tiny duck.\nBig waddle.",
    body: "A 25 cm biped with 15 motors, a grasping beak, and a neural policy loop running at 50 Hz. Playable out of the box. Yours to retrain.",
  },
  {
    id: "scale",
    kicker: "Desk-sized physical AI",
    title: "It fits between the laptops that train it.",
    body: "Twenty-five centimetres tall, under 800 grams, 14 cm wide. Failed attempts end with a small robot on the floor — then it stands itself up.",
  },
  {
    id: "anatomy",
    kicker: "The mechanics are the character",
    title: "Helmet head. Serious internals.",
    body: "A camera in the visor, an 8×8 time-of-flight matrix, two IMUs, stacked Dynamixel servos in the neck, and a Rockchip RK3566 in the body. The duck silhouette is the industrial design, not a costume.",
  },
  {
    id: "waddle",
    kicker: "01  ·  walk-v1.onnx",
    title: "Walking is not an animation.",
    body: "The gait is a reinforcement-learning policy trained in MuJoCo, exported to ONNX, and run on the robot. Strafe, reverse, turn in place — all velocity tracking with unmistakable duck energy.",
  },
  {
    id: "grab",
    kicker: "02  ·  pickup.onnx",
    title: "Beak to the floor. One button.",
    body: "The whole body lowers, the articulated beak closes, and the object comes along. Ground pick is a trained skill, not a scripted keyframe.",
  },
  {
    id: "recover",
    kicker: "03  ·  getup.onnx",
    title: "Knock it over. It gets back up.",
    body: "Flat on its back to standing, by itself, ready for the next command. That is why it can live on a desk instead of a lab cage.",
  },
  {
    id: "skate",
    kicker: "04  ·  roller-skate.onnx",
    title: "Put wheels on. Load the other brain.",
    body: "Roller skating is a separately trained policy that only loads when the skates are equipped. Same robot. Different feet. Different mind.",
  },
  {
    id: "colorways",
    kicker: "Four shells. Same brains.",
    title: "Cream, Graphite, Lavender, Sky.",
    body: "Calibrated from the press photos. Pick a shell — the 15 motors, the camera, and the 50 Hz loop underneath do not change.",
  },
  {
    id: "play",
    kicker: "The product shot becomes the twin",
    title: "Scroll into the real sim.",
    body: "This is Try Micro Duck: official MuJoCo physics and official RL policies in your browser. WASD to walk. Open the camera and your hands are solid in the scene — pet it, slap it, knock it over. It gets back up.",
  },
  {
    id: "cta",
    kicker: "Apache-2.0 software  ·  $399 intro",
    title: "Train in sim. Waddle in reality.",
    body: "The SDK, the simulation, and the full RL stack are on GitHub. What the robot runs is what you can read, fork, and retrain. Hardware design files are not open — only the software is.",
  },
] as const;

export const SPECS = [
  { value: "15", label: "Motors", hint: "legs, neck, head, beak" },
  { value: "25 cm", label: "Tall", hint: "14 cm wide" },
  { value: "<800 g", label: "To pick up", hint: "built to fall" },
  { value: "50 Hz", label: "Policy loop", hint: "onboard, real-time" },
  { value: "RK3566", label: "Compute", hint: "1 GB RAM · 32 GB" },
  { value: "7", label: "Shipped moves", hint: "retrainable policies" },
] as const;

export const MOVES = [
  { name: "Walk", file: "walk-v1.onnx", detail: "Velocity-tracking gait" },
  { name: "Sit & stand", file: "sit-stand.onnx", detail: "Hold the pose, stand back up" },
  { name: "Grab", file: "pickup.onnx", detail: "Beak to the floor, scoop" },
  { name: "Kick", file: "kick.onnx", detail: "One clean boot" },
  { name: "Get up", file: "getup.onnx", detail: "Back to standing" },
  { name: "Roller skate", file: "roller-skate.onnx", detail: "Wheels on, other brain" },
] as const;

export const LINKS = {
  official: "https://pollen-robotics.com/microduck/",
  store: "https://store.pollen-robotics.com/collections/microduck",
  github: "https://github.com/pollen-robotics/microduck",
  rl: "https://github.com/pollen-robotics/microduck_rl",
  simulator: "https://huggingface.co/spaces/pollen-robotics/microduck-simulator",
  tryBrowser: "https://trymicroduck.com/",
  press: "https://pollen-robotics.com/microduck/press-kit/",
  blog: "https://pollen-robotics.com/microduck/blog/introducing-microduck/",
} as const;
