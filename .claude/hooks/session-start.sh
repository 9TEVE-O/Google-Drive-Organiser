#!/bin/bash
# SessionStart hook: install npm dependencies so `npm run lint` and
# `npm run build` work in Claude Code on the web sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# `npm install` (not `npm ci`) so the cached container's node_modules is reused.
npm install --no-audit --no-fund
