import {parseTheme, serializeTheme, type StudioTheme} from '../studio/theme';
const NAME = 'quackles.plate-editor.v1';
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore('themes'); request.result.createObjectStore('patches'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function loadTheme(id: string): Promise<StudioTheme | null> {
  const db = await open();
  try {
    const value = await new Promise<string | undefined>((resolve, reject) => {
      const r = db.transaction('themes').objectStore('themes').get(id);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    return value ? parseTheme(value) : null;
  } finally { db.close(); }
}
export async function loadPatch(key: string): Promise<Blob | undefined> {
  const db = await open();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('patches').objectStore('patches').get(key);
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
/** Theme reference + patch blob commit atomically. Never persist transient blob URLs. */
export async function saveTheme(theme: StudioTheme, patch?: {key: string; blob: Blob}): Promise<void> {
  const json = serializeTheme(theme), db = await open();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['themes', 'patches'], 'readwrite');
      tx.objectStore('themes').put(json, theme.id);
      if (patch) tx.objectStore('patches').put(patch.blob, patch.key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? new Error('Save cancelled.'));
    });
  } finally { db.close(); }
  // Read the exact record back; a successful request alone isn't durable proof.
  const saved = await loadTheme(theme.id);
  if (!saved || serializeTheme(saved) !== json) throw new Error('Theme read-back did not match.');
  if (patch && (await loadPatch(patch.key))?.size !== patch.blob.size) throw new Error('Patch read-back did not match.');
}
