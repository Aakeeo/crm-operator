#!/usr/bin/env node
/* serve.mjs [vaultDir] [port] — robust local server for a CRM vault.
 *
 * Guarantees the CRM is served by *this* server (which has the Settings write
 * endpoint), never a foreign static server:
 *   - identifies itself at GET /__crm
 *   - if its own instance already serves this vault, reuses it
 *   - if the port is held by anything else, hops to the next free port
 * Also: auto-updates the vault's engine on start (never data.js), and checks
 * the repo for a newer skill version. Opt out of auto-update with --no-update. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync, writeFileSync, readdirSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join, extname, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(process.argv[2] || ".");
const startPort = Number(process.argv[3] || 8787);
const ENGINE = resolve(dirname(fileURLToPath(import.meta.url)), "..", "engine");
const UPDATE_URL = "https://raw.githubusercontent.com/Aakeeo/crm-operator/main/skills/crm-operator/engine/engine.json";

function engineVersion(dir) { try { return JSON.parse(readFileSync(join(dir, "engine.json"), "utf8")).version; } catch { return null; } }
function cmp(a, b) { const A = String(a).split(".").map(Number), B = String(b).split(".").map(Number); for (let i = 0; i < 3; i++) { if ((A[i] || 0) > (B[i] || 0)) return 1; if ((A[i] || 0) < (B[i] || 0)) return -1; } return 0; }
const VERSION = engineVersion(ENGINE) || "0.0.0";

// ---- auto-update the vault engine (never data.js) ----
function copyDir(src, dst) {            // recursive: engine files + fonts/ subfolder
  mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else copyFileSync(s, d);
  }
}
function autoUpdateEngine(vault) {
  if (process.argv.includes("--no-update")) return;
  if (!existsSync(join(vault, "data.js"))) return;
  const have = engineVersion(vault), latest = engineVersion(ENGINE);
  if (!latest || have === latest) return;
  copyDir(ENGINE, vault);
  console.log(`Engine auto-updated ${have || "none"} → ${latest} (data.js untouched)`);
}

// ---- persist Settings-page branding into data.js (only the /*@meta*/ line) ----
// Rewrites ONLY the branding keys, preserving any other meta keys (profile, etc.)
// the Settings form never sends. Invariant: meta is ONE line ending `, /*@meta*/`.
export function applyMeta(src, branding) {
  let meta = {};
  const cur = src.match(/["']?meta["']?\s*:\s*(.+),\s*\/\*@meta\*\//);
  if (cur) { try { meta = JSON.parse(cur[1]); } catch { /* unparseable → start clean */ } }
  meta.business = String(branding.business || "");
  meta.tagline = String(branding.tagline || "");
  meta.accent = String(branding.accent || "");
  const line = "  meta: " + JSON.stringify(meta) + ", /*@meta*/";
  if (/\/\*@meta\*\//.test(src)) return src.replace(/^.*\/\*@meta\*\/.*$/m, line);
  return src.replace(/window\.CRM\s*=\s*\{/, (m) => m + "\n" + line);
}
function saveMeta(body, res) {
  try {
    const i = JSON.parse(body || "{}");
    const path = join(root, "data.js");
    writeFileSync(path, applyMeta(readFileSync(path, "utf8"), i));
    res.writeHead(200, { "content-type": "application/json" }); res.end('{"ok":true}');
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}

// ---- create a new entity from the New form (insert into data.js) ----
const BUCKET = { contact: "contacts", company: "companies", deal: "deals", interaction: "interactions", task: "tasks" };
const escapeReg = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function createEntity(body, res) {
  try {
    const p = JSON.parse(body || "{}");
    if (!p.id || !p.entity) throw new Error("bad payload");
    const path = join(root, "data.js");
    let src = readFileSync(path, "utf8");
    if (src.indexOf('"' + p.id + '":') !== -1) { res.writeHead(409); return res.end("An entry with id \"" + p.id + "\" already exists."); }
    const entry = "\n    " + JSON.stringify(p.id) + ": " + JSON.stringify(p.entity) + ",";
    if (p.objType) {
      src = insertObject(src, p.objType, entry);
    } else {
      const bucket = BUCKET[p.type];
      if (!bucket) throw new Error("bad payload");
      const re = new RegExp('(["\']?' + bucket + '["\']?\\s*:\\s*\\{)');
      if (!re.test(src)) throw new Error("bucket " + bucket + " not found in data.js");
      src = src.replace(re, (m) => m + entry);
    }
    writeFileSync(path, src);
    res.writeHead(200, { "content-type": "application/json" }); res.end(JSON.stringify({ ok: true, id: p.id }));
  } catch (e) { res.writeHead(400); res.end(String((e && e.message) || e)); }
}
// Insert an object record into CRM.objects[<ot>], creating the objects bucket and/or
// the type sub-bucket as needed. Keeps data.js a plain editable object literal.
function insertObject(src, ot, entry) {
  const objM = src.match(/["']?objects["']?\s*:\s*\{/);
  if (objM) {
    const start = objM.index + objM[0].length;
    const after = src.slice(start);
    const km = after.match(new RegExp('["\']?' + escapeReg(ot) + '["\']?\\s*:\\s*\\{'));
    if (km) { const at = start + km.index + km[0].length; return src.slice(0, at) + entry + src.slice(at); }
    const sub = "\n    " + JSON.stringify(ot) + ": {" + entry + "\n    },";
    return src.slice(0, start) + sub + src.slice(start);
  }
  const newBucket = "\n  objects: {\n    " + JSON.stringify(ot) + ": {" + entry + "\n    }\n  },";
  const tm = src.match(/["']?tasks["']?\s*:\s*\{[\s\S]*?\n\s*\}/);
  if (tm) { const at = tm.index + tm[0].length; return src.slice(0, at) + "," + newBucket + src.slice(at); }
  return src.replace(/\}\s*;\s*$/, newBucket + "\n};");
}

// ---- check the repo for a newer version (best-effort, cached) ----
let latest = null, updateAvailable = false, updatePromise = null;
function ensureCheck() {
  if (!updatePromise) updatePromise = (async () => {
    try {
      const r = await fetch(UPDATE_URL, { signal: AbortSignal.timeout(2500) });
      if (!r.ok) return;
      latest = (await r.json()).version;
      if (latest && cmp(latest, VERSION) > 0) {
        updateAvailable = true;
        console.log(`\n  ▲ Update available: crm-operator ${VERSION} → ${latest}.  Run:  npx skills update\n`);
      }
    } catch { /* offline / rate-limited — ignore */ }
  })();
  return updatePromise;
}

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".woff2": "font/woff2",
};

const server = createServer(async (req, res) => {
  const path0 = (req.url || "/").split("?")[0];
  if (req.method === "POST" && path0 === "/__save-meta") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => saveMeta(body, res)); return;
  }
  if (req.method === "POST" && path0 === "/__create") {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", () => createEntity(body, res)); return;
  }
  if (path0 === "/__crm") {
    await ensureCheck();
    res.writeHead(200, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ server: "crm-operator", version: VERSION, root, latest, updateAvailable })); return;
  }
  try {
    let p = decodeURIComponent(path0);
    if (p === "/") p = "/index.html";
    const file = join(root, normalize(p).replace(/^(\.\.[/\\])+/, ""));
    if (!file.startsWith(root)) { res.writeHead(403); return res.end("forbidden"); }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(data);
  } catch { res.writeHead(404); res.end("not found"); }
});

// Is something on this port our own server for this same vault?
async function probe(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/__crm`, { signal: AbortSignal.timeout(500) });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.server === "crm-operator" ? j : null;
  } catch { return null; }
}
function tryListen(port) {
  return new Promise((res) => {
    const onErr = (e) => { if (e.code === "EADDRINUSE") res(false); else { console.error(e); process.exit(1); } };
    server.once("error", onErr);
    server.listen(port, "127.0.0.1", () => { server.removeListener("error", onErr); res(true); });
  });
}

const isEntry = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntry) (async () => {
  for (let p = startPort; p < startPort + 25; p++) {
    const ours = await probe(p);
    if (ours) { if (resolve(ours.root) === root) { console.log(`CRM already live at http://127.0.0.1:${p}/`); return; } continue; }
    if (await tryListen(p)) {
      autoUpdateEngine(root);
      console.log(`CRM live at http://127.0.0.1:${p}/  (serving ${root})`);
      ensureCheck();
      return;
    }
  }
  console.error(`Could not find a free port near ${startPort}.`); process.exit(1);
})();
