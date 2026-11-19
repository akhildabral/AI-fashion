#!/usr/bin/env bash
# Write deploy/backend.env from the APP_* variables in the environment. CI
# passes them in from the GitHub production secrets and variables
# (APP_JWT_SECRET becomes JWT_SECRET=...), so GitHub is the source of truth
# and the file on the box is a rendered copy. Empty values are skipped.
#
# With no APP_* variables (a deploy by hand) this does nothing and the file
# on the box stays as it is. The previous file is kept beside the new one as
# backend.env.bak-<timestamp> whenever it changes.
set -euo pipefail
cd "$(dirname "$0")/.."

new="$(mktemp)"
trap 'rm -f "$new"' EXIT
for name in $(compgen -e | grep '^APP_' | grep -v '^APP_ENV_KEYS$' | sort); do
  value="${!name}"
  [ -n "$value" ] && printf '%s=%s\n' "${name#APP_}" "$value" >> "$new"
done

if [ ! -s "$new" ]; then
  echo "▸ no APP_* settings in the environment — keeping deploy/backend.env as it is"
  exit 0
fi

# The backend refuses to boot without these; never swap in a file missing them.
for key in JWT_SECRET AI_API_KEY CORS_ORIGINS PUBLIC_ORIGIN; do
  if ! grep -q "^$key=." "$new"; then
    echo "✗ no APP_$key from GitHub — keeping the existing deploy/backend.env"
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
