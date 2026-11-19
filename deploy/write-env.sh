#!/usr/bin/env bash
# Write the two env files on the box from the environment CI hands over, so
# GitHub (production secrets and variables) is the source of truth and the
# files here are rendered copies:
#
#   APP_<KEY>   → deploy/backend.env   (the backend's settings and secrets)
#   PROD_<KEY>  → .env.prod            (compose level: Postgres password,
#                                       site address, public origin)
#
# Empty values are skipped. With none of a prefix in the environment (a
# deploy by hand) that file is left as it is. The previous file is kept
# beside the new one as <file>.bak-<timestamp> whenever it changes.
set -euo pipefail
cd "$(dirname "$0")/.."

# render <prefix> <target file> <required key>...
render() {
  local prefix="$1" target="$2"; shift 2
  local new name value key
  new="$(mktemp)"
  for name in $(compgen -e | grep "^$prefix" | grep -v '^APP_ENV_KEYS$' | sort); do
    value="${!name}"
    [ -n "$value" ] && printf '%s=%s\n' "${name#"$prefix"}" "$value" >> "$new"
  done

  if [ ! -s "$new" ]; then
    echo "▸ no ${prefix}* settings in the environment — keeping $target as it is"
    rm -f "$new"; return 0
  fi
  # Never swap in a file missing a key the stack cannot start without.
  for key in "$@"; do
    if ! grep -q "^$key=." "$new"; then
      echo "✗ no $prefix$key from GitHub — keeping the existing $target"
      rm -f "$new"; return 1
    fi
  done
  # Postgres keeps the password its volume was created with; a different one
  # here would only lock the backend out. Change it in Postgres (ALTER USER)
  # and in this file by hand first, then in GitHub.
  if [ "$target" = .env.prod ] && [ -f "$target" ] \
    && [ "$(grep '^POSTGRES_PASSWORD=' "$target")" != "$(grep '^POSTGRES_PASSWORD=' "$new")" ]; then
    echo "✗ PROD_POSTGRES_PASSWORD differs from the one the database uses — keeping the existing $target"
    rm -f "$new"; return 1
  fi

  if [ -f "$target" ]; then
    if cmp -s "$new" "$target"; then
      echo "▸ $target unchanged"
      rm -f "$new"; return 0
    fi
    cp -p "$target" "$target.bak-$(date +%Y%m%d%H%M%S)"
    # Keep the five most recent backups.
    ls -1t "$target".bak-* 2>/dev/null | tail -n +6 | xargs -r rm -f
  fi
  install -m 600 "$new" "$target"
  rm -f "$new"
  echo "▸ $target written from GitHub ($(grep -c '=' "$target") keys)"
}

render APP_ deploy/backend.env JWT_SECRET AI_API_KEY CORS_ORIGINS PUBLIC_ORIGIN
render PROD_ .env.prod POSTGRES_PASSWORD SITE_ADDRESS
