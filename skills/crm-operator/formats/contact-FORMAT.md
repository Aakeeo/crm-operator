# Contact format

`CRM.contacts[id]` where `id = slug(name)`.

```js
"sarah-chen": {
  type: "contact",
  id: "sarah-chen",
  name: "Sarah Chen",
  email: "s.chen@meridianhealth.com",
  phone: "+1-617-555-0142",
  company: "meridian-health",   // id of a CRM.companies entry
  role: "CTO",
  linkedin: "linkedin.com/in/sarahchen",
  status: "active",             // active | inactive | prospect | churned
  lead_source: "Conference - HealthTech Summit 2026",
  last_contacted: "2026-04-07", // YYYY-MM-DD; bump on every new interaction
  tags: ["decision-maker", "technical"],
  created: "2026-03-10",
  updated: "2026-04-07",
  sections: {
    "Background": "…",
    "Relationship History": "…",
    "Key Interests & Pain Points": "…",
    "Notes": "…"
  }
}
```

Computed by the engine (do **not** store): Interaction History, Linked Deals.
Required: `name`. Always set `company` to a real company id, or add `tags:["TODO"]`.
