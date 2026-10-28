# Servidor propio de LogiTrack (VirtualBox)

Todo el backend (10 microservicios + PostgreSQL + RabbitMQ) en una máquina virtual con Ubuntu Server, publicado en internet con **Tailscale Funnel** (dirección `https://…ts.net` fija, sin abrir puertos). La página sigue en Vercel y apunta a esa dirección.

**Encender el computador → Windows enciende la VM sin ventana → Docker arranca los 12 contenedores → Tailscale publica el gateway.** No hay que hacer nada más.

## Requisitos

- Windows con VirtualBox 7 y 16 GB de RAM. La VM usa 8 GB, 4 núcleos y 40 GB de disco.
- El computador conectado a internet y sin suspenderse. El script de Windows ofrece desactivar la suspensión.
- Una cuenta gratis de [Tailscale](https://tailscale.com), con Google, GitHub o Microsoft.

## 1. Crear la máquina virtual (una vez)

1. Descargue **Ubuntu Server 24.04 LTS** (ISO) de ubuntu.com/download/server.
2. En VirtualBox, cree una VM nueva con estos datos:
   - Nombre exactamente **`LogiTrack-Servidor`**.
   - Tipo Linux, Ubuntu (64-bit), con la ISO descargada.
   - 8192 MB de RAM, 4 CPU y disco de 40 GB.
   - Red en **NAT**, que viene por defecto y no necesita nada más.
3. Instale Ubuntu con las opciones por defecto. Elija un usuario y una contraseña, y marque **Install OpenSSH server**.

## 2. Instalar LogiTrack dentro de la VM

Entre a la VM con su usuario y ejecute:

```bash
git clone https://github.com/arconjulian598-a11y/logitrack-frontend.git
cd logitrack-frontend/servidor
sudo ./instalar.sh                 # Docker + claves + 12 contenedores (la primera vez 10-20 min)
sudo ./publicar-tailscale.sh       # inicie sesión en Tailscale con el enlace que aparece
sudo ./crear-admin.sh su@correo.com "Su Nombre"   # primer administrador (pide la contraseña)
```

Al terminar, `publicar-tailscale.sh` muestra la dirección pública, por ejemplo `https://logitrack.tail1234.ts.net`. **Envíela** para apuntar la página de Vercel a este servidor. Ese cambio es una línea en `vercel.json` y un push.

La primera vez, Tailscale puede pedir que habilite **Funnel** en su red. Abra el enlace que aparece, acéptelo y vuelva a ejecutar `sudo ./publicar-tailscale.sh`.

`instalar.sh` imprime el **código de registro** que deben usar operadores y gestores para registrarse. Queda guardado en `servidor/.env`, igual que las demás claves. Ese archivo no se sube a GitHub.

## 3. Arranque automático en Windows (una vez)

Copie la carpeta `servidor/windows` al computador servidor y ejecute **`InstalarArranqueAutomatico.cmd`**.

- Crea la tarea «LogiTrack - encender servidor», que enciende la VM sin ventana un minuto después de arrancar Windows, aunque nadie inicie sesión.
- Pide la contraseña de su usuario de Windows. Esa contraseña la guarda Windows, no LogiTrack.
- Ofrece desactivar la suspensión del computador.

Para apagar en orden, use `ApagarServidor.cmd`. Para encender a mano, use `EncenderServidor.cmd`.

## Uso diario (dentro de la VM, en la carpeta `servidor`)

| Para | Comando |
|---|---|
| Ver si todo está arriba | `./estado.sh` |
| Ver registros de un servicio | `sudo docker compose logs -f shipment` |
| Traer la última versión del backend (los datos se conservan) | `sudo ./actualizar.sh` |
| Copia de seguridad de las bases | `sudo ./respaldo.sh` (queda en `respaldos/`) |
| Reiniciar todo | `sudo docker compose restart` |

## Qué hay adentro

- `docker-compose.yml`: construye cada microservicio desde su repositorio de **LogiTrackSystem**, en la rama `feature/automatizacion-envios`. Los conecta entre sí con la clave interna y les da a todos `restart: unless-stopped`.
- Un solo PostgreSQL con una base por servicio (`postgres/crear-bases.sql`) y RabbitMQ con usuario propio. Los datos viven en volúmenes de Docker y sobreviven a reinicios y actualizaciones.
- El gateway queda solo en `127.0.0.1:8002` dentro de la VM. Tailscale Funnel lo publica por https, y ningún otro servicio queda expuesto. Si llaman a un microservicio directo sin la clave interna, responde 403.
- Las ubicaciones de Colombia y Sudamérica se cargan solas al arrancar Routing. OSRM se usa en línea (`router.project-osrm.org`).
