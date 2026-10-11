# Kubernetes (Docker Desktop)

Runs the app in Docker Desktop's Kubernetes (context `docker-desktop`), next to the other apps on the cluster. It has its own namespace `watchlist-roulette` and is served at **http://watchlist.local** through the nginx ingress controller that all apps share. This folder never installs or changes the controller.

Details and background: [documentation/backend/kubernetes.md](../documentation/backend/kubernetes.md).

## One-time setup

1. Turn on Kubernetes in Docker Desktop (Settings, Kubernetes). The nginx ingress controller must already be installed; `deploy.sh` checks for it and prints the Helm command if it is missing.
2. Add the host name to `/etc/hosts` (both lines; without the IPv6 one every request waits about 5 seconds):

```bash
echo '127.0.0.1 watchlist.local' | sudo tee -a /etc/hosts
echo '::1 watchlist.local' | sudo tee -a /etc/hosts
```

3. Optional, for TMDB data: put `TMDB_ACCESS_TOKEN=...` into `.env` (see `.env.example`).

## Deploy and update

```bash
./k8s/deploy.sh
```

Builds both images with a fresh tag, loads them into the cluster's node, applies the manifests and waits until everything runs. Run it again after every code change. It creates two Secrets the first time and keeps them afterwards:

- `watchlist-db`: the database login, with a random password (never in git, never changed by a later deploy: Postgres only reads its password when the volume is created).
- `watchlist-tmdb`: the TMDB token, updated whenever `TMDB_ACCESS_TOKEN` is set.

## Look at it

```bash
kubectl --context docker-desktop -n watchlist-roulette get pods
kubectl --context docker-desktop -n watchlist-roulette logs deploy/backend
```

## Database changes

After adding or changing a file in `backend/migrations/`, run `./k8s/generate-init-scripts.sh` and commit `postgres-init-scripts.yaml` (a test fails if it is out of date). Postgres runs these scripts **only on the first start with an empty volume**: an existing database needs the SQL applied by hand, for example

```bash
kubectl --context docker-desktop -n watchlist-roulette exec -i deploy/postgres -- \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < backend/migrations/003_example.sql
```

## Backups

The database volume lives inside the Docker Desktop node. A Docker Desktop update or reset, or deleting the namespace, **deletes it**.

```bash
./k8s/backup-db.sh                      # dump to ~/WatchlistRouletteBackups (newest 168 are kept)
./k8s/install-backup-job.sh             # hourly launchd job that runs it (--uninstall removes it)
./k8s/restore-db.sh <backup.sql.gz>     # replaces all data; stops the backend meanwhile
```

`BACKUP_DIR`, `BACKUP_KEEP`, `KUBE_CONTEXT` and `NAMESPACE` override the defaults.

## Remove it

```bash
kubectl --context docker-desktop delete namespace watchlist-roulette   # also deletes the database volume
```

Take a backup first.
