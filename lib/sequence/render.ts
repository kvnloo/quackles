import type { Decoded } from "./cache";
import { isImage, type ImageAsset, type TileAsset, type Variant } from "./manifest";

export type Crop = { x: number; y: number; width: number; height: number; scale: number };
export function viewportCrop(element: HTMLElement): Crop {
  const rect = element.getBoundingClientRect(), viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const right = left + (viewport?.width ?? innerWidth), bottom = top + (viewport?.height ?? innerHeight);
  const x = Math.max(0, Math.min(1, (left - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (top - rect.top) / rect.height));
  return { x, y, width: Math.max(0, Math.min(1 - x, (right - Math.max(left, rect.left)) / rect.width)), height: Math.max(0, Math.min(1 - y, (bottom - Math.max(top, rect.top)) / rect.height)), scale: viewport?.scale ?? 1 };
}

export function inspectionCrop(
  zoom: number,
  focusX: number,
  focusY: number,
): Crop {
  const scale = Math.max(1, zoom);
  const width = 1 / scale, height = 1 / scale;
  // The camera layer scales around its smoothly animated transform origin.
  // Invert that transform so detail tiles cover exactly the source pixels that
  // will be visible after the CSS camera move.
  const x = Math.max(0, Math.min(1 - width, focusX * (1 - width)));
  const y = Math.max(0, Math.min(1 - height, focusY * (1 - height)));
  return { x, y, width, height, scale };
}
export function tileAssets(variant: TileAsset, crop: Crop, overscan = 1) {
  const { tileSize, columns, rows, urlTemplate } = variant.tiles;
  const firstX = Math.max(0, Math.floor(crop.x * variant.width / tileSize) - overscan);
  const lastX = Math.min(columns - 1, Math.ceil((crop.x + crop.width) * variant.width / tileSize) - 1 + overscan);
  const firstY = Math.max(0, Math.floor(crop.y * variant.height / tileSize) - overscan);
  const lastY = Math.min(rows - 1, Math.ceil((crop.y + crop.height) * variant.height / tileSize) - 1 + overscan);
  const result: { asset: ImageAsset; x: number; y: number }[] = [];
  for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
    result.push({ x, y, asset: { url: urlTemplate.replaceAll("{x}", String(x)).replaceAll("{y}", String(y)), width: Math.min(tileSize, variant.width - x * tileSize), height: Math.min(tileSize, variant.height - y * tileSize) } });
  }
  return result;
}
export function detailPlan(variants: Variant[], desiredWidth: number, crop: Crop, budget: number) {
  const preferred = variants.findIndex((variant) => variant.width >= desiredWidth);
  for (let i = preferred < 0 ? variants.length - 1 : preferred; i >= 0; i--) {
    const variant = variants[i];
    for (const overscan of isImage(variant) ? [0] : [1, 0]) {
      const tasks = isImage(variant) ? [{ asset: variant, x: 0, y: 0 }] : tileAssets(variant, crop, overscan);
      const bytes = tasks.reduce((sum, { asset }) => sum + asset.width * asset.height * 4, 0);
      if (bytes <= budget) return { variant, tasks };
    }
  }
  return null;
}
function composite(context: CanvasRenderingContext2D, images: Decoded[], mix: number, width: number, height: number) {
  context.globalAlpha = 1; context.drawImage(images[0].bitmap, 0, 0, width, height);
  if (images[1] && mix > 0) { context.globalAlpha = mix; context.drawImage(images[1].bitmap, 0, 0, width, height); context.globalAlpha = 1; }
}
let scratch: HTMLCanvasElement | undefined;
export function paintBase(canvas: HTMLCanvasElement, before: Decoded[], after: Decoded[] | undefined, progressMix: number, themeMix: number, cssWidth: number) {
  const images = after?.length ? [...before, ...after] : before;
  const width = Math.min(Math.max(...images.map((image) => image.asset.width)), Math.ceil(cssWidth * devicePixelRatio));
  const height = Math.round(width * images[0].asset.height / images[0].asset.width);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas2D is unavailable");
  composite(context, before, themeMix, width, height);
  if (after?.length && progressMix > 0) {
    if (!scratch) scratch = document.createElement("canvas");
    if (scratch.width !== width || scratch.height !== height) { scratch.width = width; scratch.height = height; }
    const extra = scratch.getContext("2d", { alpha: false });
    if (!extra) throw new Error("Canvas2D is unavailable");
    composite(extra, after, themeMix, width, height);
    context.globalAlpha = progressMix; context.drawImage(scratch, 0, 0, width, height); context.globalAlpha = 1;
  }
}
export function paintDetail(canvas: HTMLCanvasElement, container: HTMLElement, crop: Crop, variant: ImageAsset | TileAsset, images: { image: Decoded; x: number; y: number }[]) {
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.ceil(rect.width * crop.width * devicePixelRatio * crop.scale));
  const height = Math.max(1, Math.ceil(rect.height * crop.height * devicePixelRatio * crop.scale));
  canvas.width = Math.min(2048, width); canvas.height = Math.min(4096, height);
  canvas.style.left = `${crop.x * 100}%`; canvas.style.top = `${crop.y * 100}%`;
  canvas.style.width = `${crop.width * 100}%`; canvas.style.height = `${crop.height * 100}%`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas2D is unavailable");
  if ("url" in variant) {
    context.drawImage(images[0].image.bitmap, crop.x * variant.width, crop.y * variant.height, crop.width * variant.width, crop.height * variant.height, 0, 0, canvas.width, canvas.height);
  } else {
    const scaleX = canvas.width / (crop.width * variant.width), scaleY = canvas.height / (crop.height * variant.height);
    for (const { image, x, y } of images)
      context.drawImage(image.bitmap, (x * variant.tiles.tileSize - crop.x * variant.width) * scaleX, (y * variant.tiles.tileSize - crop.y * variant.height) * scaleY, image.asset.width * scaleX, image.asset.height * scaleY);
  }
  canvas.style.visibility = "visible";
}
