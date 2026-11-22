#!/bin/bash
# Restores a dump from backup-db.sh into the in-cluster database. This replaces all current data.
# The backend is stopped while it runs, so nothing writes during the restore.
# Usage: k8s/restore-db.sh <backup.sql.gz> [--yes]
#
# The dump goes through `kubectl exec -i`, which can cut the stream off partway (seen after a Docker Desktop upgrade).
# With `--single-transaction`, psql commits whatever arrived when the cut falls on a statement boundary, and the old
# script then reported "Restored" with part of the data, or none. So the dump is wrapped in BEGIN and COMMIT by hand,
# followed by a marker: a stream that is cut anywhere has no COMMIT, so nothing is committed, and without the marker
# in psql's answer the script says the restore failed. (A cut after COMMIT but before the marker has committed everything
# and still reports a failure: harmless, since a restore can be run again.)
set -euo pipefail
source "$(dirname "$0")/db-common.sh"

file="${1:-}"
if [ ! -f "$file" ]; then
  echo "Usage: $0 <backup.sql.gz> [--yes]" >&2
  exit 1
fi

# Nothing is touched before the file is known to be whole: a valid archive whose last lines hold the line pg_dump writes last
# (`tail` reads it all: `grep -q` alone stops at the first match and would make gzip fail with SIGPIPE under pipefail)
if ! gzip -t "$file" 2>/dev/null || ! gzip -dc "$file" | tail -n 5 | grep -q 'PostgreSQL database dump complete'; then
  echo "$file is not a complete backup (damaged archive, or the dump has no end marker). Nothing was changed." >&2
  exit 1
fi

if [ "${2:-}" != "--yes" ]; then
  read -r -p "This replaces all data in $NAMESPACE with $file. Type 'restore' to continue: " answer || answer=""
  if [ "$answer" != "restore" ]; then
    echo "Aborted" >&2
    exit 1
  fi
fi

kubectl_ns() { kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" "$@"; }
kubectl_ns scale deployment/backend --replicas=0 >/dev/null
trap 'kubectl_ns scale deployment/backend --replicas=1 >/dev/null' EXIT

MARKER=restore-complete
# `|| exit 1` inside the group: if gzip fails midway, the group ends before COMMIT and the marker
if ! answer="$({ echo 'BEGIN;'; gzip -dc "$file" || exit 1; echo 'COMMIT;'; echo "SELECT '$MARKER';"; } \
  | pg_exec 'psql -v ON_ERROR_STOP=1 -q -tA -U "$POSTGRES_USER" -d "$POSTGRES_DB"')" \
  || [ "$(printf '%s\n' "$answer" | tail -n 1)" != "$MARKER" ]; then
  echo "The restore failed or the stream was cut off before the end. A cut before the end is rolled back, so the database" >&2
  echo "was not changed; only if the cut came after the last statement can the restore have gone through anyway." >&2
  echo "Run it again (it replaces all data every time). See documentation/backend/kubernetes.md (Restoring a backup)." >&2
  exit 1
fi

echo "Restored $file"
# What came back, so a restore that brought in nothing is visible
COUNTS_SQL="SELECT 'films', count(*) FROM films UNION ALL SELECT 'film_credits', count(*) FROM film_credits UNION ALL SELECT 'genres', count(*) FROM genres UNION ALL SELECT 'people', count(*) FROM people"
kubectl_ns exec deploy/postgres -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -F " " -c "$1"' sh "$COUNTS_SQL" \
  | sed 's/^/  /' || echo "(the row counts could not be read)"
