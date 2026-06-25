---
name: crm-operator
description: Maintain a personal CRM as a self-contained folder of HTML — contacts, companies, deals, interactions, tasks. Use when the user drops in meeting notes/emails/transcripts to file, asks about their pipeline or follow-ups, wants to update a deal or contact, or wants to set up a new CRM. Onboards from Gmail (and, where connected, Slack).
---

# CRM Operator

You maintain a CRM that lives as a **self-contained app-folder**: a handful of HTML files plus one data file. No database, no Obsidian, no plugins — the user opens `index.html` in a browser and navigates. The human sources leads and builds relationships; you do all the bookkeeping.

## The model: the folder is the state

A CRM vault has exactly these files:

```
data.js        ← THE database. window.CRM = { contacts, companies, deals, interactions, tasks }
render.js      ← shared engine: draws any page from data.js (never entity-specific)
styles.css     ← shared look (design system: Hanken Grotesk + IBM Plex Mono, themed from meta.accent)
fonts/         ← self-hosted font files, shipped with the engine
index.html     ← home + dashboards (pipeline, follow-ups, recent activity)
view.html      ← renders any one entity: view.html?type=deal&id=<slug>
settings.html  ← in-app branding editor (business name, tagline, accent) — writes meta to data.js via the server
MISSION.md     ← who the user is, what they sell, goals — grounds prioritization
NOTES.md       ← your working notes & the user's preferences
log.md         ← append-only activity log
```

**The golden rule: you only ever edit `data.js`** (plus the markdown control-plane files). You never hand-write `view.html`/`render.js` markup — pages render themselves from the data. Adding a contact is one edit to `data.js` and **zero new files**.

**Engine vs data — the split that makes vaults updatable.** The canonical engine (`render.js`, `styles.css`, `index.html`, `view.html`, `engine.json`) lives in [`engine/`](engine/) and is **skill-owned**: overwrite it freely. `data.js` and the markdown files are **user-owned**: never overwrite them. A vault is just a copy of the engine plus the user's `data.js`. [`example/`](example/) is a complete demo vault (engine + demo `data.js`) for browsing.

## Data shape

`data.js` is one assignment: `window.CRM = { meta: {...}, contacts: {}, companies: {}, deals: {}, interactions: {}, tasks: {} }`. **`meta`** carries the branding — `{ business: "Acme", tagline: "Sales CRM", accent: "#4f46e5" }`. The whole UI re-themes from `meta.accent` (one color drives the palette), and `meta.business` names the app in the header. `meta` may also carry a **`profile`** that adapts the CRM to one business — renamed objects, real pipeline stages, custom fields, custom object types; built during Bootstrap, see [formats/profile-FORMAT.md](formats/profile-FORMAT.md). Set these during bootstrap, or let the user edit them from the in-app **Settings** page (`settings.html`), which writes `meta` back via the local server. The `meta` line is marked with `/*@meta*/` so the server rewrites only that line. Each bucket maps `id → entity`. The **id is the slug** of the entity's title: lowercase, non-alphanumeric → `-` (e.g. `"Sarah Chen"` → `sarah-chen`, `"Meridian Health - Platform Migration"` → `meridian-health-platform-migration`). Relationships are stored as **ids** (`deal.company = "meridian-health"`). Free-text body lives in a `sections` object (`{ "Background": "markdown…" }`); section prose may use `[[Wikilinks]]` and they resolve automatically. Auto/computed sections (Interaction History, Linked Deals, Key Contacts, Active Deals) are **not stored** — the engine computes them. Per-entity fields: see [formats/](formats/).

## Workflows

### Bootstrap (set up a new CRM) — interview, then scaffold
A new CRM should fit the user's business, not the generic template. **Interview
first, scaffold second.** The interview produces a `meta.profile` (see
[formats/profile-FORMAT.md](formats/profile-FORMAT.md)) so the UI reads in their
language. Ask in a batch — don't interrogate one question at a time:

1. **Branding** — business name, one-line tagline, brand color.
2. **What they do** — industry + what they sell (→ `profile.industry`, also grounds `MISSION.md`).
3. **Vocabulary** — what do they call their core objects? "Deals" might be Listings, Matters, Policies, Projects; "Contacts" might be Clients, Patients, Members. (→ `profile.labels`)
4. **Pipeline** — the stages a deal moves through, in order; and what they call a win vs. a loss. (→ `profile.stages` + `profile.stageLabels`)
5. **Key fields** — the 2–4 fields that matter most on a deal/contact (e.g. property address, policy number, case type). (→ `profile.fields`)
6. **Custom objects** — do they track anything that isn't a contact/company/deal? Properties, matters, vehicles, units, claims. (→ `profile.objects`)
7. **Existing data** — are they coming from a spreadsheet, HubSpot, Pipedrive, Salesforce, or Gmail? A CSV/CRM export → **Import** workflow; Gmail → **Connectors**.

Then **play the profile back in plain English** ("So: deals→Listings, stages new→showing→offer→escrow, a win is 'Sold'…") and confirm before scaffolding. Keep it light for a simple business — a generic profile (no labels/stages overrides) is fine; don't force custom objects on someone who doesn't need them.

Scaffold:
1. Run `node scripts/bootstrap.mjs <targetDir>`.
2. Edit `data.js`'s `meta` line in place: replace it with **one line** of JSON holding `business`, `tagline`, `accent`, and `profile` — keep the `/*@meta*/` marker and keep it on a single line (Settings-save rewrites that line and preserves `profile`). Fill in `MISSION.md`.
3. **Serve it** (see below) and give the user the URL.
4. Run the **Existing data** step — **Import** their CSV/CRM export, or onboard from Gmail (see Connectors).

### Serve (make it reachable)
Whenever you open or work on a CRM, run `node scripts/serve.mjs <vaultDir>` **in the background** and give the user `http://127.0.0.1:8787`. It's a zero-dependency static server and idempotent (re-running just reports the URL), so the CRM always has a real, professional URL instead of a `file://` path. Re-running after edits isn't needed — just refresh the browser. **On start it also auto-updates the vault's engine** to the latest version (copying engine files, never `data.js`), so simply opening a CRM keeps its UI current. Pass `--no-update` to skip that.

### Ingest (file a raw source)
1. Read the source completely. 2. Extract people, companies, deals, dates, action items.
3. **Dedup first** — compute the slug and check if the id already exists in `data.js`. Update if so, create if not.
4. Edit `data.js`: upsert contacts/companies/deals, add one `interactions` entry, add `tasks` for action items. Set relationship fields to ids. Bump `last_contacted` on involved contacts and `updated` on touched entities.
5. Append a `log.md` entry. Preserve the raw source in the interaction's `sections["Raw Source"]`.

### Import (bulk-load an existing CRM / spreadsheet)
Every tool exports CSV, so CSV is the one import path. HubSpot, Pipedrive, Salesforce, and plain spreadsheets each have a preset in [`imports/`](imports/) mapping their column headers to our fields; **Power BI** = export the visual's data as CSV and use `--source generic`.
1. Get the file path. `node scripts/import.mjs <vault> <file.csv> --inspect` to see its headers + row count.
2. Pick a preset (`--source hubspot|pipedrive|salesforce|generic`) or override the column map with `--map '{"name":"Full Name","email":"Work Email"}'` (value = a header, or `["First","Last"]` to join; `fields.x` targets a custom field). Eyeball the headers against the preset and adjust.
3. **Preview with `--dry`**, show the user the counts, then run for real.
4. **Order matters** — import `--type company`, then `contact`, then `deal`, so relationship slugs (a contact's company) resolve to real entities. Import dedups by slug, so re-running is safe.
5. Map deal stages to the user's pipeline afterward if the source's stage names differ (a quick Update pass), and run **Lint** to catch any dangling relationships. Append a `log.md` entry.

### Query
Read `data.js`, answer with the numbers, cite entities by name. (Pipeline = sum of `deal.value` where stage ∉ {closed-lost, closed-won}.) Offer to save substantial analyses as a new dashboard section.

### Update
Find the entity in `data.js`, change fields, append to `sections["Stage History"]` for deal stage moves, bump `updated`, log it.

### Lint
Scan `data.js` for: missing required fields, relationship ids that don't exist, contacts with no company, deals with no interaction in 30 days, overdue tasks, orphan entities, likely duplicates. Report findings and offer fixes.

### Schedule a meeting
Resolve the contact's email → create a Google Calendar event with the contact as attendee + a Meet link (Calendar emails the invite — that's how the link reaches the customer) → record it as an `interaction` with `source.event_id`/`meet_url` and add a prep `task`. See [connectors.md](connectors.md).

## Connectors (onboarding + actions from real tools)
Optional and user-connected; the CRM works fully without them. Details, workflows, and graceful fallbacks in **[connectors.md](connectors.md)**.
- **Gmail** (ready) — ingest threads as interactions; draft follow-ups (draft-only, the user sends).
- **Google Calendar** (needs `/mcp` auth) — schedule meetings with Meet links + attendees; check availability.
- **Google Drive** (needs `/mcp` auth) — attach/share deal docs; export one-pagers.
- New sources follow the same shape: fetch → treat as raw source → Ingest. Always dedup by `source` id.

## Migrating an existing markdown vault
Run `node scripts/migrate.mjs <vaultDir> <outDir>` to convert an Obsidian-style markdown CRM into `data.js`. Validate with `node scripts/smoke-test.mjs`.

## Updating a vault's engine
The skill itself updates via `npx skills update`. Existing vaults then upgrade **automatically the next time they're served** (see Serve above) — no action needed. For an explicit or headless refresh, run `node scripts/update-engine.mjs <vaultDir>`. Either way only the engine files change; `data.js` and the markdown files are untouched, so users keep their data across upgrades.

## Rules
1. Never delete data — append, update, or mark inactive/churned/closed-lost. 2. Always store relationships as ids, both directions discoverable. 3. Dedup by slug before creating. 4. When uncertain, add a `TODO` tag with a note rather than guessing. 5. Keep `log.md` current. 6. Numbers are bare numbers; dates are `YYYY-MM-DD` strings. 7. Only edit `data.js` and the markdown control-plane files — never the engine.
