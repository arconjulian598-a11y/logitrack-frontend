#!/usr/bin/env bash
# Trae la última versión de los microservicios desde GitHub y los reinicia (los datos se conservan).
#   sudo ./actualizar.sh
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only || true
docker compose build --pull
docker compose up -d
docker image prune -f >/dev/null
docker compose ps --format "table {{.Service}}\t{{.Status}}"
