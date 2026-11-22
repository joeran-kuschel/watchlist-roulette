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
| Secret `watchlist-tls` (created by `deploy.sh`) | the mkcert certificate and key for `watchlist.local`; named by the Ingress |
| Ingress `watchlist-roulette` | `https://watchlist.local:8443` (and `http://watchlist.local`): everything goes to the frontend, whose nginx forwards `/api` and `/health` to the backend |
| NetworkPolicy `backend-from-frontend` | the backend accepts connections only from the frontend pods, on port 3000 |
| NetworkPolicy `postgres-from-backend` | the database pod accepts connections only from the backend pods, on port 5432 |

## Why it looks like this

- **Shared ingress.** Docker Desktop publishes the one nginx ingress controller on `localhost:80` (HTTP) and `localhost:8443` (HTTPS); apps are told apart by host name. This app uses `watchlist.local`, next to `dinner.local` and `time-tracking.local`.
- **Images.** Docker Desktop runs Kubernetes as a kind node with its own image store, so `deploy.sh` builds on the host and imports the images into the node (`ctr images import`). Each build gets a new tag, otherwise Kubernetes sees an unchanged pod spec and keeps the old image.
- **Upload size.** The ingress controller allows 1 MB per request by default. The Ingress sets `proxy-body-size: 6m` for CSV uploads (the backend limit is 5 MB). Only this Ingress is changed; the controller is shared.
- **Only the frontend reaches the backend.** The API has no login, so the backend has no Ingress route, and the NetworkPolicy `backend-from-frontend` (`k8s/network-policy.yaml`) refuses connections from every pod except the frontend's, including pods in other namespaces. The same file holds `postgres-from-backend`, which lets only the backend pods open connections to the database. The kubelet's health probes still work (checked on this cluster; how probes are treated is also up to the network plugin). Docker Desktop's network plugin (kindnet) enforces policies; on a cluster whose plugin does not, the policy is silently ignored, so check that before relying on it. The Ingress keeps the `proxy-body-size` annotation because it still sits in front of the frontend's nginx.
- **Writes from other sites.** The backend refuses writes carrying an `Origin` that is not in `CORS_ORIGIN`; the ConfigMap sets it to `http://watchlist.local`. Change it together with the host in `ingress.yaml`. The HTTPS address is an origin of its own (`https://watchlist.local:8443`, with the port), and it is a local setting, not part of the shared ConfigMap: put `CORS_ORIGIN=http://watchlist.local,https://watchlist.local:8443` into `k8s/.env.local` (see Local overrides). Without it the page opens over HTTPS, but saving anything is refused with "This origin is not allowed to change data"; `deploy.sh` reminds you when the file does not name the address.
- **HTTPS.** The Ingress has a `tls` section for `watchlist.local` that names the Secret `watchlist-tls`. The certificate comes from [mkcert](https://github.com/FiloSottile/mkcert), whose local authority you install once with `mkcert -install` (a certificate from it opens in the browser without a warning, on this machine only). `deploy.sh` makes the Secret the first time, through `k8s/tls-secret.sh`, and keeps it afterwards (it needs mkcert only then): the key lives in a temporary directory that is removed again, goes to `kubectl create` through a pipe and never appears in a command line, a log or a file in the repo. Without mkcert, or without its authority, the deploy stops before it builds anything and prints the commands; it never installs or trusts anything itself. To renew the certificate (mkcert's last about two years and three months), delete the Secret and deploy again: `kubectl --context docker-desktop -n watchlist-roulette delete secret watchlist-tls`. TLS ends at the ingress controller; the traffic inside the cluster stays plain HTTP, as before.
- **No redirect to HTTPS.** With a `tls` section the controller would send `http://watchlist.local` to `https://watchlist.local`, which is port 443. Docker Desktop publishes HTTPS on 8443 here, so that would lead nowhere. The Ingress sets `ssl-redirect: "false"` (this Ingress only), and both addresses work. `deploy.sh` probes the HTTPS address with mkcert's own authority. If only the plain HTTP address answers (for example a `curl` that does not read the macOS keychain, where `mkcert -install` put the authority), the deploy still succeeds, with a warning.
- **Secrets out of git.** `deploy.sh` generates the database password and passes both Secrets (and the certificate, see HTTPS) through stdin, so no password or token is in the repo or in a process list.
- **Frontend image.** The same image runs in Compose and in Kubernetes: its nginx forwards `/api` to `BACKEND_URL` (default `http://backend:3000`; Kubernetes sets the full service name) and takes the DNS server from the container's `resolv.conf`. In Kubernetes the Ingress sends everything to the frontend, so this nginx is the only way to the backend.
- **Local overrides.** A setting that differs on your machine (for example `CORS_ORIGIN` for another port) goes into `k8s/.env.local`, one `NAME=value` per line. The file is git-ignored (`*.local`). `deploy.sh` turns it into the ConfigMap `watchlist-local` (the path can be changed with `LOCAL_ENV_FILE`), which the backend reads after `watchlist-config` (`envFrom`, `optional: true`), so it wins. Without the file, `deploy.sh` removes an old `watchlist-local`, so a deleted override stops applying with the next deploy. Do not put secrets in it: a ConfigMap is not secret.
- **Remote database.** Put its connection string into the `watchlist-db` Secret as `DATABASE_URL` and set `DB_SSL` to `"true"` in the ConfigMap if it needs SSL. The `wait-for-db` init container waits for whatever `DATABASE_URL` names. Apply the migrations on it by hand.

## Old images and the node's disk

Every deploy builds two images (`watchlist-backend:<timestamp>`, `watchlist-frontend:<timestamp>`) and imports them into the node of Docker Desktop's Kubernetes. The node's disk is the disk of Docker Desktop's whole VM, shared with `dinner-planner` and `time-tracking`. Nothing used to remove the older images, and on 2 November 2026 the VM was 93% full: about 27 GB of unused images in the node's containerd, 114 of them untagged copies of old builds ([#75](https://github.com/joeran-kuschel/watchlist-roulette/issues/75)). `k8s/image-cleanup.sh`, sourced by `deploy.sh`, prevents that. Code: `backend/tests/k8s-deploy.test.ts` runs it against a fake `kubectl` and `docker`.

**What is removed.** After the rollout succeeded, every image that is `watchlist-backend` or `watchlist-frontend` (with or without the `docker.io/library/` prefix) **and** has a 14-digit timestamp tag **and** is not kept goes, from the node (`ctr --namespace k8s.io images rm --sync`) and from the host (`docker image rm`). Never touched: other apps' images on the shared node, `postgres`, an image without a timestamp tag (`:dev`).

**What is kept.** The tag just deployed, the tags the two Deployments named before this deploy (so there is always one version to go back to; empty on the first deploy) and every tag a pod in the namespace uses right now. If the deploy before this one failed its rollout, the tag the Deployments name is that failed one, and the last version that really ran is kept only while a pod still uses it.

**Leftovers from before.** The cleanup only removes what its own run frees. The untagged copies that piled up before it existed (the 114 of 2 November 2026) stay until the one-off `crictl rmi --prune` below has been run once.

**The second reference.** Importing an image makes a second reference next to its tag, named `sha256:…`, with the same digest. Removing only the tag leaves it holding every layer, which is how the untagged copies piled up. So the cleanup also removes each `sha256:…` reference whose digest belonged to a removed tag and that no remaining tag shares.

**Fails closed.** The pods and the Deployments' images are read before anything is removed. If either cannot be read, nothing is removed and a warning says so: images are never pulled again (`imagePullPolicy: Never`), so a wrong guess would be an outage. A failure to remove one image only prints a warning, so the removal after a rollout never fails a deploy (only the free-space check below can stop one, before the build), and a failed rollout removes nothing.

**Free space.** Before building, `deploy.sh` reads the node's free space (`docker exec <node> df -Pk /`) and wants 2 GiB (`MIN_FREE_KB`; one build and its two imports take about 0.5 GiB). With less, it removes the old images first, by the same rules, and measures again; if that is not enough it stops before building with "Not enough disk space on the node … Nothing was deployed." and the commands to look further. If the space cannot be read, the deploy goes on.

**When the disk is full anyway.** This project's old images are not the only thing in the VM:

```bash
docker system df            # images, volumes and build cache
docker builder prune        # the build cache, which any project can rebuild
docker volume ls            # volumes nothing uses
```

Look before you delete a volume: a volume can hold a database. Do not use Docker Desktop's "Clean / Purge data": it deletes the database volumes of every app. To remove the unused images of all apps on the node at once, `docker exec desktop-control-plane crictl rmi --prune` works, but it prints many `DeadlineExceeded` errors when it removes about a hundred large images at the same time. The deletions still complete in the background; check with `docker exec desktop-control-plane df -h /` after a minute. That command also removes other apps' unused images (they have to be rebuilt by their next deploy).

## Restoring a backup

`k8s/restore-db.sh <backup.sql.gz>` replaces all data with a dump from `backup-db.sh` (it asks you to type `restore`; `--yes` skips that). It stops the backend meanwhile and starts it again afterwards, also when the restore fails.

- **Before it touches anything** it checks that the file is a whole backup: a valid gzip archive whose last lines hold the line `pg_dump` writes last. A damaged or cut-off file is refused.
- **The dump goes through `kubectl exec -i`, which can cut the stream off partway** (seen after the Docker Desktop upgrade of 20 November 2026; the first restore then reported success and left the database empty, [#102](https://github.com/joeran-kuschel/watchlist-roulette/issues/102)). With `psql --single-transaction`, a cut that falls on a statement boundary is committed as if it were the whole dump. So the script sends `BEGIN;`, the dump, `COMMIT;` and then `SELECT 'restore-complete';` by itself, and only reports success when `restore-complete` is the last thing psql answers. A stream that is cut anywhere before `COMMIT` is rolled back when the connection ends (this relies on the connection ending `psql`'s input, which is what a cut `kubectl exec` does), so the database is unchanged; an error in the dump stops it too (`ON_ERROR_STOP`).
- **A cut between `COMMIT` and the marker** has committed everything and still reports a failure. That is harmless: run it again, a restore replaces all data every time.
- **What came back** is printed after a successful restore (rows in `films`, `film_credits`, `genres` and `people`), so a restore that brought in nothing is visible.
- Tests: `backend/tests/k8s-scripts.test.ts` (a fake `kubectl` that cuts the stream at several places).

## Known limits

- The database volume is lost on a Docker Desktop reset: use the [backups](../../k8s/README.md#backups).
- The ingress controller publishes ports 80 and 443 on all network interfaces, not only localhost, and the app has no login. Other devices on the network can reach the app, and with it the API through the frontend's `/api`; the network policy does not change that. Only a login would. This is the same for the other apps on the cluster.
- Programs on the Mac can reach the app the same way. The policy only keeps other pods from calling the backend (and its port) directly.
- The database accepts connections only from the backend pods (`postgres-from-backend`). The backups, the restore and `kubectl exec` are not network connections between pods, so they keep working; to run `psql` by hand use `kubectl -n watchlist-roulette exec -it deploy/postgres -- sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`. A pod you start yourself, in this or another namespace, is refused (on a network plugin that enforces policies, as Docker Desktop's does). This is a network boundary, not access control: anyone who can create pods in the namespace can give one the label `app: backend` and get in.
- One replica of everything; no autoscaling.
