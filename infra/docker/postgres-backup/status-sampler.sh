#!/usr/bin/env bash
set -euo pipefail
child=''
stop() { trap - TERM INT; if [[ -n "$child" ]]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi; exit 0; }
trap stop TERM INT
# Sampling must continue while pgBackRest is doing a long backup or stanza retry.
while true; do
  timeout -k 5 50 su-exec postgres python3 /opt/solar-backup/status.py & child=$!
  if ! wait "$child"; then echo 'Backup status sampling unavailable; retained timestamp will become stale' >&2; fi
  child=''
  sleep 15 & child=$!; wait "$child"; child=''
done
