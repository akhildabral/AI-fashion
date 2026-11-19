#!/usr/bin/env bash
# Write deploy/backend.env from $BACKEND_ENV_B64, which CI renders from the
# GitHub secrets and variables whose names start with APP_ (APP_JWT_SECRET
# becomes JWT_SECRET=...). GitHub is the source of truth; the file on the box
# is a rendered copy.
#
# Without the variable (a deploy by hand, or no APP_ secrets yet) this does
# nothing and the file on the box stays as it is. The previous file is kept
# beside the new one as backend.env.bak-<timestamp> whenever it changes.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${BACKEND_ENV_B64:-}" ]; then
  echo "▸ no env from CI — keeping deploy/backend.env as it is"
  exit 0
fi

new="$(mktemp)"
trap 'rm -f "$new"' EXIT
printf '%s' "$BACKEND_ENV_B64" | base64 -d > "$new"

# The backend refuses to boot without these; never swap in a file missing them.
for key in JWT_SECRET AI_API_KEY CORS_ORIGINS PUBLIC_ORIGIN; do
  if ! grep -q "^$key=." "$new"; then
    echo "✗ rendered env has no $key — keeping the existing deploy/backend.env"
    exit 1
  fi
done

if [ -f deploy/backend.env ]; then
  if cmp -s "$new" deploy/backend.env; then
    echo "▸ deploy/backend.env unchanged"
    exit 0
  fi
  cp -p deploy/backend.env "deploy/backend.env.bak-$(date +%Y%m%d%H%M%S)"
  # Keep the five most recent backups.
  ls -1t deploy/backend.env.bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
fi
install -m 600 "$new" deploy/backend.env
echo "▸ deploy/backend.env written from GitHub ($(grep -c '=' deploy/backend.env) keys)"
