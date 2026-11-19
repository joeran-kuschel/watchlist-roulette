#!/usr/bin/env bash
# Builds the images, loads them into Docker Desktop's Kubernetes and applies k8s/.
# Safe to re-run: it is the normal way to push a code change into the cluster.
#
# TMDB token: put TMDB_ACCESS_TOKEN into .env (or the environment) and run this again; it is stored in the
# Secret "watchlist-tmdb". Without a token, films are not enriched.
set -euo pipefail

CLUSTER=docker-desktop
NAMESPACE=watchlist-roulette
HOST=watchlist.local
BACKEND_REPO=watchlist-backend
FRONTEND_REPO=watchlist-frontend

# A fresh tag per build: with an unchanged pod spec Kubernetes sees nothing to roll out
TAG="$(date -u +%Y%m%d%H%M%S)"

cd "$(dirname "$0")/.."

step() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }

# Everything talks to docker-desktop, never to whichever context happens to be current
KUBECTL=(kubectl --context "$CLUSTER")
KUBECTL_NS=("${KUBECTL[@]}" -n "$NAMESPACE")

# shellcheck source=k8s/image-cleanup.sh
source k8s/image-cleanup.sh

step "Checking the cluster"
if ! "${KUBECTL[@]}" get nodes >/dev/null 2>&1; then
  echo "The '$CLUSTER' cluster is not reachable. Start Docker Desktop and turn on" >&2
  echo "Kubernetes in Settings → Kubernetes, then run this again." >&2
  exit 1
fi
# The nginx ingress controller is shared with the other apps on this cluster: only checked here, never installed
if ! "${KUBECTL[@]}" get ingressclass nginx >/dev/null 2>&1; then
  echo "The nginx ingress controller is missing. Install it once with:" >&2
  echo "  helm --kube-context $CLUSTER upgrade --install ingress-nginx ingress-nginx \\" >&2
  echo "    --repo https://kubernetes.github.io/ingress-nginx --namespace ingress-nginx --create-namespace" >&2
  exit 1
fi

# The node that images are imported into, and the tags the app runs now: the ones to roll back to, kept when old images
# are removed (empty on the first deploy).
NODE="$("${KUBECTL[@]}" get nodes -o jsonpath='{.items[0].metadata.name}')"
ROLLBACK_KNOWN=1
PREVIOUS_TAGS=""
for deployment in backend frontend; do
  if previous_image="$("${KUBECTL_NS[@]}" get deployment "$deployment" -o jsonpath='{.spec.template.spec.containers[0].image}' --ignore-not-found 2>/dev/null)"; then
    PREVIOUS_TAGS="$PREVIOUS_TAGS $(printf '%s' "$previous_image" | sed -n 's/.*:\([0-9]\{14\}\)$/\1/p')"
  else
    # Not "there is none" (that answers with nothing) but "could not ask": no image is removed then.
    ROLLBACK_KNOWN=0
  fi
done

step "Checking the secrets"
"${KUBECTL[@]}" apply -f k8s/namespace.yaml >/dev/null

# Created once and then left alone: Postgres only reads its password when it first creates the data directory,
# so a new password in the Secret would lock the backend out of the existing database.
if "${KUBECTL_NS[@]}" get secret watchlist-db >/dev/null 2>&1; then
  echo "The watchlist-db Secret exists and is kept."
else
  password="$(openssl rand -hex 16)"
  printf 'POSTGRES_USER=watchlist\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=watchlist\nDATABASE_URL=postgres://watchlist:%s@postgres:5432/watchlist\n' \
    "$password" "$password" \
    | "${KUBECTL_NS[@]}" create secret generic watchlist-db --from-env-file=/dev/stdin >/dev/null
  echo "Created the watchlist-db Secret with a random password."
fi

token="${TMDB_ACCESS_TOKEN:-}"
if [ -z "$token" ] && [ -f .env ]; then
  token="$(grep -E '^TMDB_ACCESS_TOKEN=' .env | tail -n 1 | cut -d= -f2- | tr -d '"'"'" || true)"
fi
if [ -n "$token" ]; then
  # through stdin, so the token never shows up in the process list
  printf '%s' "$token" \
    | "${KUBECTL_NS[@]}" create secret generic watchlist-tmdb --from-file=TMDB_ACCESS_TOKEN=/dev/stdin \
        --dry-run=client -o yaml \
    | "${KUBECTL_NS[@]}" apply -f - >/dev/null
  echo "Stored the TMDB token in the watchlist-tmdb Secret."
elif ! "${KUBECTL_NS[@]}" get secret watchlist-tmdb >/dev/null 2>&1; then
  echo "No TMDB token found: films will not be enriched. Set TMDB_ACCESS_TOKEN in .env and deploy again."
fi

# Local overrides (e.g. CORS_ORIGIN for another port) live in the gitignored k8s/.env.local. The backend reads
# them through the optional ConfigMap watchlist-local, which wins over watchlist-config.
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-k8s/.env.local}"
if [ -f "$LOCAL_ENV_FILE" ]; then
  "${KUBECTL_NS[@]}" create configmap watchlist-local --from-env-file="$LOCAL_ENV_FILE" --dry-run=client -o yaml \
    | "${KUBECTL_NS[@]}" apply -f - >/dev/null
  echo "Applied local overrides from $LOCAL_ENV_FILE."
else
  "${KUBECTL_NS[@]}" delete configmap watchlist-local --ignore-not-found >/dev/null
fi

step "Checking the free disk space on the node"
# Docker Desktop's disk holds every image of every deploy. Under 2 GB the old images of this project go first;
# if that is not enough the deploy stops here, before it starts a rollout that cannot finish (Postgres cannot start
# on a full disk). The tags kept: the new one, the ones the app runs now, and any a pod uses.
# shellcheck disable=SC2086 # the tags are words
if ! ensure_free_space "$TAG" $PREVIOUS_TAGS; then exit 1; fi

step "Building images ($TAG)"
docker build --tag "$BACKEND_REPO:$TAG" backend
docker build --tag "$FRONTEND_REPO:$TAG" frontend

step "Loading images into the cluster"
# Docker Desktop runs Kubernetes as a kind node with its own image store, so an image built on the host is
# invisible to it until it is imported into the node. The manifests use imagePullPolicy: Never.
for image in "$BACKEND_REPO:$TAG" "$FRONTEND_REPO:$TAG"; do
  docker save "$image" | docker exec -i "$NODE" ctr --namespace k8s.io images import -
done

step "Applying manifests"
# The manifests carry :dev so that `kubectl apply -k k8s` still works; here the fresh tag is put in
"${KUBECTL[@]}" kustomize k8s \
  | sed -e "s|image: ${BACKEND_REPO}:dev|image: ${BACKEND_REPO}:${TAG}|g" \
        -e "s|image: ${FRONTEND_REPO}:dev|image: ${FRONTEND_REPO}:${TAG}|g" \
  | "${KUBECTL[@]}" apply -f -

step "Waiting for the rollout"
"${KUBECTL_NS[@]}" rollout status deployment/postgres --timeout=300s
if ! "${KUBECTL_NS[@]}" rollout status deployment/backend --timeout=300s \
  || ! "${KUBECTL_NS[@]}" rollout status deployment/frontend --timeout=300s; then
  echo
  echo "Rollout failed. Recent events:"
  "${KUBECTL_NS[@]}" get events --sort-by=.lastTimestamp | tail -15
  echo
  echo "Backend log:"
  "${KUBECTL_NS[@]}" logs deployment/backend --tail=40 || true
  exit 1
fi

step "Removing old images"
# Only now, when the new version is running: a failed deploy keeps every image the old pod might need. The new tag and
# the ones before it stay, so there is always one version to go back to.
# shellcheck disable=SC2086
prune_images "$TAG" $PREVIOUS_TAGS

step "Ready"
# Both lines are needed: without the IPv6 one, macOS first asks Bonjour about the .local name, which adds a
# 5-second delay to every request.
for line in "127.0.0.1 ${HOST}" "::1 ${HOST}"; do
  if ! grep -qE "^${line%% *}[[:space:]]+${HOST}([[:space:]]|\$)" /etc/hosts 2>/dev/null; then
    echo "Add this line to /etc/hosts (needs sudo, so this script will not do it):"
    echo
    echo "  echo '${line}' | sudo tee -a /etc/hosts"
    echo
  fi
done

# The ingress controller takes a few seconds to pick up a new Ingress
for _ in $(seq 1 30); do
  if curl -s -o /dev/null --max-time 3 --fail -H "Host: ${HOST}" "http://127.0.0.1/health"; then
    echo "Open http://${HOST}"
    exit 0
  fi
  sleep 1
done

echo "The app is deployed, but http://${HOST} did not answer through the ingress on localhost:80." >&2
echo "Check that nothing else holds port 80: kubectl --context $CLUSTER -n ingress-nginx get svc" >&2
exit 1
