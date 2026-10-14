export const SLOTS = ['shell', 'stone', 'print', 'poster', 'background'] as const;
export type Slot = (typeof SLOTS)[number];
export interface PartEdit { color: string; amount: number; tone: number; prompt: string; patchKey?: string; bbox?: [number, number, number, number] }
export interface StudioTheme {
  partEdits?: Record<string, PartEdit>;
  version: 1;
  id: string;
  name: string;
  colors: Record<Slot, string>;
  textures: Partial<Record<Slot, string>>;
  lighting: { intensity: number; exposure: number; warmth: string };
  prompt: string;
}
export const STORAGE_KEY = 'quackles.studio.theme.v1';
export const PRESETS: StudioTheme[] = [
  ['day', 'Day', '#e9e5d8', '#c5bfa9', '#2844ac', '#dbd6c4', 2.5, 1.1, '#fff0d9'],
  ['white', 'White', '#eeeeeb', '#dadbd7', '#717b88', '#eceeea', 2.8, 1.2, '#ffffff'],
  ['blue', 'Blue', '#cad4eb', '#637dd2', '#153be6', '#263faf', 2.4, 1.1, '#d9e5ff'],
  ['dark', 'Dark', '#626975', '#45494d', '#8396a9', '#24272d', 2.1, 1.0, '#e1e9ff'],
  ['night', 'Night', '#8c9eae', '#536279', '#e1b55d', '#1c2941', 1.7, 0.95, '#c0d4ff'],
].map(([id, name, shell, stone, poster, background, intensity, exposure, warmth]) => ({
  version: 1, id: String(id), name: String(name),
  colors: { shell: String(shell), stone: String(stone), print: '#ffffff', poster: String(poster), background: String(background) },
  textures: {}, lighting: {intensity: Number(intensity), exposure: Number(exposure), warmth: String(warmth)},
  prompt: `Restyle this Microduck robot showroom in the ${name} palette. Preserve the robot silhouette, camera angle and architectural composition. Refined physical materials, editorial product photography.`,
}));
const color = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max;
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseTheme(raw: string): StudioTheme {
  if (raw.length > 24_000_000) throw new Error('Theme exceeds 24 MB. Use smaller textures.');
  const v: unknown = JSON.parse(raw);
  if (!record(v) || v.version !== 1 || !text(v.id, 100) || !text(v.name, 200) || !text(v.prompt, 8000)
    || !record(v.colors) || !record(v.textures) || !record(v.lighting)) throw new Error('Invalid theme v1 file.');
  const colors = {} as Record<Slot, string>;
  const textures: Partial<Record<Slot, string>> = {};
  for (const slot of SLOTS) {
    if (!color(v.colors[slot])) throw new Error(`Invalid ${slot} color.`);
    colors[slot] = v.colors[slot];
    const source = v.textures[slot];
    if (source !== undefined) {
      if (typeof source !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(source) || source.length > 6_000_000) {
        throw new Error(`Invalid ${slot} texture. Embed PNG, JPEG or WebP (under 4.5 MB); blob URLs are not portable.`);
      }
      textures[slot] = source;
    }
  }
  const {intensity, exposure, warmth} = v.lighting;
  if (typeof intensity !== 'number' || !Number.isFinite(intensity) || intensity < 0 || intensity > 8
    || typeof exposure !== 'number' || !Number.isFinite(exposure) || exposure < 0.1 || exposure > 3 || !color(warmth)) throw new Error('Invalid lighting.');
  let partEdits: Record<string, PartEdit> | undefined;
  if (v.partEdits !== undefined) {
    if (!record(v.partEdits) || Object.keys(v.partEdits).length > 14) throw new Error('Invalid part edits.');
    partEdits = {};
    for (const [id, edit] of Object.entries(v.partEdits)) {
      if (!/^(?:[1-9]|1[0-4])$/.test(id) || !record(edit) || !color(edit.color) || !text(edit.prompt, 8000)
        || typeof edit.amount !== 'number' || !Number.isFinite(edit.amount) || edit.amount < 0 || edit.amount > 1
        || typeof edit.tone !== 'number' || !Number.isFinite(edit.tone) || edit.tone < -1 || edit.tone > 1) throw new Error('Invalid part edit.');
      const parsed: PartEdit = {color: edit.color, amount: edit.amount, tone: edit.tone, prompt: edit.prompt};
      if (edit.patchKey !== undefined) {
        if (typeof edit.patchKey !== 'string' || !/^(day|white|blue|dark|night):[0-9]+:[a-zA-Z0-9-]+$/.test(edit.patchKey)
          || !Array.isArray(edit.bbox) || edit.bbox.length !== 4 || edit.bbox.some(n => !Number.isSafeInteger(n) || n < 0 || n > 40000)
          || edit.bbox[2] < 1 || edit.bbox[3] < 1) throw new Error('Invalid patch reference.');
        parsed.patchKey = edit.patchKey; parsed.bbox = edit.bbox as PartEdit['bbox'];
      }
      partEdits[id] = parsed;
    }
  }
  return {version: 1, id: v.id, name: v.name, prompt: v.prompt, colors, textures, lighting:{intensity, exposure, warmth}, ...(partEdits ? {partEdits} : {})};
}
export function serializeTheme(theme: StudioTheme): string {
  return JSON.stringify(parseTheme(JSON.stringify(theme)), null, 2);
}
