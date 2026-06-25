---
description: Import contacts/companies/deals from a CSV / HubSpot / Pipedrive / Salesforce / Power BI export.
argument-hint: "[file.csv]"
---
Use the **crm-operator** skill's **Import** workflow.

For the file at $ARGUMENTS (ask me for the path if empty): run `scripts/import.mjs --inspect` to see its headers, pick the matching source preset (or build a `--map`), preview with `--dry` and show me the counts, then import for real in order — companies, then contacts, then deals — so relationships resolve. Run **Lint** afterward to catch dangling links. (Power BI: export the visual as CSV, use `--source generic`.)
