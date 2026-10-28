#!/usr/bin/env bash
# Crea el PRIMER administrador (la contraseña se escribe aquí y no se guarda en ningún archivo).
#   sudo ./crear-admin.sh correo@ejemplo.com "Nombre Apellido"
set -euo pipefail
cd "$(dirname "$0")"
[ $# -ge 2 ] || { echo 'Uso: sudo ./crear-admin.sh correo@ejemplo.com "Nombre Apellido"'; exit 1; }
docker compose exec shipment python -m app.crear_usuario --email "$1" --nombre "$2" --rol administrador
