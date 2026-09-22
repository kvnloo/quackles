#!/usr/bin/env node
/** Deterministic static server for `out/` with automatic port selection and cleanup.

Usage: node scripts/static-server.mjs [--port PORT] [--directory DIR]

Prints the chosen port to stdout on the first line, then serves until SIGTERM /
SIGINT.  Exits non-zero if the chosen port is already bound by an unrelated process.

Intended to be spawned by npm run test:inspection:static (or any other harness)
that needs a deterministic local production preview without manual server steps.
*/

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";

const PythonMajor = parseInt(process.versions.python?.split(".")[0] ?? "3", 10);
if (PythonMajor < 3)
  throw new Error(`Expected Python 3+ for the static server, found ${process.versions.python ?? "unknown"}`);

function usage() {
  console.error(
    `Usage: node scripts/static-server.mjs [--port PORT] [--directory DIR]

Defaults:
  --port      auto-selected free port (prefers 43217, then any free port)
  --directory out/ in the repository root
`,
  );
}

function spawnPython(args, env) {
  return spawn("python3", args, {
    env,
    stdio: ["ignore", "inherit", "inherit"],
    shell: false,
  });
}

async function main() {
  const args = process.argv.slice(2);
  let directory = join(process.cwd(), "out");
  let preferredPort = 43217;
  let explicitPort;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && i + 1 < args.length) {
      explicitPort = parseInt(args[++i], 10);
      if (!Number.isFinite(explicitPort) || explicitPort < 1 || explicitPort > 65535) {
        console.error(`Invalid --port: ${args[i]}`);
        usage();
        process.exit(2);
      }
    } else if (args[i] === "--directory" && i + 1 < args.length) {
      directory = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      usage();
      process.exit(0);
    } else {
      console.error(`Unexpected argument: ${args[i]}`);
      usage();
      process.exit(2);
    }
  }

  if (!existsSync(directory)) {
    console.error(`Directory does not exist: ${directory}`);
    usage();
    process.exit(2);
  }

  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(explicitPort ?? preferredPort, "127.0.0.1", () => server.close(() => resolve()));
  });

  const chosenPort = explicitPort ?? preferredPort;

  const pythonArgs = [
    "-u",
    "-m",
    "http.server",
    String(chosenPort),
    "--bind",
    "127.0.0.1",
    "--directory",
    directory,
  ];

  console.error(
    `[static-server] serving ${directory} on http://127.0.0.1:${chosenPort} (python ${process.versions.python})`,
  );
  console.log(chosenPort);

  const python = spawnPython(pythonArgs, process.env);

  let shuttingDown = false;
  const shutdown = async (code = 0) => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      python.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (python.exitCode === null) python.kill("SIGKILL");
    } catch {
      // Best effort.
    }
    process.exit(code);
  };

  process.once("SIGTERM", () => shutdown(128 + 15));
  process.once("SIGINT", () => shutdown(128 + 2));

  python.once("exit", (code, signalName) => {
    if (shuttingDown) return;
    console.error(
      `[static-server] python exited unexpectedly: code=${code ?? "null"} signal=${signalName ?? "null"}`,
    );
    shutdown(1);
  });

  process.once("exit", () => {
    try { python.kill("SIGKILL"); } catch {
      // Best effort.
    }
  });

  await new Promise(() => {});
}

main().catch((error) => {
  console.error(`[static-server] fatal: ${error.message}`);
  process.exit(1);
});
