# `meta.profile` — adapt the CRM to one business

A profile makes the generic 5-entity CRM read in the user's language: rename
the core objects, set their real pipeline stages, add custom fields, and define
extra object types. It lives on `meta.profile` in `data.js`. **No profile = the
generic defaults** (Contacts/Companies/Deals, lead→qualified→proposal→negotiation).
You build it from the Bootstrap interview.

The engine reads every key below; all are optional — include only what changes.

```jsonc
{
  "industry": "Residential real estate",   // free text, context only

  // Rename core objects. Only list the ones that differ. {one, many}.
  "labels": {
    "deal":    { "one": "Listing", "many": "Listings" },
    "contact": { "one": "Client",  "many": "Clients" }
  },

  // OPEN pipeline stages, in order. closed-won / closed-lost ALWAYS exist and
  // are appended automatically — never put them here. Pipeline math is unchanged
  // (open = value where stage ∉ {closed-won, closed-lost}).
  "stages": ["new", "showing", "offer", "escrow"],

  // Display labels for any stage id, INCLUDING what a win/loss is called.
  "stageLabels": { "closed-won": "Sold", "closed-lost": "Withdrawn" },

  // Optional: force a badge color per stage. "good" | "warn" | "accent" | "bad" | "".
  // Omit to let the engine auto-gradient open stages (last → warn, late → accent).
  "stageColors": { "escrow": "good" },

  // Custom fields per core entity. Stored on entity.fields[key]. num:true =
  // formatted as a number. Rendered on the page and offered in the New form.
  "fields": {
    "deal":    [{ "key": "address", "label": "Address" },
                { "key": "price",   "label": "Price", "num": true }],
    "contact": [{ "key": "preapproved", "label": "Pre-approved?" }]
  },

  // Custom object types — anything that isn't a contact/company/deal.
  // Records live in CRM.objects[type][id]. links = which core types a record
  // can point at (creates backlinks on those core pages).
  "objects": [{
    "type": "property", "one": "Property", "many": "Properties",
    "fields": [{ "key": "address", "label": "Address" },
               { "key": "beds", "label": "Beds", "num": true }],
    "links": ["contact", "deal"]
  }]
}
```

## How a record carries profile data
- **Custom fields** → `entity.fields = { address: "123 Main St", price: 850000 }`
- **Object record** → `CRM.objects.property["123-main-st"] = { type, id, name, fields: {...}, links: { contact: ["jane-doe"], deal: ["acme-main"] }, sections: {} }`
- Object ids are slugs, same rule as core entities.

## Two quick examples

**Law firm:** `deal`→Matter, `contact`→Client, `company`→Opposing Party;
stages `intake → discovery → filing → trial`; deal fields `case_number`,
`practice_area`; object `document` (linked to matter).

**Insurance brokerage:** `deal`→Policy, `contact`→Policyholder;
stages `quote → application → underwriting → bound`; win=`Bound`, loss=`Lapsed`;
deal fields `premium` (num), `coverage_type`; object `claim`.

## Writing it into `data.js`
The whole `meta` object — `business`, `tagline`, `accent`, **and** `profile` —
goes on the **single** `/*@meta*/` line as one line of JSON. Keep it one line:
the Settings server rewrites that line in place and preserves `profile` across
branding edits. Example:

```js
  meta: {"business":"Cascade Realty","tagline":"Listings & clients","accent":"#0d9488","profile":{"labels":{"deal":{"one":"Listing","many":"Listings"}},"stages":["new","showing","offer","escrow"],"stageLabels":{"closed-won":"Sold"}}}, /*@meta*/
```
