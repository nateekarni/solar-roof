#!/usr/bin/env bash
set -euo pipefail
: "${PGDATA:?restore destination required}"
: "${RESTORE_TARGET_TIME:?explicit PITR target required}"
: "${RESTORE_BACKUP_ID:?explicit backup ID required; no fallback selection}"
[[ "$PGDATA" == /var/lib/postgresql/data ]] || { echo 'Refusing restore outside managed data volume' >&2; exit 64; }
# Even lost+found or a partial prior restore is refused. Never --delta or delete data.
if [[ -d "$PGDATA" && -n "$(find "$PGDATA" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo 'Refusing nonempty restore destination' >&2; exit 65
fi
[[ "$RESTORE_TARGET_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]] || { echo 'Restore target must be explicit UTC ISO timestamp' >&2; exit 64; }
mkdir -p "$PGDATA"
chown postgres:postgres "$PGDATA"
target="${RESTORE_TARGET_TIME/T/ }"
target="${target%Z}+00"
exec su-exec postgres pgbackrest --stanza=solar --set="$RESTORE_BACKUP_ID" --type=time --target="$target" --target-action=promote --archive-mode=off restore