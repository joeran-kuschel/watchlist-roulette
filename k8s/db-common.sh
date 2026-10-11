# Shared settings for the database scripts; each can be overridden by an environment variable.
KUBE_CONTEXT="${KUBE_CONTEXT:-docker-desktop}"
NAMESPACE="${NAMESPACE:-watchlist-roulette}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/WatchlistRouletteBackups}"

# Runs a shell command in the postgres pod, which has the credentials from the watchlist-db Secret.
pg_exec() {
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" exec -i deploy/postgres -- sh -c "$1"
}
