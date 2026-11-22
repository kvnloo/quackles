// Attach the lab without initializing existing daily-driver tabs or Android's empty spare targets.
// Uses Playwright's public ConnectOverCDPTransport; no protocol results are fabricated.
import { chromium } from "playwright-core";

export async function connectOwnedBrowser(endpoint) {
  let websocket = endpoint;
  if (/^https?:/.test(endpoint)) {
    const base = endpoint.endsWith("/") ? endpoint : `${endpoint}/`;
    const response = await fetch(new URL("json/version", base), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`CDP version endpoint returned ${response.status}`);
    websocket = (await response.json()).webSocketDebuggerUrl;
  }
  const ws = new WebSocket(websocket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.close(); reject(new Error("CDP WebSocket open timed out")); }, 30000);
    ws.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error("CDP WebSocket open failed")); }, { once: true });
  });

  const contexts = new Set(), targets = new Set(), sessions = new Map();
  const pending = new Map(), buffered = new Map(), internal = new Set();
  let internalId = 2147483647;
  const defaultCreationPending = () => {
    for (const p of pending.values()) if (p.method === "Target.createTarget" && !p.context) return true;
    return false;
  };
  const transport = {
    send(message) {
      if ((!message.sessionId || sessions.get(message.sessionId) === null) && (message.method === "Target.createBrowserContext" || message.method === "Target.createTarget" || message.method === "Target.disposeBrowserContext" || message.method === "Target.attachToBrowserTarget" || message.method === "Target.attachToTarget")) {
        pending.set(message.id, { method: message.method, context: message.params?.browserContextId, target: message.params?.targetId });
      }
      // Never pause an unrelated existing/new native tab while deciding ownership.
      if ((!message.sessionId || sessions.get(message.sessionId) === null) && message.method === "Target.setAutoAttach") {
        message = { ...message, params: { ...message.params, waitForDebuggerOnStart: false } };
      }
      ws.send(JSON.stringify(message));
    },
    close() { ws.close(); },
  };
  const detach = (sessionId) => {
    const id = internalId--;
    internal.add(id);
    ws.send(JSON.stringify({ id, method: "Target.detachFromTarget", params: { sessionId } }));
  };
  const accept = (message) => {
    const info = message.params.targetInfo;
    sessions.set(message.params.sessionId, info.targetId);
    targets.add(info.targetId);
    transport.onmessage?.(message);
  };
  const flush = () => {
    for (const [id, message] of buffered) {
      if (targets.has(message.params.targetInfo.targetId)) {
        buffered.delete(id); accept(message);
      } else if (!defaultCreationPending()) {
        buffered.delete(id); detach(id);
      }
    }
  };
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (internal.delete(message.id)) return;
    const command = pending.get(message.id);
    if (command) {
      pending.delete(message.id);
      if (!message.error) {
        if (command.method === "Target.createBrowserContext") contexts.add(message.result.browserContextId);
        if (command.method === "Target.createTarget") targets.add(message.result.targetId);
        if (command.method === "Target.disposeBrowserContext") contexts.delete(command.context);
        if (command.method === "Target.attachToBrowserTarget") sessions.set(message.result.sessionId, null);
        if (command.method === "Target.attachToTarget" && targets.has(command.target)) sessions.set(message.result.sessionId, command.target);
      }
      // Restore attach-before-create-reply ordering for an explicitly created default-context page.
      flush();
      transport.onmessage?.(message);
      return;
    }
    if (message.method === "Target.attachedToTarget") {
      const { targetInfo, sessionId } = message.params;
      if (targetInfo.type === "browser") {
        let requested = sessions.has(sessionId);
        for (const p of pending.values()) if (p.method === "Target.attachToBrowserTarget") requested = true;
        if (requested) { sessions.set(sessionId, null); transport.onmessage?.(message); }
        else detach(sessionId);
        return;
      }
      if (contexts.has(targetInfo.browserContextId) || targets.has(targetInfo.targetId) || sessions.get(message.sessionId)) accept(message);
      else if (!message.sessionId && defaultCreationPending()) buffered.set(sessionId, message);
      else detach(sessionId);
      return;
    }
    if (message.method === "Target.detachedFromTarget") {
      const id = message.params.sessionId, target = sessions.get(id);
      buffered.delete(id);
      if (!sessions.has(id)) return;
      transport.onmessage?.(message);
      sessions.delete(id);
      if (target) {
        let retained = false;
        for (const other of sessions.values()) if (other === target) { retained = true; break; }
        if (!retained) targets.delete(target);
      }
      return;
    }
    // Replies answer this controller's commands, including its explicit browser CDP session.
    if (message.id !== undefined) { transport.onmessage?.(message); return; }
    if (message.sessionId && !sessions.has(message.sessionId)) return;
    // Existing target discovery metadata is not needed to drive owned pages.
    if ((message.method === "Target.targetCreated" || message.method === "Target.targetInfoChanged" || message.method === "Target.targetDestroyed") && !targets.has(message.params?.targetInfo?.targetId ?? message.params?.targetId)) return;
    transport.onmessage?.(message);
  });
  ws.addEventListener("close", () => transport.onclose?.("CDP WebSocket closed"));
  try {
    return await chromium.connectOverCDP(transport, { noDefaults: true });
  } catch (error) {
    ws.close();
    throw error;
  }
}
