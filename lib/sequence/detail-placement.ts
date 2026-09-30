export type PlacementCrop = { x: number; y: number; width: number; height: number };

/**
 * Place the detail canvas without fractional layout geometry. Browsers pixel-snap an element's box (left/top/width/height)
 * in LOCAL space before an ancestor's zoom transform applies, so a 0.5 css px snap becomes ~4 px on screen at 8x and varies with
 * each coverage rect (a path-dependent "warp" when detail arrives). Transforms are not snapped, so: integer layout box at 0,0,
 * exact fractional position and size realised by translate + scale.
 */
export function detailPlacement(cssWidth: number, cssHeight: number, crop: PlacementCrop) {
  const exactW = crop.width * cssWidth, exactH = crop.height * cssHeight;
  const boxW = Math.max(1, Math.ceil(exactW - 1e-9)), boxH = Math.max(1, Math.ceil(exactH - 1e-9));
  return { left: 0, top: 0, boxW, boxH, tx: crop.x * cssWidth, ty: crop.y * cssHeight, sx: exactW / boxW, sy: exactH / boxH };
}
