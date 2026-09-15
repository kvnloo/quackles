/** Baked in at `next build`. GitHub Actions and `npm run build` both stamp SHA + UTC time. */
export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
export const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME || "local";
export const BUILD_STAMP = `${BUILD_SHA} ${BUILD_TIME}`;
export const BUILD_SHA_SHORT = BUILD_SHA.slice(0, 7);
