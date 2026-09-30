// Module Worker entry: the only place the native backend runs in the page.
// Physics is stepped here on a fixed 50 Hz clock; the page never steps it.
import { loadNativeBackend } from './index.mjs';
import { createSimHost } from './host.mjs';

const host = createSimHost({
  loadBackend: (baseUrl) => loadNativeBackend({ baseUrl }),
  post: (message, transfer) => self.postMessage(message, transfer ?? []),
  now: () => performance.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id),
});
self.onmessage = (event) => host.handle(event.data);
