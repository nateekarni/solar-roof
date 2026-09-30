#!/usr/bin/env bash
set -euo pipefail
# Usage: bash scripts/ops/backup-postgres.sh CONTAINER_ID /absolute/backup-directory
# Only pg_dump; does not stop containers, reset data, or copy secrets into logs.
container=${1:?Pass the PostgreSQL container ID}
backup_dir=${2:?Pass an absolute backup directory}
[[ "$container" =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Use an exact container ID, not an expression.' >&2; exit 2; }
[[ "$backup_dir" == /* ]] || { echo 'Backup directory must be absolute.' >&2; exit 2; }
[[ "$(docker inspect --format '{{.State.Running}}' "$container")" == true ]] || exit 1
umask 077
mkdir -p -- "$backup_dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$backup_dir/solar-$stamp-$$.dump"
temporary="$file.partial"
trap 'rm -f -- "$temporary"' EXIT
# Database name and user resolve in the selected DB container; password is never printed.
docker exec "$container" sh -ec 'exec pg_dump --format=custom --no-owner --no-acl --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' > "$temporary"
[[ -s "$temporary" ]]
docker exec -i "$container" pg_restore --list < "$temporary" > /dev/null
mv -- "$temporary" "$file"
sha256sum "$file" > "$file.sha256"
printf 'Verified dump archive: %s\n' "$file"
printf 'Copy the archive and checksum to protected off-host storage; this check does not replace a restore drill.\n'
