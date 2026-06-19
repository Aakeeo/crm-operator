# Deal format

`CRM.deals[id]` where `id = slug("<Company> - <Deal Name>")` (the page title).
Note `name` is just the deal name; the id carries the company prefix.

```js
"meridian-health-platform-migration": {
  type: "deal",
  id: "meridian-health-platform-migration",
  name: "Platform Migration",
  company: "meridian-health",       // company id
  primary_contact: "sarah-chen",    // contact id
  value: 240000,                    // bare number
  currency: "USD",
  stage: "negotiation",             // lead | qualified | proposal | negotiation | closed-won | closed-lost
  probability: 75,
  expected_close: "2026-05-30",
  owner: "Our Team",
  tags: ["healthcare", "enterprise-sales", "migration"],
  created: "2026-03-15",
  updated: "2026-04-07",
  sections: {
    "Summary": "…",
    "Requirements": "…",
    "Competition": "…",
    "Stage History": "- 2026-03-15: → lead (…)\n- 2026-03-22: qualified → proposal (…)",
    "Notes": "…"
  }
}
```

`Stage History` is append-only — add a line on every stage change, never rewrite.
Computed by the engine: the deal's Interactions list. Required: `name`, `company`, `stage`.
