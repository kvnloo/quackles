#!/usr/bin/env node
/** Single-command local verification: start static server, run inspection test, cleanup.

Usage: node scripts/run-inspection-static.mjs

Spins up scripts/static-server.mjs on a free port (prefers 43217), waits for
readiness, runs scripts/inspection-browser.mjs against it, then shuts the
server down and exits with the inspection test's exit code.

Meant to be invoked via `npm run test:inspection:static` so developers and CI
get one deterministic command with no manual server step.
*/

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

function spawnServer(port) {
  return spawn("node", [
    join(__dirname, "static-server.mjs"),
    "--port",
    String(port),
    "--directory",
    join(repoRoot, "out"),
  ], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });
}

async function waitForHttp(url, timeoutMs = 10000) {
  const http = await import("node:http");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, { timeout: 2000 }, (res) => {
          res.resume();
          resolve(res.statusCode);
        });
        req.once("error", reject);
        req.once("timeout", () => { req.destroy(); reject(new Error("timeout")); });
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  throw new Error(`server did not become ready at ${url} within ${timeoutMs}ms`);
}

async function main() {
  const serverPort = 43217;
  const serverUrl = `http://127.0.0.1:${serverPort}`;
  const baseUrl = `http://127.0.0.1:${serverPort}`;

  console.error(`[run-inspection-static] starting static server on port ${serverPort}`);
  const server = spawnServer(serverPort);

  let shutdown = false;
  const shutdownServer = async (code = 0) => {
    if (shutdown) return;
    shutdown = true;
    try { server.kill("SIGTERM"); } catch { /* best effort */ }
    try { process.exit(code); } catch { /* best effort */ }
  };

  process.once("SIGTERM", () => shutdownServer(128 + 15));
  process.once("SIGINT", () => shutdownServer(128 + 2));

  server.once("exit", (code, signalName) => {
    if (shutdown) return;
    console.error(`[run-inspection-static] static server exited early: code=${code ?? "null"} signal=${signalName ?? "null"}`);
    process.exit(1);
  });

  try {
    await waitForHttp(`${serverUrl}/`, 12000);
    console.error(`[run-inspection-static] server ready at ${serverUrl}`);
  } catch (error) {
    console.error(`[run-inspection-static] server failed to start: ${error.message}`);
    await shutdownServer(1);
  }

  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn("node", [
        join(__dirname, "inspection-browser.mjs"),
      ], {
        env: {
          ...process.env,
          BASE_URL: baseUrl,
          ARTIFACTS: join(repoRoot, "artifacts", "hero-inspection"),
          CHROME: "/usr/bin/chromium",
        },
        stdio: ["ignore", "inherit", "inherit"],
        shell: false,
      });

      child.once("exit", (code, signalName) => {
        if (signalName) reject(new Error(`inspection-browser killed by ${signalName}`));
        else resolve(code);
      });
      child.once("error", reject);
    });

    await shutdownServer(result == null ? 0 : (result || 0));
  } catch (error) {
    console.error(`[run-inspection-static] fatal: ${error.message}`);
    await shutdownServer(1);
  }
}

main().catch((error) => {
  console.error(`[run-inspection-static] unhandled: ${error.message}`);
  process.exit(1);
});
