import type { Decoded } from "./cache";
import { isImage, type ImageAsset, type TileAsset, type Variant } from "./manifest";
import { resolveAssetUrl } from "../paths";

export type Crop = { x: number; y: number; width: number; height: number; scale: number };
export function viewportCrop(element: HTMLElement): Crop {
  const rect = element.getBoundingClientRect();
  const viewport = window.visualViewport;
  const scale = viewport?.scale ?? 1;
  const offsetLeft = viewport?.offsetLeft ?? 0;
  const offsetTop = viewport?.offsetTop ?? 0;
  const viewWidth = viewport?.width ?? innerWidth;
  const viewHeight = viewport?.height ?? innerHeight;
  // visualViewport offsets are layout CSS pixels. Chrome's rect is already
  // in that space. Safari shrinks the rect with the pinch, so convert it
  // back before intersecting or the detail canvas misses the visible crop.
  const layoutWidth = element.offsetWidth || rect.width;
  const visualSpace =
    scale > 1.01 &&
    rect.width > 0 &&
    rect.width * scale < layoutWidth * 0.92;
  const left = visualSpace ? rect.left * scale + offsetLeft : rect.left;
  const top = visualSpace ? rect.top * scale + offsetTop : rect.top;
  const width = visualSpace ? rect.width * scale : rect.width;
  const height = visualSpace ? rect.height * scale : rect.height;
  const viewRight = offsetLeft + viewWidth;
  const viewBottom = offsetTop + viewHeight;
  const x = width > 0 ? Math.max(0, Math.min(1, (offsetLeft - left) / width)) : 0;
  const y = height > 0 ? Math.max(0, Math.min(1, (offsetTop - top) / height)) : 0;
  return {
    x,
    y,
    width:
      width > 0
        ? Math.max(0, Math.min(1 - x, (viewRight - Math.max(offsetLeft, left)) / width))
        : 0,
    height:
      height > 0
        ? Math.max(0, Math.min(1 - y, (viewBottom - Math.max(offsetTop, top)) / height))
        : 0,
    scale,
  };
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
  const { tileSize, overlap, columns, rows, urlTemplate } = variant.tiles;
  const firstX = Math.max(0, Math.floor(crop.x * variant.width / tileSize) - overscan);
  const lastX = Math.min(columns - 1, Math.ceil((crop.x + crop.width) * variant.width / tileSize) - 1 + overscan);
  const firstY = Math.max(0, Math.floor(crop.y * variant.height / tileSize) - overscan);
  const lastY = Math.min(rows - 1, Math.ceil((crop.y + crop.height) * variant.height / tileSize) - 1 + overscan);
  const result: { asset: ImageAsset; x: number; y: number; sourceX: number; sourceY: number }[] = [];
  for (let y = firstY; y <= lastY; y++) for (let x = firstX; x <= lastX; x++) {
    const sourceX = Math.max(0, x * tileSize - (x > 0 ? overlap : 0));
    const sourceY = Math.max(0, y * tileSize - (y > 0 ? overlap : 0));
    const right = Math.min(variant.width, (x + 1) * tileSize + (x < columns - 1 ? overlap : 0));
    const bottom = Math.min(variant.height, (y + 1) * tileSize + (y < rows - 1 ? overlap : 0));
    result.push({
      x,
      y,
      sourceX,
      sourceY,
      asset: {
        url: resolveAssetUrl(urlTemplate.replaceAll("{x}", String(x)).replaceAll("{y}", String(y)), ""),
        width: right - sourceX,
        height: bottom - sourceY,
      },
    });
  }
  return result;
}
export function detailPlan(
  variants: Variant[],
  desiredWidth: number,
  crop: Crop,
  budget: number,
  maxOverscan = 1,
  maxVariantWidth = Number.POSITIVE_INFINITY,
) {
  const allowed = variants.filter((variant) => variant.width <= maxVariantWidth);
  const candidates = allowed.length ? allowed : variants.slice(0, 1);
  const preferred = candidates.findIndex(
    (variant) => variant.width >= desiredWidth,
  );
  for (
    let i = preferred < 0 ? candidates.length - 1 : preferred;
    i >= 0;
    i--
  ) {
    const variant = candidates[i];
    const overscans = isImage(variant)
      ? [0]
      : maxOverscan > 0
        ? [1, 0]
        : [0];
    for (const overscan of overscans) {
      const tasks = isImage(variant)
        ? [{ asset: variant, x: 0, y: 0, sourceX: 0, sourceY: 0 }]
        : tileAssets(variant, crop, overscan);
      const bytes = tasks.reduce(
        (sum, { asset }) => sum + asset.width * asset.height * 4,
        0,
      );
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
 export function eggWeight(theme: number) {
   const distance = Math.abs(theme - 3.6);
   if (distance >= 0.28) return 0;
   const x = 1 - distance / 0.28;
   return x * x * (3 - 2 * x);
 }
 export function paintEgg(canvas: HTMLCanvasElement, image: Decoded, weight: number) {
   const context = canvas.getContext("2d");
   if (!context || weight <= 0.001) return;
   context.globalAlpha = weight;
   context.drawImage(image.bitmap, 0, 0, canvas.width, canvas.height);
   context.globalAlpha = 1;
 }
export function paintDetail(canvas: HTMLCanvasElement, container: HTMLElement, crop: Crop, variant: ImageAsset | TileAsset, images: { image: Decoded; x: number; y: number; sourceX: number; sourceY: number }[]) {
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
    for (const { image, sourceX, sourceY } of images)
      context.drawImage(image.bitmap, (sourceX - crop.x * variant.width) * scaleX, (sourceY - crop.y * variant.height) * scaleY, image.asset.width * scaleX, image.asset.height * scaleY);
  }
  canvas.style.visibility = "visible";
}
