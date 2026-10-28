#!/usr/bin/env bash
# Instala LogiTrack completo en Ubuntu Server (24.04) y lo deja arrancando solo al encender.
#   sudo ./instalar.sh
set -euo pipefail
cd "$(dirname "$0")"
[ "$(id -u)" -eq 0 ] || { echo "Ejecútelo con sudo: sudo ./instalar.sh"; exit 1; }

echo "==> 1/4 Instalando Docker, Git y utilidades"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker.io docker-compose-v2 docker-buildx git curl openssl >/dev/null
systemctl enable --now docker >/dev/null
# El usuario que ejecutó sudo puede usar docker sin sudo (desde el próximo inicio de sesión)
[ -n "${SUDO_USER:-}" ] && usermod -aG docker "$SUDO_USER" || true

echo "==> 2/4 Claves (.env)"
if [ ! -f .env ]; then
  cp .env.ejemplo .env
  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^RABBITMQ_PASSWORD=.*|RABBITMQ_PASSWORD=$(openssl rand -hex 24)|" .env
  sed -i "s|^JWT_SECRET=.*|JWT_SECRET=$(openssl rand -hex 32)|" .env
  sed -i "s|^INTERNAL_API_KEY=.*|INTERNAL_API_KEY=$(openssl rand -hex 32)|" .env
  sed -i "s|^CODIGO_REGISTRO_PERSONAL=.*|CODIGO_REGISTRO_PERSONAL=LT-$(openssl rand -hex 4 | tr a-f A-F)|" .env
  chmod 600 .env
  echo "    .env creado con claves nuevas (no lo comparta ni lo suba a GitHub)."
else
  echo "    .env ya existía: se conserva."
fi

echo "==> 3/4 Construyendo y arrancando los 12 contenedores (la primera vez tarda 10-20 min)"
docker compose up -d --build

echo "==> 4/4 Esperando a que el gateway responda"
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:8002/health >/dev/null 2>&1; then
    echo "    Gateway listo: http://127.0.0.1:8002"
    docker compose ps --format "table {{.Service}}\t{{.Status}}"
    echo
    echo "Código de registro para operadores y gestores: $(grep ^CODIGO_REGISTRO_PERSONAL= .env | cut -d= -f2)"
    echo "Siguiente paso: sudo ./publicar-tailscale.sh   (dirección pública)"
    echo "                sudo ./crear-admin.sh          (primer administrador)"
    exit 0
  fi
  sleep 5
done
echo "El gateway no respondió a tiempo. Revise: sudo docker compose logs --tail 50"
exit 1
