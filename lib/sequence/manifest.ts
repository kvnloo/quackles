export const THEME_IDS = ["day", "white", "blue", "dark", "night"] as const;
export type ThemeId = typeof THEME_IDS[number];
export type Palette = { paper: string; deep: string; ink: string; cobalt: string };
export type SequenceTheme = { id: ThemeId; label: string; palette: Palette };
export type ImageAsset = { url: string; width: number; height: number; bytes?: number; sha256?: string };
export type TileAsset = { width: number; height: number; tiles: { tileSize: number; columns: number; rows: number; urlTemplate: string } };
export type Variant = ImageAsset | TileAsset;
export type SequenceFrame = { id: string; progress: number; phase: string; windPhase: number; assets: Record<ThemeId, Variant[]> };
export type SequenceManifest = {
  version: 1;
  id: string;
  aspect: [number, number];
  defaultTheme: ThemeId;
  themes: SequenceTheme[];
  frames: SequenceFrame[];
  reducedMotion: { from: number; frameId: string }[];
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid sequence object");
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== "string" || !value.length) throw new Error("Sequence text is missing");
  return value;
}
function color(value: unknown): string {
  const result = text(value);
  if (!/^#[0-9a-f]{6}$/i.test(result)) throw new Error("Sequence palette requires six-digit hex colors");
  return result;
}
function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid sequence number");
  return value;
}
function dimension(value: unknown): number {
  const n = number(value);
  if (!Number.isInteger(n) || n < 1 || n > 32768) throw new Error("Invalid sequence dimensions");
  return n;
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value) || !value.length) throw new Error("Sequence list is empty");
  return value;
}
function themeId(value: unknown): ThemeId {
  const id = THEME_IDS.find((id) => id === value);
  if (!id) throw new Error("Unknown sequence theme");
  return id;
}
function url(value: unknown, base: string): string {
  const result = new URL(text(value), base);
  if (result.origin !== new URL(base).origin) throw new Error("Sequence assets must share the manifest origin");
  return result.href;
}

export function parseManifest(value: unknown, base: string): SequenceManifest {
  const root = object(value);
  if (root.version !== 1) throw new Error("Unsupported sequence manifest version");
  const themes = list(root.themes).map((entry) => {
    const row = object(entry), palette = object(row.palette);
    return { id: themeId(row.id), label: text(row.label), palette: { paper: color(palette.paper), deep: color(palette.deep), ink: color(palette.ink), cobalt: color(palette.cobalt) } };
  });
  if (themes.length !== 5 || THEME_IDS.some((id, i) => themes[i].id !== id)) throw new Error("Sequence requires Day, White, Blue, Dark, Night in order");
  const aspect = list(root.aspect).map(dimension);
  if (aspect.length !== 2) throw new Error("Sequence aspect must contain two dimensions");
  const ids = new Set<string>();
  let previous = -1;
  const frames = list(root.frames).map((entry) => {
    const row = object(entry), id = text(row.id), progress = number(row.progress), assets = object(row.assets);
    if (ids.has(id) || progress <= previous || progress < 0 || progress > 1) throw new Error("Sequence frame IDs and progress must be unique and ordered");
    ids.add(id); previous = progress;
    const parsed = {} as Record<ThemeId, Variant[]>;
    for (const theme of THEME_IDS) {
      parsed[theme] = list(assets[theme]).map((entry): Variant => {
        const asset = object(entry), width = dimension(asset.width), height = dimension(asset.height);
        if (Math.abs(width / height - aspect[0] / aspect[1]) > 0.002) throw new Error("Sequence variant framing differs");
        if (asset.tiles !== undefined) {
          const tile = object(asset.tiles), tileSize = dimension(tile.tileSize), columns = dimension(tile.columns), rows = dimension(tile.rows);
          if (columns !== Math.ceil(width / tileSize) || rows !== Math.ceil(height / tileSize)) throw new Error("Invalid sequence tile grid");
          const template = text(tile.urlTemplate);
          if (!template.includes("{x}") || !template.includes("{y}")) throw new Error("Tile URL requires x and y placeholders");
          return { width, height, tiles: { tileSize, columns, rows, urlTemplate: url(template.replaceAll("{x}", "SEQUENCEX").replaceAll("{y}", "SEQUENCEY"), base).replaceAll("SEQUENCEX", "{x}").replaceAll("SEQUENCEY", "{y}") } };
        }
        return { url: url(asset.url, base), width, height, ...(asset.bytes === undefined ? {} : { bytes: number(asset.bytes) }), ...(asset.sha256 === undefined ? {} : { sha256: text(asset.sha256) }) };
      }).sort((a, b) => a.width - b.width);
      if (!parsed[theme].some(isImage)) throw new Error("Every theme frame requires a full-image base");
    }
    return { id, progress, phase: text(row.phase), windPhase: row.windPhase === undefined ? 0 : number(row.windPhase), assets: parsed };
  });
  if (frames[0].progress !== 0 || frames.at(-1)?.progress !== 1) throw new Error("Sequence timeline must include both endpoints");
  const reducedMotion = list(root.reducedMotion).map((entry) => {
    const row = object(entry), from = number(row.from), frameId = text(row.frameId);
    if (from < 0 || from > 1 || !ids.has(frameId)) throw new Error("Invalid reduced-motion frame");
    return { from, frameId };
  }).sort((a, b) => a.from - b.from);
  if (reducedMotion[0].from !== 0) throw new Error("Reduced motion requires an initial still");
  return { version: 1, id: text(root.id), aspect: [aspect[0], aspect[1]], defaultTheme: themeId(root.defaultTheme), themes, frames, reducedMotion };
}

export function isImage(variant: Variant): variant is ImageAsset { return "url" in variant; }
export function spanAt(manifest: SequenceManifest, progress: number, reduced: boolean): { before: SequenceFrame; after: SequenceFrame; mix: number } {
  if (reduced) {
    const phase = manifest.reducedMotion.findLast((phase) => phase.from <= progress) ?? manifest.reducedMotion[0];
    const frame = manifest.frames.find((frame) => frame.id === phase.frameId)!;
    return { before: frame, after: frame, mix: 0 };
  }
  const frames = manifest.frames;
  if (progress <= frames[0].progress) return { before: frames[0], after: frames[0], mix: 0 };
  if (progress >= frames[frames.length - 1].progress) return { before: frames[frames.length - 1], after: frames[frames.length - 1], mix: 0 };
  let low = 0, high = frames.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (frames[middle].progress < progress) low = middle + 1; else high = middle;
  }
  const after = frames[low], before = frames[Math.max(0, low - 1)];
  const span = after.progress - before.progress;
  return { before, after, mix: span <= 0 ? 0 : (progress - before.progress) / span };
}
export function frameAt(manifest: SequenceManifest, progress: number, reduced: boolean): SequenceFrame {
  const { before, after, mix } = spanAt(manifest, progress, reduced);
  return mix < 0.5 ? before : after;
}
export function imageAt(frame: SequenceFrame, theme: ThemeId, width: number): ImageAsset {
  const images = frame.assets[theme].filter(isImage);
  return images.find((image) => image.width >= width) ?? images[images.length - 1];
}
