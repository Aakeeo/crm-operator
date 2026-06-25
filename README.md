# crm-operator

**A personal CRM that lives as a folder of files, maintained for you by an AI agent.**

Drop in meeting notes, emails, or call transcripts and the agent extracts contacts,
companies, deals, interactions, and follow-up tasks — keeping everything cross-linked
and your pipeline current. You browse it as a small, self-contained website: open
`index.html` in any browser. No database, no Obsidian, no plugins. Your data is just files.

![CRM home dashboard](docs/home.png)

## Install

```bash
# Claude Code — copies straight into .claude/skills/ (recommended)
npx skills add Aakeeo/crm-operator --agent claude-code
```

Update later with `npx skills update`. Works for Cursor, Codex, and other agents too —
just drop the `--agent` flag to pick interactively.

> **Claude Code tip:** if you choose the *Universal* (`.agents/skills/`) install, Claude Code
> reads from `.claude/skills/`, so you need a link: `ln -s ../.agents/skills .claude/skills`
> (or just use `--agent claude-code` above, which copies directly and avoids this).

### Or install as a Claude Code plugin

The same repo is also a Claude Code **plugin**, which adds slash commands and an
auto-serve hook on top of the skill:

```
/plugin marketplace add Aakeeo/crm-operator
/plugin install crm-operator@crm-operator
```

You get `/crm-operator:crm` (onboarding), `:import`, `:ingest`, `:serve`, `:lint`, and
a SessionStart hook that brings the local server up automatically whenever you open a
vault folder. The plugin auto-updates per commit.

## Quick start

In your agent, just say:

> "Set up a new CRM here."

It **interviews you about your business** — what you sell, what you call your "deals" and
"contacts", your pipeline stages, the fields that matter, anything custom you track — and
tailors the CRM's vocabulary, stages, and structure to fit. Then it scaffolds a vault,
**serves it at `http://127.0.0.1:8787`**, and themes the whole UI around your brand. Then you can:

- **Import** — bring your existing data from a CSV / HubSpot / Pipedrive / Salesforce / Power BI export.
- **Ingest** — "Process these meeting notes" → it files every contact/company/deal/task.
- **Query** — "What's my open pipeline?" / "What follow-ups are overdue?"
- **Update** — "Move the Northwind deal to negotiation."
- **Schedule** — "Book a demo with Dana next Tuesday" → Calendar event + Meet link.

## How it works

A CRM vault is five files plus your data:

| File | Role |
|------|------|
| `data.js` | **The database.** `window.CRM = { contacts, companies, deals, … }`. The agent only ever edits this. |
| `render.js`, `styles.css` | Shared engine — every page draws itself from `data.js`. |
| `index.html` | Home + dashboards (pipeline, follow-ups, recent activity). |
| `view.html` | Renders any single entity: `view.html?type=deal&id=…`. |

The browser renders everything locally from plain `<script src>` — no build step, no server.
Adding a contact is one edit to `data.js` and zero new files.

**Engine vs data.** The engine (`engine/`) is versioned and skill-owned; your `data.js`
and notes are yours and never overwritten. Upgrade an existing vault's engine in place with
`node scripts/update-engine.mjs <vault>` — your data is structurally untouched.

## Staying up to date

You don't have to track releases. When a newer version exists, your CRM tells you:

- **In the app** — Home shows a banner: *"A newer version is available — run `npx skills update`."*
- **In the terminal** — the local server prints the same notice on start.

After `npx skills update`, existing vaults upgrade **automatically the next time they're opened**
(the server refreshes the engine on start) — your `data.js` is never touched.

## Connectors (optional)

Connect your own accounts in Claude (`/mcp`) to light these up:

- **Gmail** — ingest threads as interactions; draft follow-ups (you send).
- **Google Calendar** — schedule meetings with attendees + Meet links.
- **Google Drive** — attach/share deal docs.

The CRM works fully with none connected. See [`skills/crm-operator/connectors.md`](skills/crm-operator/connectors.md).

## Migrating an existing markdown CRM

```bash
node skills/crm-operator/scripts/migrate.mjs <markdown-vault> <out-dir>
```

## License

MIT — see [LICENSE](LICENSE).
