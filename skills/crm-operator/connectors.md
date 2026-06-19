# Connectors

Connectors let the CRM ingest from, and act on, the user's real tools. They are
**optional** — the CRM works fully without them — and each must be connected on
the user's side. Always degrade gracefully: if a connector isn't available, say
so and fall back to manual ingest rather than failing.

These are **claude.ai-managed MCP connectors**. To enable one, the user runs
`/mcp` in Claude Code and authorizes it. Check availability by attempting a read;
if only an `authenticate` tool is exposed, it's not connected yet — point the
user to `/mcp`.

Provenance: whenever a connector creates an entity, record where it came from so
the CRM links back to the source. Interactions carry a `source` object — see
[formats/interaction-FORMAT.md](formats/interaction-FORMAT.md).

---

## Gmail  (ready when connected)

Tools: `search_threads`, `get_thread`, `create_draft`, `list_labels`,
`label_thread`. **There is no send tool — Gmail can only draft.** The user
reviews and sends. Treat that as a feature: never imply mail was sent.

### Ingest from Gmail
1. `search_threads` with a Gmail query — e.g. `newer_than:14d -in:sent -category:promotions`,
   or scoped to a contact: `from:s.chen@meridianhealth.com OR to:s.chen@meridianhealth.com`.
2. For relevant threads, `get_thread` (FULL_CONTENT) to read the body.
3. Run each thread through the **Ingest** workflow: upsert contacts/companies/deals,
   create one interaction (`interaction_type: email`) with
   `source: { channel: "gmail", thread_id: "<id>" }`, preserve the body in
   `sections["Raw Source"]`, bump `last_contacted`.
4. Dedup by `source.thread_id` — never ingest the same thread twice.

### Draft a follow-up
Compose with `create_draft` (`to`, `subject`, `htmlBody`). Ground the content in
the contact's history and the deal's open action items. Tell the user it's a
**draft** waiting in Gmail for their review.

---

## Google Calendar  (needs `/mcp` authorization)

Until authorized, only `authenticate` is exposed. After authorizing, event tools
appear (create/list/update). The exact tool names load on connect — discover via
ToolSearch ("google calendar create event").

### Schedule a meeting (the "send a meeting link" path)
Creating an event with the customer as an **attendee** + a **Google Meet** link
makes Calendar email them the invite automatically — this is how a meeting link
reaches the customer (Gmail can't send).
1. Resolve the contact's `email` from `data.js` (ask if missing).
2. Create the event: title, start/end, attendee = contact email, add a Meet
   conference, description grounded in the deal.
3. In `data.js`: add an interaction (`interaction_type: meeting`,
   `source: { channel: "calendar", event_id: "<id>", meet_url, event_url }`),
   bump `last_contacted`, and add a follow-up **task** (e.g. "Prep for <meeting>").
4. Optionally draft a Gmail confirmation for the user to send.

### Read availability
List events for a date range to answer "when am I free?" and to avoid double-booking
before proposing times.

---

## Google Drive  (needs `/mcp` authorization)

After authorizing, file tools appear (search/create/get/share). Discover via
ToolSearch ("google drive create file share").

Uses:
- **Attach** existing Drive docs (proposals, contracts, decks) to a deal — store
  the share link in the deal's `sections["Notes"]` or a `links` list.
- **Export** a deal one-pager or the pipeline as a Doc/Sheet for sharing outside
  the vault.
- **Ingest** a shared notes doc as a raw source.

Store Drive references as URLs in the relevant entity's sections so they render as
links — never copy private file contents into the vault without the user's intent.

---

## Distribution note
Recipients must connect their own Google account via `/mcp`. The skill must work
with **none** of these connected (manual ingest), and light up each capability as
the matching connector becomes available. Document them as prerequisites, not
hard dependencies.
