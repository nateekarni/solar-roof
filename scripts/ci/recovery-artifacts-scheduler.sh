#!/usr/bin/env bash
set -euo pipefail
# Run as its own Coolify resource from the same immutable API image. Off by default.
[[ "${DR_ARTIFACT_BACKUP_ENABLED:-false}" == true ]] || { echo 'Artifact backup scheduler disabled'; exit 0; }
interval="${DR_ARTIFACT_BACKUP_INTERVAL_SECONDS:-300}"
timeout_seconds="${DR_ARTIFACT_BACKUP_TIMEOUT_SECONDS:-300}"
[[ "$interval" =~ ^[0-9]+$ && "$timeout_seconds" =~ ^[0-9]+$ ]] && (( interval>=60 && interval<=900 && timeout_seconds>=1 && timeout_seconds<=900 )) || { echo 'Invalid artifact backup interval/timeout' >&2; exit 64; }
cd "$(dirname "$0")/../.."
child=''
stop() { trap - TERM INT; if [[ -n "$child" ]]; then kill -TERM "$child" 2>/dev/null || true; wait "$child" 2>/dev/null || true; fi; exit 0; }
trap stop TERM INT
while true; do
  started=$SECONDS
  timeout -k 5 "$timeout_seconds" node scripts/ci/recovery-artifacts.mjs backup & child=$!
  if ! wait "$child"; then echo 'Artifact backup failed; checkpoint not accepted. Recovery coverage remains unverified.' >&2; fi
  child=''
  delay=$((interval-(SECONDS-started))); ((delay>0)) || delay=1
  sleep "$delay" & child=$!; wait "$child"; child=''
done
