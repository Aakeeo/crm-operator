# Task format

`CRM.tasks[id]` where `id = slug(title)`.

```js
"send-baa-to-meridian-legal": {
  type: "task",
  id: "send-baa-to-meridian-legal",
  name: "Send BAA to Meridian legal",
  title: "Send BAA to Meridian legal",
  assigned_to: "Our Team",
  related_to: ["Meridian Health - Platform Migration", "Sarah Chen"], // names or ids; resolved by slug
  due_date: "2026-04-12",
  priority: "high",            // high | medium | low
  status: "todo",             // todo | in-progress | done
  created: "2026-04-07",
  sections: { "Details": "what needs doing and why" }
}
```

`related_to` entries may be page titles, names, or ids — the engine resolves each
by slug, so any of them link correctly. The home page flags a task **overdue**
when `due_date < today` and `status != "done"`.
Required: `title`, `due_date`, `status`.
