#!/bin/sh
# Container entrypoint for the ZAUQ backend image.
#
# When started as root (the image default) make sure the two volume mount
# points belong to the unprivileged `node` user, then drop to that user for
# whatever the container was asked to run: the API, a one-off
# `prisma migrate deploy` from deploy.sh, or a shell.
#
# Why: the volumes on the production box were created by the earlier
# root-run image, so their contents are root-owned, and Docker only copies
# ownership from the image path when a named volume is first created. A
# volume that is already owned by node is left alone — the check is two
# stat calls per boot, the chown -R runs once per volume, ever.
set -eu

if [ "$(id -u)" = "0" ]; then
  uid="$(id -u node)"
  for dir in /app/uploads /app/models; do
    mkdir -p "$dir"
    if [ "$(stat -c %u "$dir")" != "$uid" ]; then
      echo "entrypoint: taking ownership of $dir for node (one-time)" >&2
      chown -R node:node "$dir"
    fi
  done
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
