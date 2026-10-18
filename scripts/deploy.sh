#!/usr/bin/env bash
# Deploy de produção no glpi-srv, como github-deploy (docs/INFRA.md §7).
# O comando forçado da chave do Actions já faz o git pull antes; o daqui cobre o deploy manual.
set -euo pipefail
cd /home/glpissh/docker/itc-tasks

git pull --ff-only origin main
docker compose up -d --build

for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3021/api/health > /dev/null; then
    echo "ITC Tasks no ar: $(git rev-parse --short HEAD)"
    docker image prune -f > /dev/null
    exit 0
  fi
  sleep 5
done

echo "Health check falhou após 150 s" >&2
docker compose logs --tail 50 itc-tasks itc-tasks-worker >&2
exit 1
