/** Public asset prefix. Empty on Vercel/local; `"/<repo>"` on GitHub project Pages. */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

export function assetPath(path: string) {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${BASE_PATH}${suffix}`;
}
