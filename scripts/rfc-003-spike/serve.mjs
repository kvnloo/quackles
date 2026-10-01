#!/usr/bin/env node
// Static server for the RFC-003 spike: / -> this dir, /node_modules -> repo node_modules, /assets -> $ASSETS.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOTS = [["/node_modules/", path.resolve(HERE, "../../node_modules")], ["/assets/", process.env.ASSETS], ["/", HERE]];
const TYPES = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json",
  ".png": "image/png", ".webp": "image/webp", ".glb": "model/gltf-binary", ".wasm": "application/wasm", ".hdr": "application/octet-stream" };
const port = +(process.env.PORT || 49603);
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const [prefix, root] = ROOTS.find(([pre]) => p.startsWith(pre));
  const file = path.join(root, p.slice(prefix.length));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`rfc003 spike on http://127.0.0.1:${port}/`));
