#!/usr/bin/env bash
# Deploy EduPlus Connect on kogia-prod-01.
#
#   /opt/kogia/apps/eduplus/src/deploy/deploy.sh
#
# Idempotent. Safe to run again after a failure — it stops before touching
# running replicas if the build or the migration fails.
set -euo pipefail

APP_DIR="/opt/kogia/apps/eduplus"
SRC_DIR="${APP_DIR}/src"
COMPOSE=("docker" "compose" "-f" "${SRC_DIR}/deploy/docker-compose.yml" "--env-file" "${APP_DIR}/.env" "--project-directory" "${SRC_DIR}")

cd "${SRC_DIR}"

echo "==> 1/5  fetching"
git fetch --quiet origin
BEFORE="$(git rev-parse --short HEAD)"
git reset --hard --quiet "origin/$(git rev-parse --abbrev-ref HEAD)"
AFTER="$(git rev-parse --short HEAD)"
echo "        ${BEFORE} -> ${AFTER}"

echo "==> 2/5  building image"
# Built here rather than pulled: one host, one operator, no registry to
# authenticate against. When the second VPS arrives this becomes a push to
# GHCR so both hosts run a byte-identical image.
"${COMPOSE[@]}" build --quiet app1

echo "==> 3/5  applying migrations"
# Deliberately before the new replicas start and while the old ones still
# serve: a failed migration leaves the previous version running and healthy,
# rather than a half-migrated database behind a new binary.
"${COMPOSE[@]}" run --rm --no-deps migrate

echo "==> 4/5  rolling replicas"
# One at a time. Traefik's health check pulls each container out of rotation
# before it stops and puts it back only once /api/health answers, so the site
# stays up through the deploy.
for svc in app1 app2 app3 app4; do
  printf '        %s ... ' "$svc"
  "${COMPOSE[@]}" up -d --no-deps --force-recreate "$svc" >/dev/null 2>&1
  for _ in $(seq 1 30); do
    if [ "$(docker inspect -f '{{.State.Health.Status}}' "eduplus-${svc#app}" 2>/dev/null || \
            docker inspect -f '{{.State.Health.Status}}' "eduplus-${svc}" 2>/dev/null)" = "healthy" ]; then
      echo "healthy"; break
    fi
    sleep 3
  done
done

echo "==> 5/5  verifying"
sleep 3
HOSTNAME_FQDN="$(grep -E '^APP_HOSTNAME=' "${APP_DIR}/.env" | cut -d= -f2)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' "https://${HOSTNAME_FQDN}/api/health" || echo 000)"
echo "        https://${HOSTNAME_FQDN}/api/health -> ${CODE}"
[ "$CODE" = "200" ] || { echo "!! health check did not return 200"; exit 1; }
echo "==> deployed ${AFTER}"
