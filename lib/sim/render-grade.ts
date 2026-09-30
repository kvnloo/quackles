/**
 * Per-theme light rig + grade for the live robot, derived from the Blender scenes that rendered the plates
 * (overnight/preserved/proofs-v2-scenes/<theme>-cinematic.blend + scene-match/edits/final-<theme>.json; day =
 * runner-clean configure_theme('day') on the white donor + final-day-pores.json). Values below are read from those
 * scenes after configure_motion/apply_motion(1): light transforms, powers and colours, the world's three paths
 * (diffuse = flat colour, glossy/transmission = studio_small_09 at Mapping Z 0.78, camera rays = flat backdrop colour),
 * and the view transform (Khronos PBR Neutral, exposure 0, sRGB) -> three NeutralToneMapping.
 *
 * Unit mapping (Cycles -> three, physically based lights, same metres):
 *   area light of power P -> SpotLight intensity P/pi cd, decay 2, hemisphere cone (on-axis intensity of a Lambertian
 *   emitter of radiance P/(pi A) and area A); sun of strength S -> DirectionalLight intensity S; uniform world diffuse
 *   of radiance C*S -> AmbientLight C, intensity pi*S. Blender (x, y, z) -> three (x, z - 0.125, -y)
 *   (inverse of cinematic_motion._three_to_blender).
 *
 * Calibrated terms (fitted to the p1000000 plates by coordinate descent on per-pixel robot dE; everything else is
 * read straight from the scenes):
 *   - RIM_GAIN: the Blender rim is a 0.15 x 0.48 m strip; as a point-like spot its glossy highlight is far smaller, so
 *     its power is raised 4x (best in every lit theme: white/blue/dark).
 *   - world `occlusion`: the set occludes the world's diffuse light and three has no GI (day's world is white x1 but the
 *     robot sits in a dark room -> 0.18; blue/dark get 3x for the set's bounce that Cycles adds and three cannot).
 *   - blue fill x2 / env x1.5 and dark key x1.4: remaining bounce-light deficit of the enclosed set in those themes.
 * Robot materials are never touched here — only light, environment and tone.
 */
import type { ThemeId } from "@/lib/sequence/manifest";

export type Vec3 = [number, number, number];
export type RigLight = { color: Vec3; power: number };
export type ThemeGrade = {
  /** Key area light (studio themes) or the day sun, as the one shadow-casting light. */
  key: { color: Vec3; intensity: number; position: Vec3; target: Vec3; kind: "area" | "sun" };
  fill: RigLight;
  rim: RigLight;
  bounce: RigLight;
  /** World diffuse radiance (colour x strength) and how much of it reaches the robot. */
  world: { color: Vec3; strength: number; occlusion: number };
  /** Glossy-ray environment strength (studio_small_09) and its yaw in three (radians about +Y). */
  envIntensity: number;
  envRotationY: number;
  /** Camera-ray backdrop, scene-linear, before the view transform. */
  backdrop: Vec3;
  exposure: number;
};

export const blenderToThree = ([x, y, z]: Vec3): Vec3 => [x, z - 0.125, -y];
const blenderDirToThree = ([x, y, z]: Vec3): Vec3 => [x, z, -y];

/** Blender area-light transforms (identical in every studio scene) and the day sun, in Blender coordinates. */
export const BLENDER_LIGHTS = {
  key: { position: [-0.42, -0.55, 0.79] as Vec3, direction: [0.5293, 0.6457, -0.5504] as Vec3, size: [0.095, 0.145] },
  fill: { position: [0.5, -0.38, 0.45] as Vec3, direction: [-0.6621, 0.6936, -0.2838] as Vec3, size: [0.55, 0.65] },
  rim: { position: [0.46, 0.22, 0.68] as Vec3, direction: [-0.6535, -0.2752, -0.7051] as Vec3, size: [0.15, 0.48] },
  bounce: { position: [0.04, -0.9, 0.24] as Vec3, direction: [0.0416, 0.9986, 0.0312] as Vec3, size: [0.9, 0.8] },
  sun: { direction: [0.5553, -0.5103, -0.6566] as Vec3 },
} as const;

/** World environment rotation: Blender Mapping Z 0.78 about Z-up == three Y. Sign/seam confirmed by an 8-yaw sweep
 * against the plates (this yaw was the robot-dE minimum in all four lit themes; the pi-shifted one was worst-but-one). */
export const ENV_ROTATION_Y = -0.78;
/** The day sun is modelled as a distant spot so one shadow-casting light serves every theme. */
export const SUN_DISTANCE = 6;
/** Where the Blender key aims (pose-0 robot), in three coordinates. */
const KEY_POS = blenderToThree(BLENDER_LIGHTS.key.position);
const KEY_TARGET = ((): Vec3 => {
  const [x, y, z] = KEY_POS, [dx, dy, dz] = blenderDirToThree(BLENDER_LIGHTS.key.direction);
  return [x + dx, y + dy, z + dz];
})();
const SUN_TARGET: Vec3 = [0.096, 0.2, -0.06];
const SUN_POS = ((): Vec3 => {
  const dir = blenderDirToThree(BLENDER_LIGHTS.sun.direction);
  return [SUN_TARGET[0] - dir[0] * SUN_DISTANCE, SUN_TARGET[1] - dir[1] * SUN_DISTANCE, SUN_TARGET[2] - dir[2] * SUN_DISTANCE];
})();

const area = (color: Vec3, power: number): RigLight => ({ color, power });
const RIM_GAIN = 4;
const NIGHT_RIM = 0.25;
const studioKey = (color: Vec3, power: number): ThemeGrade["key"] => ({ color, intensity: power / Math.PI, position: KEY_POS, target: KEY_TARGET, kind: "area" });

/** THEME_IDS order: day, white, blue, dark, night. */
export const THEME_GRADES: Record<ThemeId, ThemeGrade> = {
  day: {
    // Sun 14 (1, .9, .76); area lights 0; world white x1 for diffuse, env x1 for glossy; near-black backdrop.
    key: { color: [1, 0.9, 0.76], intensity: 14 * SUN_DISTANCE * SUN_DISTANCE, position: SUN_POS, target: SUN_TARGET, kind: "sun" },
    fill: area([0.86, 0.91, 1], 0),
    rim: area([1, 0.95, 0.86], 0),
    bounce: area([1, 0.95, 0.9], 0),
    world: { color: [1, 1, 1], strength: 1, occlusion: 0.18 },
    envIntensity: 1,
    envRotationY: ENV_ROTATION_Y,
    backdrop: [0.008, 0.008, 0.01],
    exposure: 0,
  },
  white: {
    key: studioKey([1, 0.96, 0.9], 20),
    fill: area([0.86, 0.91, 1], 0.44),
    rim: area([1, 0.95, 0.86], 3.12 * RIM_GAIN),
    bounce: area([1, 0.95, 0.9], 0.22),
    world: { color: [0.8, 0.75, 0.68], strength: 0.055, occlusion: 1 },
    envIntensity: 0.4,
    envRotationY: ENV_ROTATION_Y,
    backdrop: [0.64, 0.61, 0.55],
    exposure: 0,
  },
  blue: {
    key: studioKey([0.12, 0.2, 1], 53),
    fill: area([0.05, 0.12, 1], 1.38 * 2),
    rim: area([0.3, 0.42, 1], 7.2 * RIM_GAIN),
    bounce: area([0.08, 0.15, 1], 0.54),
    world: { color: [0.02, 0.035, 1], strength: 0.12, occlusion: 3 },
    envIntensity: 0.4 * 1.5,
    envRotationY: ENV_ROTATION_Y,
    backdrop: [0.001, 0.006, 0.65],
    exposure: 0,
  },
  dark: {
    key: studioKey([1, 0.96, 0.9], 21 * 1.4),
    fill: area([0.65, 0.76, 1], 0.17),
    rim: area([0.18, 0.35, 1], 4.8 * RIM_GAIN),
    bounce: area([1, 0.95, 0.9], 0.22),
    world: { color: [0.16, 0.23, 0.4], strength: 0.025, occlusion: 3 },
    envIntensity: 0.3,
    envRotationY: ENV_ROTATION_Y,
    backdrop: [0.002, 0.002, 0.003],
    exposure: 0,
  },
  night: {
    // Every light, the world and the orb core are 0: the plate robot is visible only through its own additive glow,
    // which the live rig has no mask for. Deliberate deviation: keep dark's blue rim at NIGHT_RIM so the live robot is
    // never an invisible silhouette at the handoff (blue as light only; materials untouched).
    key: studioKey([1, 0.96, 0.9], 0),
    fill: area([0.65, 0.76, 1], 0),
    rim: area([0.18, 0.35, 1], 4.8 * RIM_GAIN * NIGHT_RIM),
    bounce: area([1, 0.95, 0.9], 0),
    world: { color: [0.16, 0.23, 0.4], strength: 0, occlusion: 1 },
    envIntensity: 0,
    envRotationY: ENV_ROTATION_Y,
    backdrop: [0, 0, 0],
    exposure: 0,
  },
};

const ORDER: readonly ThemeId[] = ["day", "white", "blue", "dark", "night"];
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const mixLight = (a: RigLight, b: RigLight, t: number): RigLight => ({ color: mix3(a.color, b.color, t), power: mix(a.power, b.power, t) });

export function mixGrade(a: ThemeGrade, b: ThemeGrade, t: number): ThemeGrade {
  if (t <= 0) return a;
  if (t >= 1) return b;
  return {
    key: { color: mix3(a.key.color, b.key.color, t), intensity: mix(a.key.intensity, b.key.intensity, t), position: mix3(a.key.position, b.key.position, t), target: mix3(a.key.target, b.key.target, t), kind: t < 0.5 ? a.key.kind : b.key.kind },
    fill: mixLight(a.fill, b.fill, t),
    rim: mixLight(a.rim, b.rim, t),
    bounce: mixLight(a.bounce, b.bounce, t),
    world: { color: mix3(a.world.color, b.world.color, t), strength: mix(a.world.strength, b.world.strength, t), occlusion: mix(a.world.occlusion, b.world.occlusion, t) },
    envIntensity: mix(a.envIntensity, b.envIntensity, t),
    envRotationY: mix(a.envRotationY, b.envRotationY, t),
    backdrop: mix3(a.backdrop, b.backdrop, t),
    exposure: mix(a.exposure, b.exposure, t),
  };
}

/** Grade at a presented (fractional) sequence theme index, blending neighbours like the plate cross-fade. */
export function gradeAt(presented: number, grades: Record<ThemeId, ThemeGrade> = THEME_GRADES): ThemeGrade {
  const x = Math.max(0, Math.min(ORDER.length - 1, Number.isFinite(presented) ? presented : 0));
  const low = Math.floor(x), high = Math.min(ORDER.length - 1, low + 1);
  return mixGrade(grades[ORDER[low]], grades[ORDER[high]], x - low);
}

/** Khronos PBR Neutral (== Blender's "Khronos PBR Neutral" view transform == three NeutralToneMapping), linear in/out. */
export function pbrNeutral([r, g, b]: Vec3): Vec3 {
  const startCompression = 0.8 - 0.04, desaturation = 0.15;
  const x = Math.min(r, g, b), offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let c: Vec3 = [r - offset, g - offset, b - offset];
  const peak = Math.max(...c);
  if (peak < startCompression) return c;
  const d = 1 - startCompression, newPeak = 1 - (d * d) / (peak + d - startCompression);
  c = [c[0] * (newPeak / peak), c[1] * (newPeak / peak), c[2] * (newPeak / peak)];
  const gMix = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [mix(c[0], newPeak, gMix), mix(c[1], newPeak, gMix), mix(c[2], newPeak, gMix)];
}

/** The backdrop as displayed (linear, already tone-mapped): three clears are not tone-mapped, Cycles camera rays are. */
export function displayBackdrop(grade: ThemeGrade): Vec3 {
  const e = 2 ** grade.exposure;
  return pbrNeutral([grade.backdrop[0] * e, grade.backdrop[1] * e, grade.backdrop[2] * e]);
}

// ---- live store: the presented sequence theme (fractional index), set by the live controller ----------------------
let presentedTheme = 1;
let overrides: Partial<Record<ThemeId, Partial<ThemeGrade>>> | null = null;
const listeners = new Set<() => void>();
export function setGradeTheme(presented: number) {
  if (Math.abs(presented - presentedTheme) < 1e-4) return;
  presentedTheme = presented;
  listeners.forEach((fn) => fn());
}
export function getGradeTheme() { return presentedTheme; }
export function subscribeGrade(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** Debug/calibration only (window.__QUACKLES_SIM__.debug.grade): shallow per-theme overrides, null clears. */
export function setGradeOverrides(next: Partial<Record<ThemeId, Partial<ThemeGrade>>> | null) {
  overrides = next;
  listeners.forEach((fn) => fn());
}
export function currentGrade(): ThemeGrade {
  if (!overrides) return gradeAt(presentedTheme);
  const merged = { ...THEME_GRADES };
  for (const id of ORDER) if (overrides[id]) merged[id] = { ...THEME_GRADES[id], ...overrides[id] };
  return gradeAt(presentedTheme, merged);
}
