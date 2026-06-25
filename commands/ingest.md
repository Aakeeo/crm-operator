---
description: File a raw source (meeting notes, email, transcript) into the CRM.
argument-hint: "[file path, or paste the source]"
---
Use the **crm-operator** skill's **Ingest** workflow on $ARGUMENTS (a file path — or ask me to paste the source if empty).

Extract people, companies, deals, dates, and action items; dedup by slug; upsert into `data.js`; add exactly one `interactions` entry (preserving the raw source); create `tasks` for follow-ups; bump `last_contacted`/`updated`; and append a `log.md` entry.
