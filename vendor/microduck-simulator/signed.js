// Identity URL helper. Upstream uses this to append a Hugging Face
// Space JWT (`?__sign=`) so asset fetches work inside the hub iframe.
// This landing serves meshes from /public, so the helper is a no-op.
export const signed = (url) => url;
