#!/usr/bin/env node
/* smoke-test.mjs — render every page through a tiny DOM shim and assert no
 * throws + that key content shows up. Catches runtime errors without a browser. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const ex = join(here, "..", "example");

let captured = "";
function makeEnv(search) {
  globalThis.window = {};
  globalThis.document = {
    _el: { set innerHTML(v) { captured = v; }, get innerHTML() { return captured; }, set textContent(v) {}, get textContent() { return ""; }, addEventListener() {}, value: "", style: { setProperty() {} } },
    documentElement: { style: { setProperty() {} } },
    querySelectorAll() { return []; },
    getElementById() { return this._el; },
    set title(v) {}, get title() { return ""; }
  };
  globalThis.location = { search };
}
function load(search) {
  makeEnv(search);
  eval(readFileSync(join(ex, "data.js"), "utf8"));
  eval(readFileSync(join(ex, "render.js"), "utf8"));
  return window;
}

let fail = 0;
function ok(cond, msg) { console.log((cond ? "  ✓ " : "  ✗ ") + msg); if (!cond) fail++; }

// Home
let w = load("");
captured = "";
w.CRMRender.home();
ok(captured.includes("Open pipeline"), "home renders KPIs");
ok(/\$[\d,]+/.test(captured), "home shows a dollar figure");
ok(captured.includes("Pipeline"), "home has pipeline section");
ok(!captured.includes("undefined"), "home has no 'undefined'");

// One of each entity type
const samples = [
  ["contact", "sarah-chen", "Sarah Chen"],
  ["company", "meridian-health", "Meridian Health"],
  ["deal", "meridian-health-platform-migration", "Platform Migration"],
];
for (const [type, id, expect] of samples) {
  w = load(`?type=${type}&id=${id}`);
  captured = "";
  w.CRMRender.view();
  ok(captured.includes(expect), `${type} page shows "${expect}"`);
  ok(!captured.includes("[["), `${type} page has no raw wikilinks`);
  ok(!captured.includes("undefined"), `${type} page has no 'undefined'`);
}

// Every entity renders without throwing
w = load("");
let rendered = 0;
for (const [plural, sing] of Object.entries({ contacts: "contact", companies: "company", deals: "deal", interactions: "interaction", tasks: "task" })) {
  for (const idv of Object.keys(w.CRM[plural])) {
    const env = load(`?type=${sing}&id=${idv}`);
    captured = "";
    try { env.CRMRender.view(); rendered++; }
    catch (e) { ok(false, `${sing}/${idv} threw: ${e.message}`); }
  }
}
ok(rendered === 45, `all ${rendered} entity pages rendered without throwing`);

// Settings page renders
w = load("");
captured = "";
w.CRMRender.settings();
ok(captured.includes("Branding") && captured.includes('id="f-business"'), "settings page renders the branding form");

// List views render for each type
for (const t of ["deals", "contacts", "companies", "interactions", "tasks"]) {
  w = load(`?type=${t}`);
  captured = "";
  w.CRMRender.list();
  ok(captured.includes("All ") && !captured.includes("undefined"), `list view '${t}' renders`);
}
// Avatars present on a contact list + contact page
w = load("?type=contacts"); captured = ""; w.CRMRender.list();
ok(captured.includes('class="avatar'), "contact list shows avatars");
w = load("?type=company&id=meridian-health"); captured = ""; w.CRMRender.view();
ok(captured.includes('class="avatar sq"'), "company page shows a square avatar");

// Task related links must resolve (regression for the [[..]] bug)
w = load("?type=task&id=confirm-thursday-sandbox-walkthrough");
captured = "";
w.CRMRender.view();
ok(captured.includes("view.html?type=deal"), "task related_to links resolve to pages");

console.log(fail ? `\n  ${fail} FAILED` : "\n  all passed");
process.exit(fail ? 1 : 0);
