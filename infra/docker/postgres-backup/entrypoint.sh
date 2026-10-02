#!/usr/bin/env bash
set -euo pipefail
mode="${1:-postgres}"
export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
if [[ "$mode" == health ]]; then
  pg_isready -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}"
  if [[ "${BACKUP_ENABLED:-false}" == true && -z "${RESTORE_TARGET_TIME:-}" ]]; then
    python3 -c 'import json,time; s=json.load(open("/var/lib/solar-backup/status.json")); assert time.time()-s["schedulerHeartbeatAt"]<180'
  fi
  exit
fi
if [[ "${BACKUP_ENABLED:-false}" != true && -z "${RESTORE_TARGET_TIME:-}" ]]; then
  exec /usr/local/bin/docker-entrypoint.sh "$@"
fi
: "${PGBACKREST_REPO1_S3_BUCKET:?backup bucket required}"
: "${PGBACKREST_REPO1_S3_ENDPOINT:?backup endpoint required}"
: "${PGBACKREST_REPO1_S3_REGION:?backup region required}"
: "${PGBACKREST_REPO1_S3_KEY:?dedicated backup access key required}"
: "${PGBACKREST_REPO1_S3_KEY_SECRET:?dedicated backup secret required}"
: "${PGBACKREST_REPO1_CIPHER_PASS:?separately escrowed backup encryption key required}"
[[ -z "${PGBACKREST_ARCHIVE_PUSH_QUEUE_MAX:-}" ]] || { echo 'WAL discard queue limit is forbidden' >&2; exit 64; }
export PGBACKREST_EXPIRE_AUTO=n PGBACKREST_ARCHIVE_ASYNC=n
export PGBACKREST_REPO1_TYPE=s3 PGBACKREST_REPO1_CIPHER_TYPE=aes-256-cbc
export PGBACKREST_REPO1_PATH="${PGBACKREST_REPO1_PATH:-/solar}"
export PGBACKREST_REPO1_S3_URI_STYLE="${PGBACKREST_REPO1_S3_URI_STYLE:-path}"
export PGBACKREST_STANZA=solar
mkdir -p /etc/pgbackrest /var/lib/solar-backup /var/log/pgbackrest
umask 077
cat > /etc/pgbackrest/pgbackrest.conf <<EOF
[global]
repo1-type=s3
repo1-cipher-type=aes-256-cbc
repo1-path=$PGBACKREST_REPO1_PATH
repo1-s3-uri-style=$PGBACKREST_REPO1_S3_URI_STYLE
expire-auto=n
archive-async=n
process-max=1
log-level-console=info
log-level-file=off
start-fast=y
[solar]
pg1-path=$PGDATA
pg1-user=${POSTGRES_USER:-postgres}
pg1-database=${POSTGRES_DB:-postgres}
EOF
chown -R postgres:postgres /etc/pgbackrest /var/lib/solar-backup /var/log/pgbackrest
if [[ -n "${RESTORE_TARGET_TIME:-}" ]]; then
  /opt/solar-backup/restore.sh
  exec /usr/local/bin/docker-entrypoint.sh postgres -c archive_mode=off
fi
/usr/local/bin/docker-entrypoint.sh postgres -c archive_mode=on -c archive_timeout=300s -c "archive_command=pgbackrest --stanza=solar archive-push %p" &
pg_pid=$!
/opt/solar-backup/backup-scheduler.sh &
scheduler_pid=$!
/opt/solar-backup/status-sampler.sh &
sampler_pid=$!
shutdown() { trap - TERM INT; kill -TERM "$sampler_pid" "$scheduler_pid" "$pg_pid" 2>/dev/null || true; wait "$sampler_pid" "$scheduler_pid" "$pg_pid" 2>/dev/null || true; }
trap shutdown TERM INT EXIT
# Any unexpected child exit is failure; do not leave an unmanaged database alive.
set +e
wait -n "$pg_pid" "$scheduler_pid" "$sampler_pid"
code=$?
exit "$((code == 0 ? 1 : code))"