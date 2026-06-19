#!/usr/bin/env node
/* update-engine.mjs <vaultDir> — refresh an existing vault's engine in place.
 *
 * Copies the latest engine files (render.js, styles.css, index.html, view.html,
 * engine.json) over the vault's copies. It NEVER touches data.js or any .md file,
 * because those simply aren't part of the engine — so a user's data and notes are
 * structurally safe. Run this after `npx skills update` pulls a newer skill. */
import { readFileSync, copyFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

function copyDir(src, dst) {            // recursive: engine files + fonts/ subfolder
  let n = 0; mkdirSync(dst, { recursive: true });
  for (const e of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, e.name), d = join(dst, e.name);
    if (e.isDirectory()) n += copyDir(s, d); else { copyFileSync(s, d); n++; }
  }
  return n;
}

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(here, "..", "engine");
const vault = resolve(process.argv[2] || ".");

if (!existsSync(join(vault, "data.js"))) {
  console.error("No data.js in " + vault + " — that doesn't look like a CRM vault. Use bootstrap.mjs to create one.");
  process.exit(1);
}
const ver = (dir) => { try { return JSON.parse(readFileSync(join(dir, "engine.json"), "utf8")).version; } catch { return "none"; } };
const before = ver(vault), latest = ver(ENGINE);

const n = copyDir(ENGINE, vault);

console.log(`Engine updated in ${vault}`);
console.log(`  ${n} files refreshed · version ${before} → ${latest}`);
console.log("  data.js, MISSION.md, NOTES.md, log.md untouched.");
