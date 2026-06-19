#!/usr/bin/env node
/* serve.mjs [vaultDir] [port] — tiny zero-dependency static server so the CRM is
 * reachable at a real URL (http://127.0.0.1:<port>) instead of a file:// path.
 * Idempotent: if the port is already serving, it just reports the URL and exits.
 * Run it in the background when opening a CRM so it's always reachable. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 8787);
const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "engine");

// Keep the vault's engine current automatically. Runs on every serve: if the
// vault's engine is older than the skill's, refresh the engine files (never
// data.js or notes). Opt out with --no-update. This is what makes opening a CRM
// also quietly upgrade its UI — no separate update step needed.
function engineVersion(dir) { try { return JSON.parse(readFileSync(join(dir, "engine.json"), "utf8")).version; } catch { return null; } }
function autoUpdateEngine(vault) {
  if (process.argv.includes("--no-update")) return;
  if (!existsSync(join(vault, "data.js"))) return;          // not a CRM vault — don't touch it
  const have = engineVersion(vault), latest = engineVersion(ENGINE);
  if (!latest || have === latest) return;
  for (const f of readdirSync(ENGINE)) copyFileSync(join(ENGINE, f), join(vault, f));
  console.log(`Engine auto-updated ${have || "none"} → ${latest} (data.js untouched)`);
}

// Persist branding edits from the in-app Settings page into data.js. Only the
// single /*@meta*/ line is rewritten — the rest of the file is untouched.
function saveMeta(body, res) {
  try {
    const i = JSON.parse(body || "{}");
    const meta = { business: String(i.business || ""), tagline: String(i.tagline || ""), accent: String(i.accent || "") };
    const path = join(root, "data.js");
    let src = readFileSync(path, "utf8");
    const line = "  meta: " + JSON.stringify(meta) + ", /*@meta*/";
    if (/\/\*@meta\*\//.test(src)) src = src.replace(/^.*\/\*@meta\*\/.*$/m, line);
    else src = src.replace(/window\.CRM\s*=\s*\{/, (m) => m + "\n" + line);
    writeFileSync(path, src);
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}');
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  if (req.method === "POST" && (req.url || "").split("?")[0] === "/__save-meta") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => saveMeta(body, res)); return;
  }
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
autoUpdateEngine(root);
server.listen(port, "127.0.0.1", () => console.log(`CRM live at http://127.0.0.1:${port}/  (serving ${root})`));
