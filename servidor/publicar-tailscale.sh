#!/usr/bin/env bash
# Publica el gateway en internet con Tailscale Funnel: dirección https fija (https://<equipo>.<red>.ts.net),
# sin abrir puertos del router. Queda configurado para siempre (sobrevive a reinicios).
#   sudo ./publicar-tailscale.sh
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Ejecútelo con sudo: sudo ./publicar-tailscale.sh"; exit 1; }

if ! command -v tailscale >/dev/null; then
  echo "==> Instalando Tailscale"
  curl -fsSL https://tailscale.com/install.sh | sh
fi
systemctl enable --now tailscaled >/dev/null

if ! tailscale status >/dev/null 2>&1; then
  echo "==> Inicie sesión en Tailscale: abra en su navegador el enlace que aparece abajo"
  tailscale up --hostname logitrack
fi

echo "==> Publicando el gateway (puerto 8002) con Funnel"
echo "    Si aparece un enlace para habilitar Funnel en su red, ábralo, acéptelo y vuelva a ejecutar este script."
tailscale funnel --bg 8002

URL="https://$(tailscale status --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["Self"]["DNSName"].rstrip("."))')"
echo
echo "Dirección pública del gateway: $URL"
echo "Pruebe: $URL/health"
echo "Envíe esa dirección para apuntar la página de Vercel a este servidor."
