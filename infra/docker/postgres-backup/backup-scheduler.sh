#!/usr/bin/env bash
set -euo pipefail
child=''
stop() { trap - TERM INT; if [[ -n "$child" ]]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi; exit 0; }
trap stop TERM INT
run() { "$@" & child=$!; local code=0; wait "$child" || code=$?; child=''; return "$code"; }
until pg_isready -h 127.0.0.1 -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-postgres}" >/dev/null 2>&1; do run sleep 2; done
until run su-exec postgres pgbackrest --stanza=solar stanza-create; do
  echo 'Repository unavailable; database retains pending WAL; retry stanza initialization in 60 seconds' >&2
  run sleep 60
done
# Failures remain visible and retry; automatic expiration and WAL discard are never enabled.
while true; do
  day="$(date -u +%F)"
  if [[ "$(cat /var/lib/solar-backup/last-day 2>/dev/null || true)" != "$day" ]]; then
    type=diff
    if [[ ! -f /var/lib/solar-backup/last-full ]] || (( $(date -u +%s) - $(cat /var/lib/solar-backup/last-full) >= 604800 )); then type=full; fi
    if run su-exec postgres pgbackrest --stanza=solar --type="$type" backup; then
      date -u +%F > /var/lib/solar-backup/last-day
      if [[ "$type" == full ]]; then date -u +%s > /var/lib/solar-backup/last-full; fi
    else
      echo 'Backup failed; retaining all existing backups and WAL; retry in 60 seconds' >&2
    fi
  fi
  run sleep 60
done