# Kubernetes on Docker Desktop

The manifests are in `k8s/`; commands are in [k8s/README.md](../../k8s/README.md). This chapter explains how it fits together.

## Layout

| Object | Purpose |
|---|---|
| Namespace `watchlist-roulette` | keeps the app apart from `dinner-planner` and `time-tracking` on the same cluster |
| ConfigMap `watchlist-config` | `NODE_ENV`, `DB_SSL`, `CORS_ORIGIN`, `TMDB_LANGUAGE` |
| Secret `watchlist-db` (created by `deploy.sh`) | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL` |
| Secret `watchlist-tmdb` (created by `deploy.sh`) | `TMDB_ACCESS_TOKEN`; optional, the backend starts without it |
| Deployment and PVC `postgres` | PostgreSQL 17 on a 5 Gi volume; one pod at a time (`Recreate`) |
| ConfigMap `postgres-init-scripts` | the migrations, generated from `backend/migrations` |
| Deployments `backend`, `frontend` | the two images, `imagePullPolicy: Never` |
| Services | all `ClusterIP`: nothing is published on a host port |
| Ingress `watchlist-roulette` | `http://watchlist.local`: `/api` and `/health` to the backend, everything else to the frontend |

## Why it looks like this

- **Shared ingress.** Docker Desktop publishes the one nginx ingress controller on `localhost:80`; apps are told apart by host name. This app uses `watchlist.local`, next to `dinner.local` and `time-tracking.local`.
- **Images.** Docker Desktop runs Kubernetes as a kind node with its own image store, so `deploy.sh` builds on the host and imports the images into the node (`ctr images import`). Each build gets a new tag, otherwise Kubernetes sees an unchanged pod spec and keeps the old image.
- **Upload size.** The ingress controller allows 1 MB per request by default. The Ingress sets `proxy-body-size: 6m` for CSV uploads (the backend limit is 5 MB). Only this Ingress is changed; the controller is shared.
- **Writes from other sites.** The backend refuses writes carrying an `Origin` that is not in `CORS_ORIGIN`; the ConfigMap sets it to `http://watchlist.local`. Change it together with the host in `ingress.yaml`.
- **Secrets out of git.** `deploy.sh` generates the database password and passes both Secrets through stdin, so no password or token is in the repo or in a process list.
- **Frontend image.** The same image runs in Compose and in Kubernetes: its nginx forwards `/api` to `BACKEND_URL` (default `http://backend:3000`; Kubernetes sets the full service name) and takes the DNS server from the container's `resolv.conf`. In Kubernetes the Ingress sends `/api` to the backend directly, so this forwarding is only a fallback.
- **Remote database.** Put its connection string into the `watchlist-db` Secret as `DATABASE_URL` and set `DB_SSL` to `"true"` in the ConfigMap if it needs SSL. The `wait-for-db` init container waits for whatever `DATABASE_URL` names. Apply the migrations on it by hand.

## Known limits

- The database volume is lost on a Docker Desktop reset: use the [backups](../../k8s/README.md#backups).
- The ingress controller publishes ports 80 and 443 on all network interfaces, not only localhost, and the API has no login. Other devices on the network can reach the app. This is the same for the other apps on the cluster.
- One replica of everything; no autoscaling or network policies.
