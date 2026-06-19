#!/usr/bin/env node
/* serve.mjs [vaultDir] [port] — tiny zero-dependency static server so the CRM is
 * reachable at a real URL (http://127.0.0.1:<port>) instead of a file:// path.
 * Idempotent: if the port is already serving, it just reports the URL and exits.
 * Run it in the background when opening a CRM so it's always reachable. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, join, extname, normalize } from "node:path";

const root = resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8787);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end("forbidden"); }
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch { res.writeHead(404); res.end("not found"); }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") { console.log(`CRM already live at http://127.0.0.1:${port}/`); process.exit(0); }
  throw e;
});
server.listen(port, "127.0.0.1", () => console.log(`CRM live at http://127.0.0.1:${port}/  (serving ${root})`));
