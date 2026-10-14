/** An inward distance feather: never gives an unselected pixel any coverage. */
export function featherMask(ids: Uint8Array, width: number, height: number, id: number, radius = 2): Float32Array {
  if (ids.length !== width * height) throw new Error('Mask dimensions do not match.');
  const distance = new Float32Array(ids.length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    if (ids[i] === id) distance[i] = Math.min(x ? distance[i - 1] + 1 : 1, y ? distance[i - width] + 1 : 1);
  }
  for (let y = height - 1; y >= 0; y--) for (let x = width - 1; x >= 0; x--) {
    const i = y * width + x;
    if (ids[i] === id) distance[i] = Math.min(distance[i], x < width - 1 ? distance[i + 1] + 1 : 1, y < height - 1 ? distance[i + width] + 1 : 1);
  }
  for (let i = 0; i < distance.length; i++) distance[i] = Math.min(1, distance[i] / Math.max(1, radius));
  return distance;
}
export function compositeInside(base: Uint8ClampedArray, patch: Uint8ClampedArray, alpha: Float32Array): Uint8ClampedArray {
  if (base.length !== patch.length || base.length !== alpha.length * 4) throw new Error('Composite dimensions do not match.');
  const output = new Uint8ClampedArray(base);
  for (let i = 0; i < alpha.length; i++) {
    const a = Math.max(0, Math.min(1, alpha[i])) * patch[i * 4 + 3] / 255;
    for (let c = 0; c < 3; c++) output[i * 4 + c] = base[i * 4 + c] * (1 - a) + patch[i * 4 + c] * a;
  }
  return output;
}
