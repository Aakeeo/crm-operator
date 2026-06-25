---
description: Health-check the CRM — missing fields, broken links, stale deals, overdue tasks, duplicates.
---
Use the **crm-operator** skill's **Lint** workflow on the vault in this directory: scan `data.js` for missing required fields, relationship ids that don't resolve, contacts with no company, deals with no interaction in 30 days, overdue tasks, orphans, and likely duplicates. Report findings and offer fixes.
