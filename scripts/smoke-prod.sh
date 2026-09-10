#!/usr/bin/env bash
# Thin wrapper for Unix CI / shells. Prefer: npm run smoke:prod -- …
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec node "$ROOT/scripts/smoke-prod.mjs" "$@"
