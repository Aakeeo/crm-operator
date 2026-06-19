# Company format

`CRM.companies[id]` where `id = slug(name)`.

```js
"meridian-health": {
  type: "company",
  id: "meridian-health",
  name: "Meridian Health",
  domain: "meridianhealth.com",
  industry: "Healthcare",
  size: "enterprise",        // startup | smb | mid-market | enterprise
  status: "prospect",        // prospect | customer | partner | churned
  location: "Boston, MA",
  arr_potential: 240000,     // bare number, no symbols
  tags: ["healthcare", "enterprise-sales"],
  created: "2026-03-10",
  updated: "2026-04-01",
  sections: { "Overview": "…", "Notes": "…" }
}
```

Computed by the engine (do **not** store): Key Contacts, Active Deals — derived by
scanning contacts/deals whose `company` id points here.
Required: `name`.
