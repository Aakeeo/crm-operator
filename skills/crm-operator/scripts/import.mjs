#!/usr/bin/env node
/* import.mjs <vaultDir> <file.csv> --type <core type> [--source hubspot|pipedrive|salesforce|generic]
 *                                  [--map '<json>'] [--dry] [--inspect]
 *
 * Bulk-import a CSV export into a CRM vault. Every CRM exporter (HubSpot,
 * Pipedrive, Salesforce, Power BI, plain spreadsheets) can emit CSV — so this
 * is the one import path. A "source" preset (imports/<source>.json) maps that
 * tool's column headers to our entity fields; override per-run with --map.
 *
 * Reads existing ids by evaluating data.js (reliable parse), dedups by slug,
 * and appends only new entries as text (preserves data.js formatting). Run core
 * types in order — companies, then contacts, then deals — so relationship slugs
 * line up. Power BI: export the visual's data as CSV, then import as generic. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const IMPORTS = resolve(here, "..", "imports");

// ---- args ----
const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);
const positional = argv.filter((a, i) => !a.startsWith("--") && (i === 0 || !argv[i - 1].startsWith("--")));
const vaultDir = positional[0];
const csvFile = positional[1];

// ---- CSV (RFC-4180-ish: quotes, "" escapes, embedded commas/newlines) ----
export function parseCsv(text) {
  text = String(text).replace(/\r\n?/g, "\n");
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
export function csvToObjects(text) {
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => h.trim());
  const records = rows.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] || "").trim()])));
  return { headers, records };
}

// ---- field mapping ----
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const REL = { contact: ["company"], company: [], deal: ["company", "primary_contact"], interaction: [], task: [] };
// coerce a money-ish string to a Number, else keep the string (only for deal.value,
// which feeds the pipeline sum; everything else renders fine as a string).
function num(v) { const c = String(v).replace(/[$,€£\s]/g, ""); return c !== "" && /^-?\d+(\.\d+)?$/.test(c) ? Number(c) : v; }
function pick(rec, spec) {                 // spec = header name | [headers] joined by space
  if (Array.isArray(spec)) return spec.map((h) => (rec[h] || "").trim()).filter(Boolean).join(" ").trim();
  return (rec[spec] || "").trim();
}
export function buildEntity(type, rec, map, today) {
  const e = { type, id: "", name: "", sections: {} };
  const extra = {};
  for (const [target, spec] of Object.entries(map)) {
    let v = pick(rec, spec); if (!v) continue;
    if (target === "value") v = num(v);
    else if (REL[type] && REL[type].includes(target)) v = slug(v);
    if (target.startsWith("fields.")) extra[target.slice(7)] = v;
    else e[target] = v;
  }
  if (!e.name) return null;               // no name → no id → can't file it
  e.id = slug(e.name);
  if (type === "deal" && !e.stage) e.stage = "lead";
  if (Object.keys(extra).length) e.fields = extra;
  e.created = e.updated = today;
  return e;
}

function loadMap(type) {
  const inline = flag("--map");
  if (inline) return JSON.parse(inline)[type] || JSON.parse(inline);
  const source = flag("--source") || "generic";
  const p = join(IMPORTS, source + ".json");
  if (!existsSync(p)) { console.error(`No preset '${source}' at ${p}`); process.exit(1); }
  const preset = JSON.parse(readFileSync(p, "utf8"));
  if (!preset[type]) { console.error(`Preset '${source}' has no mapping for type '${type}'.`); process.exit(1); }
  return preset[type];
}

// ---- existing ids: eval data.js in a window shim (same trick as smoke-test) ----
function existingIds(vault, bucket) {
  global.window = {};
  // eslint-disable-next-line no-eval
  (0, eval)(readFileSync(join(vault, "data.js"), "utf8"));
  return new Set(Object.keys((global.window.CRM && global.window.CRM[bucket]) || {}));
}

// ---- run (only as a CLI; importing this file for its helpers must not execute) ----
const isEntry = process.argv[1] === fileURLToPath(import.meta.url);
if (!isEntry) { /* imported for parseCsv/buildEntity in tests */ }
else main();
function main() {
if (!vaultDir || !csvFile) { console.error("usage: import.mjs <vaultDir> <file.csv> --type <contact|company|deal|interaction|task> [--source hubspot|pipedrive|salesforce|generic] [--map <json>] [--dry] [--inspect]"); process.exit(1); }
const vault = resolve(vaultDir);
const text = readFileSync(resolve(csvFile), "utf8");
const { headers, records } = csvToObjects(text);

if (has("--inspect")) {
  console.log(`${records.length} rows. Headers:`);
  for (const h of headers) console.log("  - " + h);
  process.exit(0);
}

const type = flag("--type");
const BUCKET = { contact: "contacts", company: "companies", deal: "deals", interaction: "interactions", task: "tasks" };
if (!BUCKET[type]) { console.error("--type must be one of: " + Object.keys(BUCKET).join(", ")); process.exit(1); }

const map = loadMap(type);
const today = new Date().toISOString().slice(0, 10);
const have = existingIds(vault, BUCKET[type]);
const seen = new Set();
const fresh = [];
let dupes = 0, noName = 0;
for (const rec of records) {
  const e = buildEntity(type, rec, map, today);
  if (!e) { noName++; continue; }
  if (have.has(e.id) || seen.has(e.id)) { dupes++; continue; }
  seen.add(e.id); fresh.push(e);
}

console.log(`${records.length} rows → ${fresh.length} new ${BUCKET[type]}, ${dupes} duplicates skipped${noName ? `, ${noName} skipped (no name)` : ""}.`);
if (has("--dry")) { console.log("(dry run — nothing written)\n" + fresh.slice(0, 5).map((e) => "  + " + e.id).join("\n")); process.exit(0); }
if (!fresh.length) process.exit(0);

const path = join(vault, "data.js");
let src = readFileSync(path, "utf8");
const block = fresh.map((e) => "\n    " + JSON.stringify(e.id) + ": " + JSON.stringify(e) + ",").join("");
const re = new RegExp('(["\']?' + BUCKET[type] + '["\']?\\s*:\\s*\\{)');
if (!re.test(src)) { console.error(`bucket ${BUCKET[type]} not found in data.js`); process.exit(1); }
src = src.replace(re, (m) => m + block);
writeFileSync(path, src);
console.log(`Wrote ${fresh.length} ${BUCKET[type]} to ${path}`);
}
