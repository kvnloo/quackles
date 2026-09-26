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
  minWidth = 0,
) {
  let allowed = variants.filter((variant) => variant.width <= maxVariantWidth);
  if (!allowed.length) allowed = variants.slice(0, 1);
  allowed = allowed.filter((variant) => variant.width >= minWidth);
  if (!allowed.length) return null;
  const preferred = allowed.findIndex((variant) => variant.width >= desiredWidth);
  for (let i = preferred < 0 ? allowed.length - 1 : preferred; i >= 0; i--) {
    const variant = allowed[i];
    const overscans = isImage(variant) ? [0] : maxOverscan > 0 ? [1, 0] : [0];
    for (const overscan of overscans) {
      const tasks = isImage(variant)
        ? [{ asset: variant, x: 0, y: 0, sourceX: 0, sourceY: 0 }]
        : tileAssets(variant, crop, overscan);
      const bytes = tasks.reduce((sum, { asset }) => sum + asset.width * asset.height * 4, 0);
      if (bytes <= budget) return { variant, tasks };
    }
  }
  return null;
}

export function bufferedCrop(crop: Crop, margin: number): Crop {
  const padX = crop.width * margin;
  const padY = crop.height * margin;
  const x = Math.max(0, crop.x - padX);
  const y = Math.max(0, crop.y - padY);
  const right = Math.min(1, crop.x + crop.width + padX);
  const bottom = Math.min(1, crop.y + crop.height + padY);
  return { x, y, width: Math.max(crop.width, right - x), height: Math.max(crop.height, bottom - y), scale: crop.scale };
}

/** True when the camera crop is still inside an already painted source rect. */
export function cropInside(inner: Crop, outer: Crop, inset = 0): boolean {
  return inner.x >= outer.x + inset
    && inner.y >= outer.y + inset
    && inner.x + inner.width <= outer.x + outer.width - inset
    && inner.y + inner.height <= outer.y + outer.height - inset;
}

export const DETAIL_CANVAS_CAP = 4096;

/** Grow the painted source rect until the backing store would exceed the cap. */
export function fittedBuffer(cssWidth: number, cssHeight: number, crop: Crop, dpr: number, cap = DETAIL_CANVAS_CAP, margin = 0.4): Crop {
  let pad = margin;
  while (pad > 0.001) {
    const buffered = bufferedCrop(crop, pad);
    const width = cssWidth * buffered.width * dpr * crop.scale;
    const height = cssHeight * buffered.height * dpr * crop.scale;
    if (width <= cap && height <= cap) return buffered;
    pad *= 0.6;
  }
  return crop;
}

export function detailBackingSize(cssWidth: number, cssHeight: number, crop: Crop, dpr: number, cap = DETAIL_CANVAS_CAP) {
  const width = Math.max(1, Math.ceil(cssWidth * crop.width * dpr * crop.scale));
  const height = Math.max(1, Math.ceil(cssHeight * crop.height * dpr * crop.scale));
  const limit = Math.max(width / cap, height / cap, 1);
  return { width: Math.max(1, Math.round(width / limit)), height: Math.max(1, Math.round(height / limit)) };
}

/**
 * Lock the tier to what the visible crop can afford, then take as much
 * surrounding source as that same tier still fits. Never returns a softer tier
 * than the tight crop.
 */
export function sharpPlan(
  variants: Variant[],
  desiredWidth: number,
  crop: Crop,
  budget: number,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
) {
  const tight = detailPlan(variants, desiredWidth, crop, budget, 0);
  if (!tight) return null;
  const floor = tight.variant.width;
  for (const margin of [0.4, 0.2, 0]) {
    const coverage = margin === 0 ? crop : fittedBuffer(cssWidth, cssHeight, crop, dpr, DETAIL_CANVAS_CAP, margin);
    const plan = detailPlan(variants, floor, coverage, budget, margin > 0 ? 1 : 0, Number.POSITIVE_INFINITY, floor);
    if (plan) return { ...plan, coverage };
  }
  return { ...tight, coverage: crop };
}

/** Abut adjacent tiles. Pyramid tiles have no overlap, so float dest rects leave a dark seam. */
export function tileDest(sourceX: number, sourceY: number, sourceW: number, sourceH: number, originX: number, originY: number, scaleX: number, scaleY: number) {
  const x = Math.floor((sourceX - originX) * scaleX);
  const y = Math.floor((sourceY - originY) * scaleY);
  return {
    x,
    y,
    w: Math.ceil((sourceX + sourceW - originX) * scaleX) - x,
    h: Math.ceil((sourceY + sourceH - originY) * scaleY) - y,
  };
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
export type DetailStamp = { image: Decoded; x: number; y: number; sourceX: number; sourceY: number };
export type DetailLayer = { variant: ImageAsset | TileAsset; images: DetailStamp[]; alpha: number };

export function paintDetail(canvas: HTMLCanvasElement, container: HTMLElement, crop: Crop, layers: DetailLayer[]) {
  const rect = container.getBoundingClientRect();
  const backing = detailBackingSize(rect.width, rect.height, crop, devicePixelRatio);
  if (canvas.width !== backing.width || canvas.height !== backing.height) {
    canvas.width = backing.width;
    canvas.height = backing.height;
  }
  canvas.style.left = `${crop.x * 100}%`;
  canvas.style.top = `${crop.y * 100}%`;
  canvas.style.width = `${crop.width * 100}%`;
  canvas.style.height = `${crop.height * 100}%`;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas2D is unavailable");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  for (const layer of layers) {
    context.globalAlpha = layer.alpha;
    if ("url" in layer.variant) {
      const image = layer.images[0]?.image;
      if (!image) continue;
      context.drawImage(image.bitmap, crop.x * layer.variant.width, crop.y * layer.variant.height, crop.width * layer.variant.width, crop.height * layer.variant.height, 0, 0, canvas.width, canvas.height);
    } else {
      const originX = crop.x * layer.variant.width;
      const originY = crop.y * layer.variant.height;
      const scaleX = canvas.width / (crop.width * layer.variant.width);
      const scaleY = canvas.height / (crop.height * layer.variant.height);
      for (const { image, sourceX, sourceY } of layer.images) {
        const dest = tileDest(sourceX, sourceY, image.asset.width, image.asset.height, originX, originY, scaleX, scaleY);
        context.drawImage(image.bitmap, dest.x, dest.y, dest.w, dest.h);
      }
    }
  }
  context.globalAlpha = 1;
  canvas.style.visibility = "visible";
}
