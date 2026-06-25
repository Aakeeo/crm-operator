#!/usr/bin/env node
/* smoke-test.mjs — render every page through a tiny DOM shim and assert no
 * throws + that key content shows up. Catches runtime errors without a browser. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { applyMeta } from "./serve.mjs";
import { csvToObjects, buildEntity } from "./import.mjs";

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
function loadFixture(crm, search) {        // render an arbitrary CRM (for profile/object tests)
  makeEnv(search);
  window.CRM = crm;
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
// New (create) form renders for each type
for (const t of ["contact", "company", "deal", "task"]) {
  w = load(`?type=${t}`);
  captured = "";
  w.CRMRender.create();
  ok(captured.includes("Create") && captured.includes('id="create-btn"') && !captured.includes("undefined"), `new form '${t}' renders`);
}
// Search index builds over all entities
w = load("");
ok(typeof w.CRMRender.create === "function", "create renderer is exposed");

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

// ---- business profile (per-business labels, stages, custom fields) --------
var FX = {
  meta: { business: "Cascade Realty", accent: "#0d9488", profile: {
    labels: { deal: { one: "Listing", many: "Listings" }, contact: { one: "Client", many: "Clients" } },
    stages: ["new", "showing", "offer", "escrow"],
    stageLabels: { "closed-won": "Sold", "closed-lost": "Withdrawn" },
    fields: { deal: [{ key: "address", label: "Address" }, { key: "price", label: "Price", num: true }] },
    objects: [{ type: "property", one: "Property", many: "Properties", fields: [{ key: "address", label: "Address" }, { key: "beds", label: "Beds", num: true }], links: ["contact", "deal"] }]
  } },
  contacts: { "jane-doe": { type: "contact", id: "jane-doe", name: "Jane Doe", company: "acme", sections: {} } },
  companies: { "acme": { type: "company", id: "acme", name: "Acme", sections: {} } },
  deals: { "acme-main": { type: "deal", id: "acme-main", name: "123 Main St", company: "acme", stage: "offer", value: 850000, fields: { address: "123 Main St", price: 850000 }, sections: {} } },
  interactions: {}, tasks: {},
  objects: { property: { "123-main-st": { type: "property", id: "123-main-st", name: "123 Main St", fields: { address: "123 Main St", beds: 3 }, links: { contact: ["jane-doe"], deal: ["acme-main"] }, sections: {} } } }
};
let fw = loadFixture(FX, ""); captured = ""; fw.CRMRender.home();
ok(captured.includes("Open Listings"), "home KPI uses custom label 'Listings'");
ok(captured.includes("Clients"), "home uses custom label 'Clients'");
fw = loadFixture(FX, "?type=deal&id=acme-main"); captured = ""; fw.CRMRender.view();
ok(captured.includes("Listing") && !captured.includes(">Deal<"), "deal kicker uses custom label");
ok(captured.includes("Address") && captured.includes("123 Main St"), "deal shows custom field value");
fw = loadFixture(FX, "?type=deals"); captured = ""; fw.CRMRender.list();
ok(captured.includes("All Listings"), "deal list title uses custom label");
fw = loadFixture(FX, "?type=deal"); captured = ""; fw.CRMRender.create();
ok(captured.includes("Sold") && captured.includes("showing"), "new deal form offers custom stages");
ok(captured.includes("Address") && captured.includes("Price"), "new deal form offers custom fields");

// ---- custom objects -------------------------------------------------------
fw = loadFixture(FX, "?type=obj:property"); captured = ""; fw.CRMRender.list();
ok(captured.includes("All Properties") && captured.includes("123 Main St"), "object list renders");
ok(captured.includes("Beds"), "object list shows object field columns");
fw = loadFixture(FX, "?type=obj:property&id=123-main-st"); captured = ""; fw.CRMRender.view();
ok(captured.includes("123 Main St") && captured.includes("Address"), "object page shows fields");
ok(captured.includes("view.html?type=contact") || captured.includes("type=contact"), "object page links to a contact");
fw = loadFixture(FX, "?type=contact&id=jane-doe"); captured = ""; fw.CRMRender.view();
ok(captured.includes("Properties") && captured.includes("123 Main St"), "core page shows object backlinks");
fw = loadFixture(FX, "?type=obj:property"); captured = ""; fw.CRMRender.create();
ok(captured.includes("Property") && captured.includes("Address") && captured.includes("Beds"), "object create form renders");

// ---- branding save must preserve an existing profile (data-loss regression) ----
{
  const before = 'window.CRM = {\n  meta: {"business":"Old","accent":"#111","profile":{"industry":"realty","labels":{"deal":{"one":"Listing"}}}}, /*@meta*/\n  contacts: {}\n};';
  const after = applyMeta(before, { business: "New Co", tagline: "T", accent: "#000" });
  ok(after.includes('"realty"') && after.includes('"Listing"'), "branding save preserves meta.profile");
  ok(after.includes('"business":"New Co"') && after.includes('"accent":"#000"'), "branding save updates branding fields");
  ok((after.match(/\/\*@meta\*\//g) || []).length === 1, "branding save keeps a single @meta marker");
}

// ---- CSV import (parser handles quotes/commas/newlines; mapping builds entities) ----
{
  const csv = 'First Name,Last Name,Email,Amount,Notes\n"Jane","Doe",jane@x.com,"$1,200","a, b\nc"\nJohn,Roe,john@x.com,950,plain';
  const { headers, records } = csvToObjects(csv);
  ok(headers.length === 5 && records.length === 2, "CSV parses header + 2 rows");
  ok(records[0]["Notes"] === "a, b\nc", "CSV keeps quoted comma + embedded newline");

  const hubspot = { name: ["First Name", "Last Name"], email: "Email" };
  const e = buildEntity("contact", records[0], hubspot, "2026-06-25");
  ok(e.id === "jane-doe" && e.name === "Jane Doe", "buildEntity joins names and slugs id");
  ok(e.created === "2026-06-25", "buildEntity stamps created/updated");

  const deal = buildEntity("deal", records[0], { name: "Email", value: "Amount" }, "2026-06-25");
  ok(deal.value === 1200, "buildEntity coerces $1,200 → number 1200");
  const noName = buildEntity("contact", { Email: "x@y.com" }, { email: "Email" }, "2026-06-25");
  ok(noName === null, "buildEntity skips a row with no name");
  const dealStage = buildEntity("deal", { Email: "z@z.com" }, { name: "Email" }, "2026-06-25");
  ok(dealStage.stage === "lead", "deal without a stage defaults to lead");
  const c = buildEntity("contact", { Co: "Meridian Health" }, { name: "Co", company: "Co" }, "2026-06-25");
  ok(c.company === "meridian-health", "relationship field is slugged to an id");
}

console.log(fail ? `\n  ${fail} FAILED` : "\n  all passed");
process.exit(fail ? 1 : 0);
