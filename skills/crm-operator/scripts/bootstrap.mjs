#!/usr/bin/env node
/* bootstrap.mjs <targetDir> — scaffold a new, empty CRM vault.
 * Copies the canonical engine, writes an empty data.js + control-plane files.
 * Safe to re-run: never overwrites an existing data.js or markdown file. */
import { mkdirSync, writeFileSync, copyFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE = resolve(here, "..", "engine");
const target = resolve(process.argv[2] || ".");

mkdirSync(target, { recursive: true });
for (const f of readdirSync(ENGINE)) copyFileSync(join(ENGINE, f), join(target, f)); // engine + engine.json

const seed = {
  "data.js": "window.CRM = {\n" +
    "  meta: { business: \"\", tagline: \"\", accent: \"\" },\n" +
    "  contacts: {},\n  companies: {},\n  deals: {},\n  interactions: {},\n  tasks: {}\n};\n",
  "MISSION.md": "# Mission\n\n_Who are you, what do you sell, and what are your current goals? The CRM uses this to prioritize._\n",
  "NOTES.md": "# Notes\n\n_Working notes and preferences for how this CRM should be maintained._\n",
  "log.md": "# Activity Log\n",
};
for (const [f, body] of Object.entries(seed)) {
  const p = join(target, f);
  if (!existsSync(p)) writeFileSync(p, body);
}
console.log("CRM vault ready at " + target);
console.log("Open index.html in a browser. The agent edits data.js only.");
