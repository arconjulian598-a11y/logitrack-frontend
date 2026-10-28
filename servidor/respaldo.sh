#!/usr/bin/env bash
# Copia de seguridad de todas las bases en respaldos/ (guarda las últimas 14).
#   sudo ./respaldo.sh        (o programarlo con cron: 0 3 * * * /ruta/servidor/respaldo.sh)
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p respaldos
f="respaldos/logitrack_$(date +%Y%m%d_%H%M).sql.gz"
docker compose exec -T postgres pg_dumpall -U logitrack | gzip > "$f"
ls -1t respaldos/*.sql.gz | tail -n +15 | xargs -r rm -f
echo "Respaldo: $f"
