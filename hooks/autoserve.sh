#!/bin/sh
# SessionStart hook: if this session's directory is a CRM vault, bring its local
# server up so the CRM has a real URL the moment you open it. No-op everywhere
# else. Never blocks the session — backgrounds + detaches, always exits 0.
# serve.mjs is idempotent and port-hops, so re-firing is safe.
d="${CLAUDE_PROJECT_DIR:-$PWD}"
if [ -f "$d/data.js" ] && grep -q "window.CRM" "$d/data.js" 2>/dev/null; then
  (cd "$d" && nohup node "$CLAUDE_PLUGIN_ROOT/skills/crm-operator/scripts/serve.mjs" . >/dev/null 2>&1 &)
fi
exit 0
