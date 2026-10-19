# LogiTrack · Frontend

Aplicación web de operación de LogiTrack: mapa en vivo de la flota, envíos de punta a punta, rutas y asignaciones, telemetría, mantenimiento, aduanas, notificaciones, facturación y analítica. Habla **solo con el API Gateway** (`/api/v1`) y usa las **83 rutas públicas** que el Gateway expone.

- Matriz de cobertura por microservicio y por endpoint: [`COBERTURA.md`](./COBERTURA.md)
- Contrato de referencia: `../Claude outputs/CONTRATO_API.md` (idéntico a `../api-gateway/docs/CONTRATO_API.md`)
- Convive con el panel anterior `../web-frontend/` (JavaScript sin compilación, puerto 8080), que no se modificó. Ver [COBERTURA.md §5](./COBERTURA.md#5-relación-con-el-frontend-existente-web-frontend).

---

## 1. Requisitos

| Componente | Versión |
|---|---|
| Node.js | 20.19 o superior (22 LTS recomendado) |
| npm | 10 o superior |
| Backend LogiTrack | API Gateway en `http://localhost:8002` con los 9 microservicios (ver `../docker-compose.yml`) |

**Versión del backend.** El frontend se construyó y probó contra el proyecto adjunto, con estas ramas y commits:

| Repositorio | Rama | Commit |
|---|---|---|
| `analytics-service` | `main` | `3afc25f` |
| `api-gateway` | `feature/automatizacion-envios` | `2ab3767` |
| `billing-service` | `main` | `f0af9fe` |
| `customs-service` | `feature/automatizacion-envios` | `6409851` |
| `fleet-service` | `feature/automatizacion-envios` | `55c7042` |
| `maintenance-service` | `main` | `38b5d03` |
| `notification-service` | `main` | `5d7dd17` |
| `routing-service` | `feature/automatizacion-envios` | `833d6b6` |
| `shipment-service` | `feature/automatizacion-envios` | `e44b5e8` |
| `tracking-ingestion-service` | `feature/automatizacion-envios` | `432c85f` |

Con un Gateway anterior (por ejemplo `api-gateway` en `main`, que define 44 rutas a mano y no tiene `/api/v1/estado`, `/clientes`, `/seguimiento/*` ni `/viabilidad`) gran parte de la interfaz recibirá 404. *Estado del sistema* lo deja en evidencia y `node scripts/verificar-cobertura.mjs` lista exactamente qué rutas faltan.

El Gateway autoriza por CORS los orígenes de `CORS_ORIGINS` (por defecto `http://localhost:5173` y `http://localhost:3000`). Por eso el servidor de desarrollo usa **siempre el puerto 5173** (`strictPort`). Si sirve el frontend en otro origen, agréguelo a `CORS_ORIGINS` en `api-gateway/.env` y reinicie el Gateway.

## 2. Instalación y ejecución

```bash
cd frontend
npm install
cp .env.example .env.local      # ajuste las URL si su Gateway no está en localhost:8002
npm run dev                     # http://localhost:5173
```

Compilación de producción:

```bash
npm run build                   # typecheck + build → dist/
npm run preview                 # sirve dist/ en http://localhost:4173 (agregue ese origen a CORS_ORIGINS)
```

Para que `LevantarTodo.ps1` también arranque este frontend, puede agregar al final (requiere haber ejecutado `npm install` una vez):

```powershell
Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev" -WorkingDirectory "$base\frontend"
```

### Gateway por túnel o en otra máquina

La URL del Gateway se puede cambiar **sin recompilar**, igual que en `web-frontend/`:

- abriendo la interfaz con `?api=`, por ejemplo `http://localhost:5173/?api=https://xxxx.trycloudflare.com` (la URL que imprime `LevantarTunel.ps1`), o
- en *Estado del sistema → Gateway de esta interfaz*.

La elección se recuerda en ese navegador y se puede volver a la de la compilación con un clic. El Gateway elegido debe aceptar el origen de la interfaz en `CORS_ORIGINS`.

### Despliegue en Vercel

`vercel.json` ya define la compilación (`npm run build` → `dist/`) y reescribe todas las rutas a `index.html`, necesario para que funcionen enlaces directos como `/envios/…`. Cree el proyecto de Vercel con `frontend/` como directorio raíz, agregue el dominio resultante a `CORS_ORIGINS` del Gateway y ábralo con `?api=<url del túnel>`.

Datos de demostración (opcional, para un backend vacío): `python scripts/semilla_demo.py` crea vehículos, conductores, clientes, tarifas, programas y envíos **a través del Gateway**. Son datos ficticios, guardados en las bases reales; el backend ejecuta el flujo (asignación, viaje simulado, aduanas, facturación).

## 3. Variables de entorno

Todas son opcionales; los valores por defecto sirven para un backend local. No hay secretos en el frontend. `?api=` (arriba) tiene prioridad sobre `VITE_GATEWAY_URL` y `VITE_API_BASE_URL`.

| Variable | Por defecto | Uso |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8002/api/v1` | Base de todas las rutas de la API |
| `VITE_GATEWAY_URL` | `http://localhost:8002` | Raíz del Gateway: `/health`, `/docs`, `/openapi.json` |
| `VITE_API_TIMEOUT_MS` | `20000` | Tiempo máximo por petición (la ETL manual usa 120 s) |
| `VITE_MAP_TILE_URL` | `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Teselas del mapa (Leaflet) |
| `VITE_MAP_ATTRIBUTION` | crédito de OpenStreetMap | Atribución obligatoria del proveedor de teselas |
| `VITE_POLL_SEGUIMIENTO_MS` | `4000` | Ficha de un viaje (`/seguimiento/envio/{id}`; el contrato recomienda 3–5 s) |
| `VITE_POLL_FLOTA_MS` | `5000` | Mapa general (`/seguimiento/flota`) |
| `VITE_POLL_ULTIMA_POSICION_MS` | `60000` | Última lectura de telemetría de vehículos sin viaje |

Para producción, respete la [política de uso de teselas de OSM](https://operations.osmfoundation.org/policies/tiles/) o configure su propio proveedor.

## 4. Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo (5173) |
| `npm run build` | `tsc -b` + build de producción |
| `npm run typecheck` | Solo TypeScript (modo estricto) |
| `npm run lint` | ESLint (React Hooks, React Refresh, typescript-eslint) |
| `npm test` | Pruebas unitarias (Vitest) |
| `npm run test:e2e` | Pruebas de extremo a extremo con Playwright **contra el backend real** |
| `node scripts/verificar-cobertura.mjs` | Compara el `openapi.json` en vivo del Gateway con las rutas que usa el frontend |

## 5. Cómo comprobar la integración con el backend

1. **Estado del sistema** (`/sistema`): consulta `GET /health` y `GET /api/v1/estado` y muestra cada microservicio, su tiempo de respuesta y las limitaciones conocidas. El indicador del encabezado («9/9 servicios») resume lo mismo en todas las páginas.
2. **Cobertura de rutas**: con el backend encendido, `node scripts/verificar-cobertura.mjs` descarga `http://localhost:8002/openapi.json` y falla si alguna ruta pública no la usa el frontend o si el frontend llama a una que no existe. Resultado verificado: **83/83**.
3. **Recorrido funcional**: cree un envío en *Envíos → Nuevo envío*. En segundos pasa a «asignado» y «en tránsito»; aparece en el *Mapa en vivo* moviéndose cada 5 s, con su trazado y estela; su bitácora, eventos del viaje, reserva, aduana (si es internacional) y, al llegar, la prueba de entrega y el costo.
4. **Pruebas automáticas**: `npm run test:e2e` (ver sección 8).

## 6. Arquitectura

```
src/
  app/            Shell: router (páginas con carga diferida), layout, navegación, buscador global, proveedores
  lib/
    api/          http.ts (fetch, cancelación, errores), errors.ts (3 formas de `detail`), endpoints.ts (83 rutas)
    types/        Tipos de request/response según el contrato y los esquemas Pydantic
    dominio.ts    Vocabulario: estados, transiciones, reglas de elegibilidad, etiquetas en español
    format.ts     Números (decimales como texto), pesos, fechas en America/Bogota
  hooks/          queries.ts (TanStack Query por recurso), useAccion (mutaciones + invalidación + avisos)
  components/
    ui/           Primitivas al estilo shadcn/ui sobre Radix (botón, diálogo, panel lateral, pestañas…)
    shared/       DataTable, formularios, estados vacío/error/carga, placa, insignias, selectores con búsqueda
    map/          Mapa base Leaflet, iconos de vehículo, capa de ruta
    charts/       Marco de gráficas (leyenda, tooltip, vista de tabla) y tokens validados
  features/       Un módulo por dominio: panel, mapa, envios, rutas, aduanas, flota, telemetria,
                  mantenimiento, clientes, facturacion, notificaciones, analitica, ubicaciones,
                  simulaciones, sistema
```

Decisiones principales:

- **Solo el Gateway.** Ninguna página llama a un microservicio directamente. Las rutas internas que el Gateway bloquea (`POST /reservas`, `POST /reservas/liberar`, `POST /rutas`, `POST /telemetria`) no se usan.
- **Errores uniformes.** `ApiError` interpreta las tres formas de `detail` del contrato (texto, objeto con `codigo`, lista de validación) y los errores propios del Gateway (`SERVICIO_NO_DISPONIBLE`, `SERVICIO_LENTO`…). Las páginas distinguen «sin conexión con el Gateway» de «servicio X no disponible» y ofrecen reintentar. Los formularios muestran los motivos del servidor (p. ej. `detail.errores` de elegibilidad, `CAPACIDAD_EXCEDIDA`).
- **Éxito solo con confirmación.** Los avisos de éxito se muestran en `onSuccess` de la mutación, después de la respuesta 2xx, e invalidan las consultas afectadas.
- **Cancelación.** Cada consulta pasa su `AbortSignal` a `fetch`; las peticiones obsoletas se cancelan. Los reintentos automáticos solo aplican a red y 5xx, nunca a 4xx.
- **Sondeo razonable.** Mapa 5 s, ficha de viaje 4 s (se detiene al finalizar), envío pendiente 2 s, listas 10 s; TanStack Query pausa el sondeo con la pestaña oculta.
- **Paginación local.** Las colecciones del backend no se paginan (contrato 1.2): las tablas ordenan y paginan lo recibido; donde existe `limite` se ofrece como control.
- **Filtros en la URL.** Los filtros de las listas se guardan en la dirección para compartir y recargar.
- **Sin autenticación simulada.** El backend no exige credenciales; la interfaz no muestra un inicio de sesión falso y lo advierte en el menú lateral y en *Estado del sistema*. Cuando se incorpore JWT, el Gateway ya reenvía `Authorization`: bastará con agregar la cabecera en `lib/api/http.ts`.

## 7. Mapa interactivo

Fuentes de posición (todas reales; nunca se inventan coordenadas):

| Situación del vehículo | Fuente | Cómo se dibuja |
|---|---|---|
| En viaje (`en_curso` o `pausada`) | `GET /seguimiento/flota`, cada 5 s | Marcador relleno («en vivo») |
| Sin viaje | Última lectura de `GET /telemetria/{id}?limite=1`, cada 60 s | Marcador con borde punteado + «última posición hace X» |
| Sin lecturas | — | Solo en la lista, rotulado «sin coordenadas» |

El color indica el **estado operativo** (en ruta, detenido por aduana, asignado, disponible, mantenimiento, fuera de servicio) y el borde la **procedencia** de la posición, de modo que nunca se confunden. Al seleccionar un vehículo (desde la lista o el marcador) se abre su ficha: viaje, progreso, ETA, velocidad, combustible, paradas; se dibuja el trazado (`/trazado`, una sola vez) y la estela recorrida (`/recorrido`). Si la ruta maestra es `estimada` (OSRM no respondió), el trazado se dibuja punteado y se advierte que no sigue la carretera. Incluye búsqueda por placa, conductor o código de envío, filtros por estado, tipo y procedencia, leyenda, ajuste de vista y versión para móvil.

## 8. Pruebas

- **Unitarias** (`npm test`, 29 pruebas): interpretación de errores, unión de fuentes de posición del mapa, buscador, formatos y zona horaria, reglas de elegibilidad, inventario de 83 rutas, validación de la URL del gateway.
- **E2E** (`npm run test:e2e`): requiere el backend y `npm run dev` encendidos. Si Playwright no tiene navegador: `npx playwright install chromium`, o `PW_CHROMIUM_PATH=/ruta/a/chrome`.
  - `navegacion.spec.ts`: carga de las 23 páginas y 9 fichas de detalle con datos reales, escritorio y móvil (Pixel 7) y tema oscuro; falla ante cualquier error de consola o respuesta 5xx. Guarda capturas en `capturas/`.
  - `flujos.spec.ts`: 12 flujos que **escriben** en el backend y verifican el resultado en la interfaz y en la API (crear cliente, tarifa y preferencia; vehículo y conductor con rechazo de elegibilidad; ciclo de mantenimiento; crear envío con rechazo 422 y asignación automática; incidencia y entrega manual; reintento y devolución; retener y liberar en aduana; recálculo de ruta, barrido y error de OSRM; cierre de periodo y ETL; ubicaciones; mapa; buscador; estados de error).
  - `detalles.spec.ts`: ediciones (cliente, vehículo, conductor), vínculo permanente conductor↔vehículo, lecturas de detalle (reserva, aduana, simulación, factura, seguimiento por código), buscador por ruta y conductor, y cambio de gateway con `?api=`.
  - `caida.spec.ts`: con servicios **realmente apagados**: `CAIDA=billing` (detenga `billing-service`) y `CAIDA=gateway` (detenga el Gateway).
  - `E2E_REGISTRO=capturas/peticiones.jsonl` anota cada petición al Gateway (base de la matriz de cobertura).

## 9. Limitaciones del backend que la interfaz refleja

Ver la sección completa en [`COBERTURA.md`](./COBERTURA.md#4-limitaciones-y-hallazgos-del-backend). En resumen: sin autenticación; viajes, entrega automática y documentos aduaneros simulados; sin endpoint de posición actual fuera de viaje; notificaciones y preferencias en memoria; analítica por ETL periódica; sin listados globales de programas, intervenciones ni tarifas; sin estados de lectura en notificaciones.

## 10. Stack

React 19 · TypeScript 6 (estricto) · Vite 8 · Tailwind CSS 4 · componentes al estilo shadcn/ui sobre Radix UI · Lucide · React Router 7 · TanStack Query 5 · React Hook Form + Zod 4 · Recharts 3 · Leaflet + react-leaflet 5 con OpenStreetMap · Sonner · Vitest · Playwright. Tipografía Archivo (variable, autoalojada).

## Fase 2: inicio de sesión, roles y cobro

- La aplicación exige iniciar sesión (`POST /auth/login`). «Cerrar sesión» está en el menú lateral y en el menú de la cuenta, para entrar con otra cuenta u otro rol.
- «Registrarse» (`/registro`): el backend no tiene registro público, así que un administrador autoriza el alta escribiendo su correo y contraseña en el mismo formulario; su sesión se usa solo para `POST /usuarios` y no se guarda.
- El token vive en `sessionStorage` (nunca en `localStorage` ni en la URL); un 401 vuelve al inicio de sesión y un 403 muestra «sin permiso» sin cerrar la sesión.
- Menús y pantallas por rol (`cliente`, `operador`, `gestor_flota`, `administrador`) según la matriz de `src/lib/auth/permisos.ts` (copia de la sección 9.2 del contrato; el gateway es quien decide).
- Crear un envío es en dos pasos: cotizar (`POST /envios/cotizar`) y aceptar el precio (`POST /envios` con `monto_aceptado_cop`). Incluye carga divisible (pedidos con partes) y fecha programada.
- Pantallas nuevas: Calendario (programados), Cobros y reembolsos, Usuarios, Mi cuenta, e Ingresos en el dashboard.
- En producción el gateway es `https://logitrack-gateway.onrender.com` (`.env.production`). Si Render está dormido, las lecturas se reintentan a los 3, 6 y 12 s mostrando «el sistema se está iniciando».

Pruebas de la fase 2 contra un gateway simulado (no necesitan el backend):

```bash
MOCK_PYTHON=python3 npm run test:e2e:fase2   # requiere fastapi y uvicorn
```
