#!/usr/bin/env bash
# Muestra si todo está arriba: contenedores, gateway local y dirección pública.
cd "$(dirname "$0")"
docker compose ps --format "table {{.Service}}\t{{.Status}}"
echo
printf "Gateway local: "; curl -fsS -m 5 http://127.0.0.1:8002/health || echo "SIN RESPUESTA"
echo
command -v tailscale >/dev/null && tailscale funnel status 2>/dev/null | head -5
