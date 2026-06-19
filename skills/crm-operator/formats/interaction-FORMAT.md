# Interaction format

`CRM.interactions[id]` where `id = slug("<YYYY-MM-DD> <Description>")`.
One interaction per raw source — even if it mentions several meetings.

```js
"2026-03-15-meridian-health-discovery-call": {
  type: "interaction",
  id: "2026-03-15-meridian-health-discovery-call",
  name: "2026-03-15 Meridian Health Discovery Call",
  date: "2026-03-15",
  interaction_type: "call",         // meeting | email | call | demo | social
  participants: ["sarah-chen", "marcus-johnson"],  // contact ids
  company: "meridian-health",       // company id
  deal: "meridian-health-platform-migration",      // deal id
  summary: "One-line summary",
  source: { channel: "manual" }, // or gmail / calendar / drive — see below
  tags: [],
  created: "2026-03-15",
  sections: {
    "Notes": "…detailed notes…",
    "Action Items": "- [ ] … (owner, due date)",
    "Raw Source": "> the original notes/email/transcript, preserved verbatim"
  }
}
```

Always preserve the original input in `sections["Raw Source"]`.
Required: `date`, `interaction_type`, at least one of participants/company/deal.

**`source` — provenance** (lets the CRM link back and dedup against connectors):
```js
source: { channel: "gmail",    thread_id: "18f..." }              // ingested email
source: { channel: "calendar", event_id: "abc", meet_url: "https://meet.google.com/...", event_url: "https://calendar.google.com/..." }
source: { channel: "manual" }                                      // typed/pasted by the user
```
Dedup ingests by `source.thread_id` / `source.event_id` — never file the same one twice.
