# LogiTrack · Matriz de cobertura del frontend

Auditoría del backend (10 componentes: API Gateway + 9 microservicios) contra la implementación del frontend. Todo lo marcado como verificado se comprobó **contra el backend real en ejecución** (PostgreSQL 16 + RabbitMQ, código de los servicios sin modificar), no con datos simulados en el frontend.

**Resumen**

| Indicador | Resultado | Cómo se verificó |
|---|---|---|
| Microservicios auditados | 9 de 9 + API Gateway | Lectura de `main.py`, routers, esquemas, eventos y `config.py` del Gateway |
| Rutas públicas del Gateway | 83 (igual al contrato) | `GET /openapi.json` en vivo |
| Rutas integradas en `src/lib/api/endpoints.ts` | **83/83** | `node scripts/verificar-cobertura.mjs` (sale con error si falta o sobra alguna) |
| Funciones de API usadas por alguna pantalla | **83/83** | Revisión estática de usos (cada función y cada hook tiene al menos un consumidor) |
| Rutas ejercidas por la interfaz en E2E | **83/83** | Registro de Playwright (`E2E_REGISTRO`) de cada petición del navegador al Gateway |
| Rutas internas no expuestas por el Gateway | 4, no usadas a propósito | `api-gateway/app/config.py` (`RUTAS`) |

Respuestas HTTP observadas en el registro E2E: 748 × 200, 10 × 201, 10 × 404, 2 × 422, 1 × 409, 1 × 503. Los 4xx y el 503 son respuestas esperadas que la interfaz trata como estados normales (viaje aún no creado, cliente sin tarifa, carga imposible `CAPACIDAD_EXCEDIDA`, conductor no elegible, servicio de mapas OSRM no disponible al recalcular una ruta maestra).

---

## 1. Cobertura por microservicio y requisito

Estado: **Integrado** = conectado a la API real y probado; **N/A backend** = el backend no ofrece la operación (justificado).

### A. Fleet Service (`fleet`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Listado, búsqueda y filtros de vehículos (estado, tipo, refrigeración, HAZMAT, sin conductor) | Flota → Vehículos | `GET /vehiculos` | Integrado | Navegación E2E |
| Ficha del vehículo: datos técnicos, conductor, viaje actual, telemetría, mantenimiento, envíos | Vehículo → detalle | `GET /vehiculos/{id}`, `/seguimiento/vehiculo/{id}`, `/telemetria/{id}`, `/programas`, `/intervenciones` | Integrado | Navegación E2E |
| Crear y editar vehículos | Vehículos → Registrar / Editar | `POST /vehiculos`, `PATCH /vehiculos/{id}` | Integrado | `flujos`, `detalles` |
| Estados y cambio de estado (con confirmación) | Vehículo → Cambiar estado | `PATCH /vehiculos/{id}/estado` | Integrado | `flujos` (y efecto de Mantenimiento) |
| Registro y visualización de conductores | Flota → Conductores | `GET/POST /conductores`, `GET/PATCH /conductores/{id}` | Integrado | `flujos`, `detalles` |
| Vínculo conductor ↔ vehículo con reglas de elegibilidad | Conductor → Vincular; Registrar conductor | `PUT /conductores/{id}/vehiculo` | Integrado | `detalles` (éxito), `flujos` (rechazo 422 con motivos) |
| Auditoría de vínculos | Conductores → Auditoría | `GET /conductores/auditoria-vinculos` | Integrado | Navegación E2E |
| Disponibilidad de flota para una carga | Nuevo envío (en vivo), Vehículos → Comprobar viabilidad | `POST /viabilidad` | Integrado | `flujos` (viable y no viable) |
| Reservas de vehículos | Envío → Asignación | `GET /reservas/envio/{id}` | Integrado (solo lectura) | `detalles` |
| Crear o liberar reservas a mano | — | `POST /reservas`, `POST /reservas/liberar` | **N/A backend**: rutas internas, el Gateway no las expone; la reserva la hace Routing automáticamente | — |

### B. Shipment Service (`shipment`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Listado con filtros por estado y cliente, búsqueda | Envíos | `GET /envios?estado&cliente_id` | Integrado | Navegación E2E |
| Creación con validación, aviso de viabilidad y vista previa de ruta | Envíos → Nuevo envío | `POST /envios`, `POST /viabilidad`, `POST /rutas-maestras/calcular` | Integrado | `flujos` (422 `CAPACIDAD_EXCEDIDA` y alta exitosa) |
| Detalle y ciclo de vida (sondeo cada 2 s mientras está pendiente) | Envío → detalle | `GET /envios/{id}`, `GET /envios/codigo/{codigo}` | Integrado | `flujos` |
| Historial de eventos | Envío → Bitácora | `GET /envios/{id}/eventos` | Integrado | `flujos` |
| Actualización de estado (incidencia, tránsito, devolución) | Envío → Cambiar estado | `PATCH /envios/{id}/estado` | Integrado, solo transiciones permitidas | `flujos` |
| Prueba de entrega: registro y consulta (simulada rotulada) | Envío → Registrar entrega / pestaña | `POST/GET /envios/{id}/prueba-entrega` | Integrado | `flujos` |
| Reintento de asignación | Envío; Panel → Necesita atención | `POST /envios/{id}/reintentar-asignacion` | Integrado | `flujos` |
| Asignación manual de vehículo y ruta | — | — | **N/A backend**: la asignación es automática; la ruta `PATCH /envios/{id}/asignar` fue eliminada (contrato 5.6). Se ofrece «Reintentar asignación» y la reserva/ruta en solo lectura | — |
| Clientes (prerrequisito de los envíos) | Clientes | `GET/POST /clientes`, `GET/PATCH /clientes/{id}`, `GET /clientes/codigo/{c}` | Integrado | `flujos`, `detalles` |

### C. Routing Service (`routing`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Listado y detalle de rutas de envío (origen, destino, distancia, vehículo, intentos) | Rutas → Rutas de envío; Ruta | `GET /rutas`, `GET /rutas/{id}` | Integrado | Navegación E2E |
| Historial de recálculos y recálculo manual | Ruta → Recalcular | `GET /rutas/{id}/historial`, `PATCH /rutas/{id}/recalcular` | Integrado | `flujos` |
| Rutas maestras: listado, cálculo, detalle, trazado, recálculo con OSRM | Rutas → Rutas maestras; Ruta maestra | `GET/POST /rutas-maestras…` (6 rutas) | Integrado | `flujos` (incluye 503 de OSRM) |
| Asignaciones: barrido general y por envío | Rutas → Asignaciones | `POST /asignaciones/reintentar`, `POST /asignaciones/envio/{id}/reintentar` | Integrado (barrido con confirmación) | `flujos`, `detalles` |
| Ubicaciones: catálogo, países, alta, edición, mapa | Ubicaciones | `/ubicaciones` (6 rutas) | Integrado | `flujos` |
| Rutas sobre el mapa con coordenadas válidas | Mapa, Envío, Ruta maestra | `/seguimiento/envio/{id}/trazado`, `/rutas-maestras/{id}/geometria` | Integrado; trazado estimado dibujado punteado y advertido | `navegacion`, `flujos` |
| Crear rutas a mano | — | `POST /rutas` | **N/A backend**: interna, no expuesta | — |

### D. Tracking Ingestion Service (`tracking`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Histórico de telemetría por vehículo con filtros temporales | Telemetría | `GET /telemetria/{id}?desde&hasta&limite` | Integrado | Navegación E2E |
| Coordenadas, velocidad, combustible, temperaturas, odómetro, OBD-II | Telemetría (gráficas por métrica, tabla, mapa de lecturas) | ídem | Integrado | Navegación E2E |
| Seguimiento en vivo y del viaje | Mapa, Panel, Envío, Vehículo | `/seguimiento/flota`, `/seguimiento/envio/{id}`, `/trazado`, `/recorrido`, `/seguimiento/vehiculo/{id}`, `/seguimiento/codigo/{c}` | Integrado | `navegacion`, `flujos`, `detalles` |
| Simulaciones y su bitácora | Simulaciones; Envío → Eventos del viaje | `/simulaciones`, `/simulaciones/envio/{id}`, `/eventos` | Integrado | `detalles` |
| Indicadores de actualización y disponibilidad | Mapa (hace X s, cada 5 s), ficha (posición actualizada), Telemetría (última lectura) | — | Integrado | — |
| Registrar lecturas | — | `POST /telemetria` | **N/A backend**: interna, la usa el simulador | — |

### E. Maintenance Service (`maintenance`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Consulta y creación de programas | Mantenimiento (por vehículo) | `GET /programas/{vehiculo}`, `POST /programas` | Integrado | `flujos` |
| Historial y registro de intervenciones | Mantenimiento (por vehículo) | `GET /intervenciones/{vehiculo}`, `POST /intervenciones` | Integrado (avisa que el vehículo vuelve a «disponible») | `flujos` (verifica el efecto en Fleet) |
| Alertas y anomalías | Mantenimiento, Panel | Programas automáticos `revision_temperatura_motor`, `diagnostico_obd2`, `preventivo_kilometraje` | Integrado, rotulados como alertas de telemetría | — |
| Próximos mantenimientos de toda la flota | Mantenimiento, Analítica, Panel | `GET /dashboard/proyeccion-mantenimiento` | Integrado | Navegación E2E |
| Indicadores preventivo / correctivo | Mantenimiento | derivados de la proyección | Integrado | — |
| Listado global de programas o intervenciones | — | — | **N/A backend**: solo existen por vehículo; la vista global usa la proyección de Analítica | — |

### F. Customs Service (`customs`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Listado con filtro de estado | Aduanas | `GET /declaraciones?estado` | Integrado | Navegación E2E |
| Consulta por envío | Envío → Aduana | `GET /declaraciones/{envio_id}` | Integrado | `detalles` |
| Documentación y estado | Aduanas → panel lateral | ídem | Integrado (URLs de documentos rotuladas como simuladas) | `detalles` |
| Aprobar / retener / pendiente, con motivo y confirmación | Aduanas → panel lateral | `PATCH /declaraciones/{id}/estado` | Integrado; el frontend limita a los 3 estados del contrato | `flujos` (verifica `retenido_aduana` y la liberación) |
| Documentación pendiente en envíos internacionales | Aduanas (cifras) | `GET /declaraciones` + `GET /envios` | Integrado | — |

### G. Notification Service (`notification`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Bandeja: tipo de evento, canal, fecha, destinatario | Notificaciones | `GET /notificaciones?limite` | Integrado | Navegación E2E |
| Preferencias (idioma, canal) | Notificaciones → Preferencias; Cliente | `GET/POST /preferencias/{cliente}` | Integrado | `flujos` |
| Filtros | Notificaciones | — | Parcial: la API solo admite `limite`; canal, destinatario, evento y texto se filtran sobre lo recibido y la interfaz lo dice | — |
| Estados de lectura | — | — | **N/A backend**: el modelo no tiene estado de lectura | — |
| Naturaleza simulada y en memoria | Notificaciones, Cliente, Sistema | — | Advertido en pantalla | — |

### H. Billing Service (`billing`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Listado y detalle de facturas, filtros cliente, período, estado | Facturación → Facturas | `GET /facturas?cliente_id&periodo&estado`, `GET /facturas/{id}` | Integrado | `detalles` |
| Configuración y consulta de tarifas: `por_km`, `por_envio`, `tarifa_plana` | Facturación → Tarifas; Cliente | `POST /tarifas`, `GET /tarifas/{cliente}` | Integrado | `flujos` |
| Costos simulados por ruta | Facturación → Costos; Envío → Costos | `GET /costos-ruta?envio_id` | Integrado | Navegación E2E |
| Cierre de período con confirmación explícita | Facturación | `POST /facturas/cerrar-periodo` | Integrado | `flujos` |
| Resúmenes e indicadores | Facturación (cifras y gráficas), Analítica | derivados | Integrado | — |
| Listado de tarifas de todos los clientes | — | — | **N/A backend**: no existe `GET /tarifas`; se consulta la tarifa de cada cliente (hasta 50) | — |

### I. Analytics Service (`analytics`)

| Requisito | Página | Endpoints | Estado | Pruebas |
|---|---|---|---|---|
| Indicadores generales | Analítica, Panel | `GET /dashboard/resumen` | Integrado | Navegación E2E |
| Entregas por día y cumplimiento de SLA, con ventana de días | Analítica | `GET /dashboard/entregas-diarias?dias` | Integrado | Navegación E2E |
| Utilización de flota, costo por km, eficiencia por conductor, proyección de mantenimiento, actividad | Analítica, Panel, Conductor, Mantenimiento | 5 rutas `/dashboard/*` | Integrado | Navegación E2E |
| Forzar ETL | Analítica | `POST /etl/ejecutar` | Integrado (advierte el defecto de concurrencia, ver §4) | `flujos` |
| Estados vacíos informativos | todas | — | Integrado | — |

### J. API Gateway

| Requisito | Dónde | Endpoints | Estado |
|---|---|---|---|
| Punto único de comunicación | `src/lib/api/http.ts` (base configurable) | `/api/v1/*` | Integrado; ninguna llamada directa a microservicios |
| Gateway elegible sin recompilar | `?api=<raíz>` o *Estado del sistema → Gateway de esta interfaz*; se recuerda en el navegador (misma clave y parámetro que `web-frontend/` y `LevantarTunel.ps1`) | Todas | Integrado y probado (`detalles.spec.ts`) |
| Tiempo máximo por petición | `http.ts`: 20 s (`VITE_API_TIMEOUT_MS`), 120 s para la ETL manual; se combina con la cancelación de TanStack Query | — | Integrado |
| Salud del Gateway y de los servicios | Encabezado, menú lateral (punto rojo por módulo), Estado del sistema | `GET /health`, `GET /api/v1/estado` | Integrado |
| Errores propios del Gateway (503/504/502) | Todas las páginas | — | Integrado y probado con servicios realmente apagados (`caida.spec.ts`) |

### Mapa interactivo (requisito prioritario)

| Requisito | Estado |
|---|---|
| Marcadores individuales con coordenadas reales | Integrado: en vivo (`/seguimiento/flota`) o última lectura (`/telemetria?limite=1`); nunca se inventan |
| Iconos por estado sin confundir estado con ubicación | Color = estado operativo; borde sólido/punteado = en vivo/última conocida; leyenda |
| Posición y última actualización | «En vivo, actualizado hace X s» y «última posición hace X» por vehículo |
| Ficha al seleccionar: placa, conductor, velocidad, estado, combustible, viaje | Integrado |
| Panel lateral, búsqueda (placa, conductor, código de envío), filtros (estado, tipo, procedencia) | Integrado; filtros en la URL |
| Centrar desde la lista y abrir ficha desde el marcador | Integrado |
| Trazado de rutas con geometría real | `/trazado` + estela `/recorrido`; trazados de todos los viajes opcionales; rutas estimadas punteadas y advertidas |
| Leyenda, zoom, ajuste de vista | Integrado |
| Estados de carga, sin coordenadas y error | Integrado |
| Responsive | Escritorio, tablet y móvil (en teléfono abre el mapa; la lista es un panel) |
| Actualización periódica razonable | 5 s flota, 4 s ficha (se detiene al finalizar el viaje), 60 s últimas lecturas; pausa con la pestaña oculta |
| Posición actual sin viaje | **Limitación**: el backend no tiene endpoint de posición actual; se usa la última lectura de telemetría, rotulada como tal |

---

## 2. Matriz por endpoint

«Peticiones de la UI en E2E» cuenta las respuestas que recibió el navegador durante las pruebas (registro `capturas/peticiones.jsonl`). Rutas con `{}` = parámetro.

| # | Servicio | Método y ruta (`/api/v1`) | Funcionalidad | Pantalla | Integración | Peticiones de la UI en E2E (HTTP × n) |
|---|---|---|---|---|---|---|
| 1 | Gateway | `GET /health` (raíz del gateway, fuera de `/api/v1`) | Salud del gateway | Estado del sistema | Integrada | 200×1 |
| 2 | Gateway | `GET /estado` | Salud de los 9 servicios | Encabezado (indicador), Estado del sistema, menú lateral | Integrada | 200×90 |
| 3 | Shipment | `GET /clientes` | Listado y búsqueda de clientes (q, activo, limite) | Clientes; selector de cliente en formularios | Integrada | 200×27 |
| 4 | Shipment | `POST /clientes` | Registrar cliente | Clientes → Registrar cliente | Integrada | 201×1 |
| 5 | Shipment | `GET /clientes/codigo/{}` | Buscar cliente por código | Buscador global (código de 10 dígitos) | Integrada | 200×2, 404×1 |
| 6 | Shipment | `GET /clientes/{}` | Ficha del cliente | Clientes → detalle; Envío → datos | Integrada | 200×12 |
| 7 | Shipment | `PATCH /clientes/{}` | Editar y activar/desactivar cliente | Clientes → detalle (Editar, Activar/Desactivar) | Integrada | 200×1 |
| 8 | Routing | `GET /ubicaciones` | Catálogo y autocompletado (q, pais, tipo, incluir_inactivas, limite) | Ubicaciones; selector origen/destino | Integrada | 200×13 |
| 9 | Routing | `POST /ubicaciones` | Agregar ubicación (con clic en el mapa) | Ubicaciones → Agregar | Integrada | 201×1 |
| 10 | Routing | `GET /ubicaciones/paises` | Filtro por país | Ubicaciones; Nuevo envío | Integrada | 200×11 |
| 11 | Routing | `GET /ubicaciones/codigo/{}` | Buscar ubicación por código | Buscador global (CO-MTR) | Integrada | 200×2 |
| 12 | Routing | `GET /ubicaciones/{}` | Ficha de la ubicación | Ubicaciones → panel lateral | Integrada | 200×5 |
| 13 | Routing | `PATCH /ubicaciones/{}` | Editar departamento, tipo, activa | Ubicaciones → panel lateral | Integrada | 200×1 |
| 14 | Fleet | `GET /vehiculos` | Listado de flota | Vehículos, Mapa, selectores | Integrada | 200×37 |
| 15 | Fleet | `POST /vehiculos` | Registrar vehículo | Vehículos → Registrar | Integrada | 201×2 |
| 16 | Fleet | `GET /vehiculos/placa/{}` | Buscar por placa | Buscador global (placa) | Integrada | 200×2, 404×1 |
| 17 | Fleet | `GET /vehiculos/{}` | Ficha técnica | Vehículo → detalle | Integrada | 200×10 |
| 18 | Fleet | `PATCH /vehiculos/{}` | Editar vehículo | Vehículo → Editar | Integrada | 200×1 |
| 19 | Fleet | `PATCH /vehiculos/{}/estado` | Cambio de estado con confirmación | Vehículo → Cambiar estado | Integrada | 200×1 |
| 20 | Fleet | `GET /conductores` | Listado de conductores | Conductores, Mapa, Vehículos | Integrada | 200×36 |
| 21 | Fleet | `POST /conductores` | Registrar conductor (con vehículo opcional) | Conductores → Registrar | Integrada | 201×1, 422×1 |
| 22 | Fleet | `GET /conductores/auditoria-vinculos` | Auditoría de vínculos | Conductores → Auditoría | Integrada | 200×2 |
| 23 | Fleet | `GET /conductores/codigo/{}` | Buscar conductor por código | Buscador global (código de 10 dígitos) | Integrada | 200×1 |
| 24 | Fleet | `GET /conductores/{}` | Ficha del conductor | Conductor → detalle | Integrada | 200×5 |
| 25 | Fleet | `PATCH /conductores/{}` | Editar conductor | Conductor → Editar | Integrada | 200×1 |
| 26 | Fleet | `PUT /conductores/{}/vehiculo` | Vínculo permanente con vista previa de elegibilidad | Conductor → Vincular vehículo | Integrada | 200×1 |
| 27 | Fleet | `POST /viabilidad` | ¿La flota puede llevar la carga? | Nuevo envío (en vivo); Vehículos → Comprobar viabilidad | Integrada | 200×2 |
| 28 | Fleet | `GET /reservas/envio/{}` | Reserva de vehículo y conductor | Envío → pestaña Asignación | Integrada | 200×2 |
| 29 | Shipment | `GET /envios` | Listado (estado, cliente_id) | Envíos, Panel, Aduanas, Clientes | Integrada | 200×30 |
| 30 | Shipment | `POST /envios` | Crear envío (dispara el flujo automático) | Nuevo envío | Integrada | 201×1, 422×1 |
| 31 | Shipment | `GET /envios/codigo/{}` | Buscar envío por código | Buscador global (ENV-…); Asignaciones | Integrada | 200×3 |
| 32 | Shipment | `GET /envios/{}` | Ficha del envío (sondeo 2 s si pendiente) | Envío → detalle; Mapa | Integrada | 200×19 |
| 33 | Shipment | `GET /envios/{}/eventos` | Línea de tiempo | Envío → Bitácora | Integrada | 200×13 |
| 34 | Shipment | `GET /envios/{}/prueba-entrega` | Prueba de entrega | Envío → Prueba de entrega | Integrada | 200×1 |
| 35 | Shipment | `POST /envios/{}/prueba-entrega` | Registrar entrega manual | Envío → Registrar entrega | Integrada | 201×1 |
| 36 | Shipment | `POST /envios/{}/reintentar-asignacion` | Reintentar asignación | Envío; Panel → Necesita atención | Integrada | 200×1 |
| 37 | Shipment | `PATCH /envios/{}/estado` | Incidencia, tránsito, devolución (con confirmación) | Envío → Cambiar estado | Integrada | 200×3 |
| 38 | Routing | `POST /rutas-maestras/calcular` | Calcular/previsualizar ruta | Nuevo envío; Rutas → Calcular ruta | Integrada | 200×1 |
| 39 | Routing | `GET /rutas-maestras` | Listado (origen, destino, fuente, limite) | Rutas → Rutas maestras | Integrada | 200×2 |
| 40 | Routing | `GET /rutas-maestras/codigo/{}` | Buscar ruta por código | Buscador global (RUT-…) | Integrada | 200×1 |
| 41 | Routing | `GET /rutas-maestras/{}` | Detalle con paradas | Ruta maestra; Envío; Mapa | Integrada | 200×12 |
| 42 | Routing | `GET /rutas-maestras/{}/geometria` | Trazado planificado | Ruta maestra; Envío sin viaje | Integrada | 200×11 |
| 43 | Routing | `POST /rutas-maestras/{}/recalcular` | Recalcular con OSRM (confirmación) | Ruta maestra | Integrada | 503×1 |
| 44 | Routing | `GET /rutas` | Rutas de envío (envio_id, estado) | Rutas; Envío → Asignación | Integrada | 200×4 |
| 45 | Routing | `GET /rutas/{}` | Detalle de la ruta | Ruta de envío | Integrada | 200×3 |
| 46 | Routing | `GET /rutas/{}/historial` | Historial de recálculos | Ruta de envío | Integrada | 200×3 |
| 47 | Routing | `PATCH /rutas/{}/recalcular` | Recálculo manual | Ruta de envío → Recalcular | Integrada | 200×1 |
| 48 | Routing | `POST /asignaciones/reintentar` | Barrido general (confirmación) | Rutas → Asignaciones | Integrada | 200×1 |
| 49 | Routing | `POST /asignaciones/envio/{}/reintentar` | Reintento por envío | Rutas → Asignaciones; Ruta de envío | Integrada | 200×1 |
| 50 | Tracking | `GET /seguimiento/flota` | Posiciones en vivo (cada 5 s) | Mapa en vivo; Panel | Integrada | 200×11 |
| 51 | Tracking | `GET /seguimiento/codigo/{}` | Seguimiento por código | Simulaciones → Seguimiento por código | Integrada | 200×1 |
| 52 | Tracking | `GET /seguimiento/vehiculo/{}` | Viaje actual del vehículo | Vehículo → Viaje actual | Integrada | 200×1, 404×4 |
| 53 | Tracking | `GET /seguimiento/envio/{}` | Ficha del viaje (cada 4 s) | Mapa (seleccionado); Envío | Integrada | 200×14, 404×3 |
| 54 | Tracking | `GET /seguimiento/envio/{}/trazado` | Trazado del viaje | Mapa; Envío | Integrada | 200×10, 409×1 |
| 55 | Tracking | `GET /seguimiento/envio/{}/recorrido` | Estela recorrida | Mapa; Envío | Integrada | 200×11 |
| 56 | Tracking | `GET /simulaciones` | Listado (estado, limite) | Simulaciones de viaje | Integrada | 200×4 |
| 57 | Tracking | `GET /simulaciones/envio/{}` | Estado del simulador | Simulaciones → detalle | Integrada | 200×3 |
| 58 | Tracking | `GET /simulaciones/envio/{}/eventos` | Bitácora del viaje | Envío → Eventos del viaje; Simulaciones | Integrada | 200×4 |
| 59 | Tracking | `GET /telemetria/{}` | Histórico (desde, hasta, limite) y última lectura | Telemetría; Mapa (última posición); Vehículo | Integrada | 200×151 |
| 60 | Maintenance | `POST /programas` | Crear programa preventivo | Mantenimiento → Nuevo programa | Integrada | 201×1 |
| 61 | Maintenance | `GET /programas/{}` | Programas por vehículo | Mantenimiento; Vehículo | Integrada | 200×9 |
| 62 | Maintenance | `POST /intervenciones` | Registrar intervención | Mantenimiento → Registrar intervención | Integrada | 201×1 |
| 63 | Maintenance | `GET /intervenciones/{}` | Historial por vehículo | Mantenimiento; Vehículo | Integrada | 200×9 |
| 64 | Customs | `GET /declaraciones` | Listado (estado) | Aduanas; Panel | Integrada | 200×11 |
| 65 | Customs | `GET /declaraciones/{}` | Declaración de un envío | Envío → Aduana | Integrada | 200×2 |
| 66 | Customs | `PATCH /declaraciones/{}/estado` | Aprobar / retener / pendiente (confirmación) | Aduanas → panel lateral | Integrada | 200×2 |
| 67 | Notification | `GET /notificaciones` | Bandeja (limite) | Notificaciones | Integrada | 200×2 |
| 68 | Notification | `GET /preferencias/{}` | Preferencia del cliente | Notificaciones → Preferencias; Cliente | Integrada | 200×6 |
| 69 | Notification | `POST /preferencias/{}` | Guardar preferencia | Notificaciones → Preferencias; Cliente | Integrada | 200×1 |
| 70 | Billing | `POST /tarifas` | Definir tarifa (por_km, por_envio, tarifa_plana) | Facturación → Tarifas; Cliente | Integrada | 201×1 |
| 71 | Billing | `GET /tarifas/{}` | Tarifa del cliente | Facturación → Tarifas; Cliente | Integrada | 200×42, 404×1 |
| 72 | Billing | `GET /costos-ruta` | Costos simulados (envio_id) | Facturación → Costos; Envío → Costos | Integrada | 200×3 |
| 73 | Billing | `GET /facturas` | Listado (cliente_id, periodo, estado) | Facturación → Facturas; Cliente | Integrada | 200×10 |
| 74 | Billing | `GET /facturas/{}` | Detalle de factura | Facturación → panel lateral | Integrada | 200×1 |
| 75 | Billing | `POST /facturas/cerrar-periodo` | Cierre de periodo (confirmación) | Facturación → Cerrar periodo | Integrada | 200×1 |
| 76 | Analytics | `GET /dashboard/resumen` | Resumen ejecutivo | Analítica; Panel | Integrada | 200×11 |
| 77 | Analytics | `GET /dashboard/entregas-diarias` | Entregas por día (dias) | Analítica | Integrada | 200×5 |
| 78 | Analytics | `GET /dashboard/utilizacion-flota` | Utilización de flota | Analítica | Integrada | 200×5 |
| 79 | Analytics | `GET /dashboard/costo-por-km` | Costo por km | Analítica | Integrada | 200×5 |
| 80 | Analytics | `GET /dashboard/eficiencia-combustible` | Eficiencia por conductor (limite) | Analítica; Conductor | Integrada | 200×8 |
| 81 | Analytics | `GET /dashboard/proyeccion-mantenimiento` | Mantenimientos próximos (dias, todos) | Mantenimiento; Analítica; Panel | Integrada | 200×17 |
| 82 | Analytics | `GET /dashboard/actividad-reciente` | Actividad (limite) | Panel; Analítica | Integrada | 200×11 |
| 83 | Analytics | `POST /etl/ejecutar` | Forzar ETL | Analítica → Ejecutar ETL | Integrada | 200×1 |

Ejercidas por la UI en E2E: 83/83

### Rutas internas que el Gateway no expone (no usadas a propósito)

| Ruta interna | Servicio | Motivo |
|---|---|---|
| `POST /reservas` | Fleet | La reserva atómica la hace Routing por eventos |
| `POST /reservas/liberar` | Fleet | La liberación la hace Routing al entregar o devolver |
| `POST /rutas` | Routing | Las rutas de envío las crea Routing al recibir `shipment.created` |
| `POST /telemetria` | Tracking | Las lecturas las genera el simulador |
| `GET /` y `/static` de Analytics | Analytics | Tablero HTML interno del servicio; el frontend usa `/dashboard/*` por el Gateway |

---

## 3. Pruebas realizadas

| Verificación | Resultado |
|---|---|
| `npm run typecheck` (TypeScript estricto, `noUncheckedIndexedAccess`) | 0 errores |
| `npm run lint` | 0 errores, 0 advertencias, sin reglas desactivadas |
| `npm run build` | Correcto; páginas con carga diferida, mapa y gráficas en fragmentos separados |
| `npm test` (Vitest) | 29/29 |
| `scripts/verificar-cobertura.mjs` | 83/83 rutas del `openapi.json` en vivo |
| E2E `navegacion.spec.ts` (escritorio 1440×900) | 23 páginas + 9 fichas de detalle + tema oscuro, sin errores de consola ni 5xx |
| E2E `navegacion.spec.ts` (móvil Pixel 7) | 23 páginas |
| E2E `flujos.spec.ts` | 12 flujos de escritura verificados en la interfaz y en la API |
| E2E `detalles.spec.ts` | 4 (ediciones, vínculo permanente, lecturas de detalle, buscador, gateway por `?api=`) |
| Suite E2E completa, última ejecución | 64 superadas, 2 omitidas (`caida.spec.ts` solo corre con `CAIDA=…` y el servicio apagado; se ejecutó aparte) |
| E2E `caida.spec.ts` | Billing apagado y Gateway apagado de verdad: estados de error correctos, el resto de módulos sigue funcionando |

Durante la validación se detectaron y corrigieron en el frontend: (1) el selector con búsqueda podía elegir un resultado viejo si se pulsaba Enter antes de terminar la búsqueda; (2) el aviso de éxito de una operación esperaba a refrescar consultas de otros servicios, de modo que un servicio lento retrasaba la confirmación; ahora se confirma al recibir el 2xx y se refresca en segundo plano.

Entorno de prueba: los 10 componentes del backend se ejecutaron desde una copia sin archivos `.env` (sin leer secretos), con PostgreSQL 16 y RabbitMQ locales y migraciones Alembic. Dos diferencias con un despliegue normal: TimescaleDB no estaba disponible (se creó una función `create_hypertable` vacía en `tracking_db`, de modo que la tabla de lecturas es una tabla normal) y el servicio público de OSRM no era alcanzable, por lo que todas las rutas maestras se calcularon en modo `estimada`. Las teselas de OpenStreetMap tampoco cargaban sin Internet: las capturas muestran los marcadores y trazados sobre fondo liso; con conexión se dibuja el mapa base.

---

## 4. Limitaciones y hallazgos del backend

Limitaciones de diseño (la interfaz las refleja; no se ocultan ni se simulan):

1. **Sin autenticación ni roles.** No hay inicio de sesión en la interfaz; se advierte en el menú lateral y en Estado del sistema. El Gateway ya reenvía `Authorization`; al implementarse JWT basta con agregar la cabecera en `lib/api/http.ts`.
2. **Viajes simulados** (factor de tiempo ×120 por defecto) y **entrega automática simulada** (`simulada: true`, rotulada).
3. **Sin posición actual fuera de viaje**: se usa la última lectura de telemetría, rotulada con su antigüedad.
4. **Notificaciones y preferencias en memoria**; sin estado de lectura; la API solo filtra por `limite`.
5. **Analítica no es en tiempo real** (ETL periódica, 5 min por defecto).
6. **Listas sin paginación del servidor**; tablas paginadas en el cliente.
7. **Sin listados globales** de programas, intervenciones ni tarifas.
8. **Documentos aduaneros** con URL de un dominio interno simulado (`docs.logitrack.local`): se muestran como referencia, no como enlace.
9. **Asignación manual de vehículos eliminada** por diseño; solo reintentos.
10. **Consolidación de carga** no implementada en el backend (contrato 8.6).

Hallazgos verificados durante la integración (para el equipo de backend):

1. **Defecto: dos ciclos ETL simultáneos bloquean Analytics.** En `analytics-service/app/etl.py`, `_actualizar_eficiencia_y_mantenimiento` ejecuta `DELETE FROM proyeccion_mantenimiento` y luego hace `await` de llamadas HTTP con la transacción abierta; un segundo ciclo (el programado más uno manual, o dos manuales) ejecuta el mismo `DELETE` con el driver síncrono, que bloquea el bucle de eventos: el primer ciclo nunca hace `commit` y el servicio deja de responder, incluido `/health`, hasta reiniciarlo. **Reproducido** con dos `POST /api/v1/etl/ejecutar` simultáneos. Corrección sugerida: un `asyncio.Lock` alrededor de `ejecutar_ciclo_etl`, obtener los datos remotos antes de abrir la transacción, o ejecutar la parte de base de datos en un hilo. El frontend impide el doble clic en «Ejecutar ETL» y advierte el riesgo; no puede evitar el choque con el ciclo programado.
2. **Contrato vs. servicio en `documentos`**: el contrato muestra una lista de textos; Customs devuelve `[{tipo, url}]`. El frontend acepta ambas formas.
3. **`PATCH /declaraciones/{id}/estado` acepta cualquier texto** (no valida contra `pendiente`, `retenido`, `aprobado`); el frontend solo ofrece esos tres.
4. **`PATCH /vehiculos/{id}/estado` permite `en_transito`** aunque el contrato indica que lo gestiona el sistema; el frontend no lo ofrece.
5. **`api-gateway/README.md` está desactualizado** (solo menciona Fleet y Shipment); la fuente correcta es `docs/CONTRATO_API.md` / `openapi.json`.

## 5. Relación con el frontend existente (`web-frontend/`)

El proyecto ya tenía `web-frontend/`: HTML + CSS + JavaScript sin compilación, servido por `serve.py` en el puerto 8080, lanzado por `LevantarTodo.ps1` y desplegado en Vercel, con el Gateway expuesto por un túnel de Cloudflare (`LevantarTunel.ps1`, que abre la app con `?api=<url del túnel>`).

- **No se modificó ni se eliminó.** El encargo pide React + TypeScript; migrar 111 KB de JavaScript sin tipos a ese stack equivalía a reescribirlo, así que el nuevo frontend vive aparte en `frontend/` y ambos pueden convivir.
- **Se reutilizó lo compatible:** el mecanismo `?api=` con la misma clave de almacenamiento (`logitrack_api_url`), de modo que el flujo del túnel sirve igual (`…/?api=https://xxxx.trycloudflare.com`); el límite de 20 s por petición y uno mayor para la ETL; el despliegue en Vercel (`frontend/vercel.json`, con reescritura a `index.html` para las rutas de la SPA).
- **CORS:** cada origen desde el que se sirva el frontend nuevo (`http://localhost:5173`, `http://localhost:4173` o el dominio de Vercel) debe figurar en `CORS_ORIGINS` del Gateway. No se leyó `api-gateway/.env`, así que no se comprobó qué orígenes tiene configurados.
- `LevantarTodo.ps1` no se tocó; la línea para arrancar también el frontend nuevo está en el README.
- **Versión del backend en el equipo.** La carpeta `Documents\LogiTrack` del equipo tiene `api-gateway` en la rama `main` (último cambio del 30 de septiembre de 2026): 44 rutas escritas a mano en `main.py`, `allow_origins=["*"]`, sin `/api/v1/estado`, clientes, seguimiento, ubicaciones, rutas maestras ni viabilidad. El proyecto adjunto, contra el que se construyó y probó esta interfaz, tiene `api-gateway` en `feature/automatizacion-envios` (`2ab3767`, 11 de octubre). Para usar el frontend en ese equipo hay que poner los repositorios en las ramas de la tabla del README; no se cambió ninguna rama ni archivo del backend.

## 6. Requisitos del encargo que no aplican o quedan pendientes

| Requisito | Situación | Motivo |
|---|---|---|
| Inicio de sesión | No implementado a propósito | El backend no tiene autenticación; un login falso daría una falsa sensación de seguridad |
| Modo de demostración con datos simulados en el frontend | No necesario | Todo funciona contra la API real; para un backend vacío está `scripts/semilla_demo.py`, que crea datos ficticios **a través del Gateway** |
| Configuración general del sistema | Solo tema y preferencias de notificación | El backend no expone parámetros de configuración |
| Estados de lectura y filtros de notificaciones en servidor | No disponible | Ver hallazgos G |
| Componentes generados con el CLI de shadcn | Escritos a mano con el mismo patrón | El registro de shadcn no era accesible desde el entorno de desarrollo |
