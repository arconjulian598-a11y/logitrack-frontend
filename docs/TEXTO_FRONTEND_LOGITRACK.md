# LogiTrack — Instrucciones para la IA que construye el frontend

> Pega este texto completo al inicio de la conversación con tu IA y adjunta también `CONTRATO_API.md` (la referencia exacta de cada ruta y campo). Este texto fija **las reglas del sistema**; el contrato da el detalle técnico. Si algo de este texto contradice al contrato, manda la sección 9 del contrato; si el contrato contradice al backend real, manda el backend (`/docs` del gateway).

---

## 0. Tu papel y límites

Vas a construir (o continuar) la interfaz web de **LogiTrack**, un sistema de logística de transporte de carga en Colombia. El backend ya existe, está terminado y probado. **Tu trabajo es consumirlo tal como es.** No lo rediseñes, no inventes endpoints, no muevas reglas de negocio al navegador.

Reglas absolutas:
1. El frontend habla **únicamente con el API Gateway**, en `{BASE}/api/v1`. Nunca con un microservicio directo. Lo que no esté en el contrato no es público.
2. **El gateway decide los permisos**, no el frontend. Oculta lo que el rol no puede usar para mejorar la experiencia, pero no confíes en eso: maneja siempre el 403.
3. **No calcules precios, capacidades, estados ni asignaciones en el cliente.** Todo eso lo calcula el backend; tú lo muestras.
4. No asignes vehículos a mano ni cambies un envío a `asignado`: es automático.
5. No inventes datos que el backend no entrega. Si falta algo, muestra «sin dato».
6. Configura la URL base por variable de entorno (por ejemplo `VITE_API_BASE_URL`), nunca fija en el código.

---

## 1. Qué es el sistema (modelo mental)

Un cliente pide mover una carga de un lugar a otro. El sistema:
1. valida el cliente, calcula la ruta por carretera y revisa si algún vehículo de la flota puede llevar la carga;
2. **cotiza el precio en COP**; el usuario lo acepta y el pedido se crea con un **pago simulado confirmado** y su factura;
3. busca solo un vehículo con conductor (si no hay, el envío queda en espera y se asigna al liberarse uno);
4. simula el viaje (posición, progreso, combustible, paradas) acelerado en el tiempo;
5. al llegar, marca el envío como entregado con una prueba de entrega simulada.

Si la carga es mayor que cualquier vehículo y el usuario marcó «divisible», el sistema la reparte en varios vehículos: **un pedido con varios envíos hijos («partes»)**. Se cotiza, cobra, programa y cancela como **un solo pedido**.

Los servicios que respaldan esto (el frontend no los llama directamente, pero explican de dónde sale cada dato): Fleet (flota y conductores), Shipment (clientes, usuarios, envíos), Routing (rutas y asignación), Tracking (viaje simulado y mapa), Maintenance (mantenimiento), Customs (aduanas), Notification (avisos), Billing (precios, pagos, facturas, reembolsos) y Analytics (dashboard e ingresos).

---

## 2. Autenticación y roles

- `POST /auth/login` con `{email, password}` → `{access_token, expires_in, usuario}`. Es la **única ruta pública**. El token dura 8 horas por defecto.
- Toda otra petición lleva `Authorization: Bearer <token>`. Sin cookies, sin credenciales de navegador (`credentials: 'omit'`).
- Al abrir la app con un token guardado, llama `GET /auth/me` para conocer el rol y construir el menú.
- Guarda el token en memoria o `sessionStorage`. Nunca en `localStorage` ni en la URL.
- Cualquier respuesta **401** (`NO_AUTENTICADO`, `TOKEN_INVALIDO`, `TOKEN_EXPIRADO`) → borrar el token y volver al login.
- **403 `SIN_PERMISO`** → el usuario sigue autenticado: muestra «no tiene permiso para esta acción», **no** cierres sesión.
- No existe registro público. Las cuentas las crea un administrador (`POST /usuarios`). La pantalla de login no ofrece «crear cuenta».

### Los cuatro roles
| Rol | Quién es | Qué ve |
|---|---|---|
| `cliente` | Empresa que contrata el transporte. Ligada a un `cliente_id` | **Solo lo suyo**: sus envíos, pagos, facturas. Cotiza y crea envíos a su nombre |
| `operador` | Atiende el día a día | Crea clientes y envíos, ve flota, seguimiento y calendario (solo lectura), aduanas, notificaciones |
| `gestor_flota` | Responsable de la flota | Gestiona vehículos, conductores y mantenimiento; **cancela y reprograma**; ve envíos y seguimiento |
| `administrador` | Control total | Todo, incluidos usuarios, tarifas, **reembolsos**, ETL e ingresos |

### Matriz de permisos (qué pantallas y acciones mostrar)
| Operación | cliente | operador | gestor_flota | administrador |
|---|:-:|:-:|:-:|:-:|
| Usuarios (`/usuarios`) | | | | ✔ |
| Ver clientes | ✔ (el suyo) | ✔ | | ✔ |
| Crear / editar clientes | | ✔ | | ✔ |
| Ubicaciones: ver | ✔ | ✔ | ✔ | ✔ |
| Ubicaciones: crear / editar | | ✔ | | ✔ |
| Rutas maestras: ver | | ✔ | ✔ | ✔ |
| Cotizar (`/envios/cotizar`) y viabilidad | ✔ | ✔ | | ✔ |
| Crear envío | ✔ (a su nombre) | ✔ | | ✔ |
| Ver envíos | ✔ (los suyos) | ✔ | ✔ | ✔ |
| Reintentar asignación / cambiar estado manual | | ✔ | ✔ | ✔ |
| Prueba de entrega manual | | ✔ | | ✔ |
| **Cancelar y reprogramar** | | | ✔ | ✔ |
| Calendario (`/envios/programados`) | | ✔ (lectura) | ✔ | ✔ |
| Vehículos y conductores: ver | | ✔ | ✔ | ✔ |
| Vehículos y conductores: crear / editar | | | ✔ | ✔ |
| Mantenimiento: ver / registrar | | ver | ver y registrar | ver y registrar |
| Seguimiento de la flota, telemetría, simulaciones (mapa del personal) | | ✔ | ✔ | ✔ |
| Seguimiento de **sus** envíos (`/seguimiento/cliente/envio/{id}`, respuesta reducida) | ✔ | | | |
| Fijar la ubicación base de un vehículo (`PUT /vehiculos/{id}/ubicacion`) | | | ✔ | ✔ |
| Aduanas | | ✔ | | ✔ |
| Notificaciones | | ✔ | | ✔ |
| Preferencias de notificación | ✔ (las suyas) | | | ✔ |
| Pagos y cotizaciones guardadas | ✔ (los suyos) | ✔ (ver) | | ✔ |
| Facturas por pedido y mensuales | ✔ (las suyas) | | | ✔ |
| **Reembolsar** y lista «por reembolsar» | | | | ✔ |
| Tarifas, costos de ruta, cerrar periodo, ETL, `/estado` | | | | ✔ |
| Dashboard completo e **ingresos** | | | | ✔ |
| Dashboard de flota (utilización y proyección de mantenimiento) | | | ✔ | ✔ |

Reglas finas:
- El **cliente no tiene calendario ni el mapa del personal**, y no lista notificaciones. **Sí sigue sus propios envíos en un mapa** (sección 5.1): ruta, estela, posición del vehículo, progreso y hora estimada, sin placa, conductor ni combustible.
- Una cuenta `cliente` puede **omitir** `cliente_id`/`codigo_cliente` al crear un envío: se crea siempre a su nombre. El backend filtra sus listas aunque el frontend pida otro cliente.
- Menú sugerido por rol: *cliente* → Mis envíos, Seguimiento, Nuevo envío, Mis pagos y facturas. *operador* → Envíos, Nuevo envío, Clientes, Flota (lectura), Mapa, Calendario, Aduanas, Notificaciones. *gestor_flota* → Envíos, Flota y conductores, Mantenimiento, Calendario (cancelar/reprogramar), Mapa, Dashboard de flota. *administrador* → todo lo anterior más Usuarios, Cobros y reembolsos, Tarifas, Dashboard e ingresos.

---

## 3. Flujo obligatorio: crear un envío (dos pasos)

El backend **exige cotizar antes de crear** cuando el cobro está activo. No se puede saltar.

1. **Formulario.** Cliente (el rol `cliente` no elige), origen y destino (buscador `GET /ubicaciones?q=`; se envía `origen_codigo`/`destino_codigo` o los `id`), `peso_kg` (obligatorio, es el criterio principal de capacidad), `volumen_m3` (opcional), `tipo_carga` (`general` o `refrigerada`), `es_hazmat`, **`es_divisible`** (casilla; por defecto `false`; ofrécela sobre todo si la carga es muy pesada) y **`fecha_programada`** (opcional, futura). **No envíes `es_internacional`**: se deduce de los países.
2. **Cotizar:** `POST /envios/cotizar` con el mismo cuerpo. No crea nada. Muestra: `monto_cop` (formatea como pesos colombianos), distancia y duración, `aviso` (por ejemplo «La carga se dividirá en 2 envíos (uno por vehículo); el precio es el del pedido completo») y, si hay división, el plan en `viabilidad.partes`.
3. **Habilita «Crear envío» solo si `puede_crear` es `true`.** Si es `false`, muestra `viabilidad.mensaje` y no permitas continuar. Si `facturacion_activa` es `false`, no se exige `monto_aceptado_cop`.
4. **Crear:** `POST /envios` con el mismo cuerpo **más** `monto_aceptado_cop` (el `monto_cop` cotizado). Responde 201. Muestra un indicador de carga: puede tardar varios segundos (hasta 65 s) cuando la ruta es nueva.
5. **Seguimiento inicial:** consulta `GET /envios/{id}` cada 2 s hasta que `estado` deje de ser `pendiente` (suele tardar 1–3 s); a los 30 s muestra «asignación en proceso» y sigue con el refresco normal.

Errores de creación que debes manejar por `detail.codigo`:
| HTTP | `codigo` | Qué hacer |
|---|---|---|
| 409 | `PRECIO_CAMBIO` | El precio cambió: **vuelve a cotizar**, muestra el nuevo monto y pide confirmar otra vez |
| 422 | `PRECIO_NO_ACEPTADO` | Falta `monto_aceptado_cop`: error del frontend, cotiza primero |
| 503 | `FACTURACION_NO_DISPONIBLE` | Billing no responde: «reintente en unos minutos» |
| 422 | `CARGA_INDIVISIBLE_EXCEDE_CAPACIDAD` | Ningún vehículo la lleva: sugerir marcarla divisible o reducir peso |
| 422 | `DEMASIADAS_PARTES` | Haría falta más de 10 vehículos |
| 422 | `VOLUMEN_EXCEDIDO`, `SIN_REFRIGERACION`, `SIN_HABILITACION_HAZMAT`, `SIN_FLOTA_OPERATIVA` | Mostrar `detail.mensaje` |
| 422 | `FECHA_PROGRAMADA_PASADA`, `FECHA_PROGRAMADA_LEJANA`, `FECHA_POSTERIOR_AL_SLA` | Corregir la fecha |
| 503 | `ROUTING_NO_DISPONIBLE` | Reintentar |

Una `fecha_programada` sin zona horaria se interpreta como hora de Colombia (UTC−5); debe ser futura (≥ 1 minuto) y no pasar de un año.

---

## 4. Estados: cómo mostrarlos

Estados del envío (`estado`), cada uno con etiqueta y color propios:
| Estado | Significado | Notas de interfaz |
|---|---|---|
| `programado` | Creado para una fecha futura; sin vehículo | Mostrar la fecha; permitir reprogramar/cancelar (gestor, admin) |
| `pendiente` | Buscando vehículo (segundos) | Transitorio |
| `sin_asignacion` | No hay vehículo libre compatible; reintenta solo | Mostrar `motivo_sin_asignacion`; botón «Reintentar ahora» (operador/gestor/admin) |
| `asignado` | Tiene vehículo, conductor y ETA | Mostrar placa, conductor, `hora_estimada_llegada` |
| `en_transito` | Vehículo en camino | Habilitar mapa de seguimiento |
| `con_incidencia` | Marcado con incidencia | |
| `retenido_aduana` | Internacional retenido por Aduanas; el viaje queda pausado | |
| `entregado` | Terminado (final) | Mostrar prueba de entrega; si `simulada` es `true`, rotularla «entrega simulada» |
| `devuelto` | Devuelto (final) | |
| `cancelado` | Cancelado antes de salir (final) | |

- **Las transiciones automáticas (`pendiente → asignado → en_transito → entregado`) no las provoca el frontend.** Solo refresca.
- Acciones manuales permitidas (según rol): cancelar (`POST /envios/{id}/cancelar`, solo desde `programado`, `pendiente` o `sin_asignacion`), reprogramar (`PATCH /envios/{id}/reprogramar`, solo `programado`), cambiar a `en_transito`/`con_incidencia`/`devuelto` con `PATCH /envios/{id}/estado` (casos excepcionales). Un envío que ya tiene vehículo no se cancela: se **devuelve**.
- Una transición no permitida responde 409 `TRANSICION_INVALIDA`. Muestra el mensaje y refresca.

### Pedidos divididos
- El **padre** es lo que ve el cliente; tiene `partes_total` y `partes_entregadas`. Los **hijos** tienen `envio_padre_id`, `parte_numero` y códigos como `ENV-00000032-P1`.
- Listados: usa `GET /envios?solo_pedidos=true` para no mostrar las partes sueltas. En el detalle del padre carga `GET /envios/{id}/partes` y muestra «2 de 3 partes entregadas».
- El estado del padre **lo calcula el sistema** a partir de sus partes. **No ofrezcas acciones sobre el padre que cambien estado ni sobre una parte suelta donde no corresponde:**
  - 409 `ENVIO_DIVIDIDO`: no se cambia el estado ni se registra entrega del padre; se actúa sobre las partes.
  - 409 `PARTE_DE_PEDIDO`: no se cancela ni reprograma una parte; se hace sobre el pedido completo (trae `envio_padre_id`).
  - 409 `NO_SE_PUEDE_CANCELAR`: alguna parte ya tiene vehículo en camino (trae `partes_en_curso`).
- Solo el padre muestra `monto_cop`; las partes lo traen en `null`.

---

## 5. Seguimiento en mapa (personal: operador, gestor, administrador)

1. Al abrir la pantalla de un envío en tránsito, **una vez**: `GET /seguimiento/envio/{id}/trazado` (polilínea y paradas). No cambia durante el viaje.
2. **Cada 3–5 s:** `GET /seguimiento/envio/{id}` → posición (`posicion.latitud/longitud`), progreso, ETA, combustible, parada actual. Mueve el marcador **a la posición recibida**; nunca la calcules con la velocidad.
3. Opcional: `GET /seguimiento/envio/{id}/recorrido` para la estela ya recorrida.
4. **Detén el polling** cuando `estado_viaje` sea `finalizada` o `cancelada`.
5. Mapa general de la flota: `GET /seguimiento/flota` cada 5 s.
- **`404 SIN_VIAJE` no es un error:** el envío aún no tiene viaje. Muestra «esperando vehículo». También son normales `409 VIAJE_EN_PREPARACION` y `404 SIN_VIAJE_ACTIVO`.
- El viaje es una **simulación acelerada** (`factor_tiempo`, por defecto 120): un viaje de 6 horas dura ~3 minutos. Las horas de llegada (`tiempos.*`) ya están en tiempo real de pared; la velocidad mostrada es la virtual del camión. No inventes una conversión.
- Bitácora para una línea de tiempo: `GET /envios/{id}/eventos`.

### 5.1 Seguimiento para el cliente (sus propios envíos)

Base `GET /api/v1/seguimiento/cliente/envio/{envio_id}` (solo rol `cliente`; el dueño lo comprueba el backend con el token: **nunca** se envía `cliente_id`). Mismos nombres de campos que el mapa del personal (`posicion`, `progreso`, `tiempos`, `origen`, `destino`, `paradas`, `fase`), sin vehículo, conductor ni combustible.

1. `GET .../{envio_id}` al abrir y luego cada **5 s** con `estado_viaje = en_curso`, cada **10 s** en `preparando`, `pausada` o `sin_viaje` (envío no final). Se detiene en `finalizada`, `cancelada` o con el envío en estado final. Pausa con la pestaña oculta y consulta enseguida al volver; nunca dos peticiones a la vez.
2. `GET .../trazado` una vez, cuando `trazado_disponible` sea `true` (404 `SIN_VIAJE` = aún no hay viaje; 409 `VIAJE_EN_PREPARACION` = reintentar en unos segundos).
3. `GET .../recorrido?limite=500` una vez al abrir; después la estela crece con las posiciones nuevas recibidas.
4. El marcador va **siempre** en `posicion.latitud/longitud`; sin `posicion.disponible`, sin marcador («Todavía no hay ubicación disponible»). Con `posicion.desactualizada`, el marcador queda en la última posición y se avisa «Ubicación desactualizada (hace N min)». Se muestra «Última actualización: hh:mm:ss» en la hora del usuario.
5. `es_pedido_dividido`: sin mapa del pedido; se listan las partes (`GET /envios/{id}/partes`) y cada una abre su propio seguimiento. `viaja_compartido`: aviso; ruta y avance son solo del tramo del cliente. `fase = reposicion`: el vehículo va hacia la recogida, progreso 0.
6. Errores: 404 `ENVIO_NO_ENCONTRADO` → «Envío no encontrado» (sin pistas; ajeno e inexistente responden igual); 401 → inicio de sesión; 403 → sin permiso, sin reintentar; 503 `SEGUIMIENTO_NO_DISPONIBLE`, 502, 504 o sin red → «No se pudo actualizar», conservar lo último y reintentar a los 5, 10, 20, 40 y 60 s.
7. La ubicación viene del simulador de Tracking (no es GPS real); se indica con una nota discreta.

---

## 6. Cobros, facturas y reembolsos

- **Cliente:** «Mis pagos» (`GET /pagos`) y «Mis facturas» (`GET /facturas-pedido`); el backend ya filtra por su cuenta. Por pedido: `GET /pagos/envio/{id}` y `GET /facturas-pedido/envio/{id}`.
- **Administrador:** todos los pagos y facturas, con filtros (`cliente_id`, `estado`, fechas), más:
  - `GET /pagos/por-reembolsar`: pagos confirmados de pedidos cancelados o devueltos (cada uno con `motivo` y `detalle`).
  - `POST /pagos/{pago_id}/reembolsar` (cuerpo opcional `{nota}`): el pago pasa a `reembolsado` y la factura a `anulada`.
  - Errores: `PEDIDO_SIN_DEVOLUCION`, `PAGO_YA_REEMBOLSADO`, `PAGO_NO_REEMBOLSABLE` (409), `PAGO_NO_ENCONTRADO` (404). Un pedido recién cancelado puede tardar unos segundos en aparecer en la lista por reembolsar: ofrece «actualizar».
- Todo pago es **simulado** (`metodo: "simulado"`, referencia `SIM-…`). No muestres pasarelas, tarjetas ni nada que sugiera dinero real. No hay reembolso parcial.
- Estados del pago: `pendiente`, `confirmado`, `reembolsado`. Un pedido está pagado solo con pago `confirmado`. Estados de la factura: `emitida`, `anulada`.
- Las facturas mensuales antiguas (`/facturas`) son otra medida, independiente del cobro por pedido.

---

## 7. Dashboard e ingresos (administrador)

- `GET /dashboard/resumen` (incluye `ingresos_mes_actual_cop` e `ingresos_anio_actual_cop`, netos), `GET /dashboard/ingresos/mensual?anio=`, `GET /dashboard/ingresos/anual`, `GET /dashboard/ingresos/pedidos?mes=&estado=&cliente_id=` y los indicadores de flota.
- **Ingreso neto = cobrado − reembolsos.** No lo recalcules: usa `bruto_cop`, `reembolsos_cop`, `neto_cop`.
- Se actualiza con un proceso periódico (hasta 5 minutos de retraso, no es tiempo real). Ofrece un botón «Actualizar ahora» que llame `POST /etl/ejecutar` y luego reconsulte. Muestra «actualizado hace…».
- Gestor de flota solo ve `/dashboard/utilizacion-flota` y `/dashboard/proyeccion-mantenimiento`.

---

## 8. Datos que debes tratar con cuidado

- **Decimales como texto.** Fleet, Shipment, Routing y Billing devuelven números como cadena (`"800.00"`, `"86528.00"`). Convierte con `Number(...)` antes de operar o formatear. Tracking devuelve números reales.
- **Fechas en UTC.** Formato ISO 8601. Conviértelas a `America/Bogota` solo al mostrarlas.
- **Identificadores.** Usa el `id` (uuid) en las rutas y muestra al usuario el código legible: `codigo_envio` (`ENV-00000032`), `codigo_ruta`, `codigo_cliente`, `codigo_conductor`, `placa`. Muchas consultas tienen variante `/codigo/{codigo}`.
- **Listas** son arreglos simples sin paginación; el único control de tamaño es `limite`. Los pagos y facturas admiten además `offset`.
- **Moneda.** Siempre COP. Formatea con `Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', maximumFractionDigits:0})`.
- **Errores.** `detail` puede ser un objeto con `codigo` y `mensaje`, un texto, o una lista (validación 422). Usa esta función para mostrar cualquier error y decide la lógica por `detail.codigo`, nunca por el texto:

```js
function mensajeDeError(cuerpo, estado) {
  const d = cuerpo?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d)) return d.map(e => `${(e.loc || []).slice(1).join('.')}: ${e.msg}`).join('\n');
  if (d && typeof d === 'object') {
    if (d.errores?.length) return `${d.mensaje}: ${d.errores.join('; ')}`;
    return d.mensaje || d.codigo || `Error ${estado}`;
  }
  return `Error ${estado}`;
}
```

- **Errores del gateway:** 503 `SERVICIO_NO_DISPONIBLE` (servicio caído o dormido: mensaje amable y reintento con espera), 504 `SERVICIO_LENTO` (tardó más de 65 s), 502 `ERROR_DE_GATEWAY`, 404 `RUTA_NO_ENCONTRADA` (es un error de programación), 405 `METODO_NO_PERMITIDO`.
- **No repitas ciegamente un `POST` tras un 504**: puede haberse creado. Consulta primero (`GET /envios` filtrado) antes de reenviar.
- Guarda `X-Request-ID` de la respuesta para reportar errores («el ID fue a1b2c3»).
- **Entorno desplegado (Render):** en la versión de demostración los servicios se duermen tras 15 minutos de inactividad y tardan ~1 minuto en despertar. La primera petición puede fallar con 503/504: muestra «el sistema se está iniciando» y reintenta con espera creciente (por ejemplo 3, 6, 12 s) en vez de mostrar un error definitivo.
- **CORS.** El origen del frontend debe estar en la variable `CORS_ORIGINS` del gateway. Si el navegador bloquea las peticiones, es eso (avisa a quien despliega el backend).

---

## 9. Estados de carga y experiencia

- Muestra indicador de carga en `POST /envios/cotizar` y `POST /envios` (hasta decenas de segundos la primera vez que se calcula una ruta nueva).
- Refrescos: lista de envíos cada 10 s o con botón; detalle mientras el estado no sea final; seguimiento cada 3–5 s; flota cada 5 s. Cancela los temporizadores al salir de la pantalla.
- Deshabilita los botones mientras una acción está en curso (evita doble envío).
- Al recibir `PRECIO_CAMBIO`, no cierres el formulario: vuelve a cotizar y deja al usuario confirmar el nuevo precio.
- Las listas de catálogos (clientes, ubicaciones, vehículos) deben tener buscador (`?q=`).
- **Ubicación base de los vehículos.** `POST /vehiculos` exige la ubicación base, elegida de la lista de ubicaciones guardadas (`GET /ubicaciones?q=&limite=20`); se envían `ubicacion_id`, `ubicacion_nombre`, `latitud`, `longitud` y `codigo_pais` copiados de la ubicación elegida (nadie escribe coordenadas). Un vehículo sin ubicación (`latitud` nula o `ubicacion_confiable = false`) se marca «Sin ubicación» y gestor/administrador la fijan con `PUT /vehiculos/{id}/ubicacion` (`fuente: "registro_gestor"`; 409 `VEHICULO_EN_VIAJE` si está en viaje). El mapa de la flota avisa «N vehículos sin ubicación» en lugar de esconderlos.
- Reglas de formularios de flota que debes mostrar: un conductor se liga **de forma permanente** a un vehículo; un vehículo sin conductor no se asigna a envíos. Elegibilidad: furgoneta B1/C1 y 1 año; camión B2/C2 y 2 años; tractocamión B3/C3 y 3 años; vehículo con certificado HAZMAT exige conductor con certificación HAZMAT y 3 años. Si no cumple: 422 con la lista en `detail.errores`; muéstrala.

---

## 10. Lo que NO debes hacer

- No llamar a un microservicio directamente ni a URLs fuera de `/api/v1`.
- No guardar el token en `localStorage` ni en la URL, ni en el código.
- No ofrecer «registrarse» ni recuperar contraseña: no existen.
- No permitir crear un envío sin cotizar, ni con `puede_crear: false`.
- No calcular precios, divisiones, estados del pedido padre, ni ingresos en el navegador.
- No mostrar opciones de cancelar/reprogramar a roles que no son gestor o administrador, ni reembolsar a quien no es administrador.
- No mostrar al rol `cliente` el mapa del personal, el calendario, `/seguimiento/flota`, `/seguimiento/vehiculo`, `/seguimiento/codigo`, `/seguimiento/envio/...`, `/telemetria` ni `/simulaciones` (el gateway responde 403). Su seguimiento va solo por `/seguimiento/cliente/envio/{id}`.
- No ofrecer acciones sobre un pedido dividido que corresponden a sus partes, ni al revés.
- No presentar pagos como reales: son simulados, y las entregas también (`simulada: true`).
- No asumir que un 404 de seguimiento es un fallo (`SIN_VIAJE` es normal).
- No inventar estados distintos a los de la sección 4.
- No agregar funciones que el backend no tenga (consolidar cargas en un vehículo en tránsito, reembolso parcial, pasarela de pagos, turnos de conductores, notificaciones para clientes): están fuera de alcance.

---

## 11. Orden de construcción sugerido

1. Login, guardado de sesión, `GET /auth/me`, manejo de 401/403 y menú por rol.
2. Cliente HTTP único (base URL, token, manejo de errores y reintentos para 503/504).
3. Envíos: lista, detalle, línea de tiempo; luego el flujo cotizar → crear.
4. Pedidos divididos y programación (calendario, cancelar, reprogramar).
5. Mapa de seguimiento.
6. Catálogos y administración de flota (vehículos, conductores, clientes, ubicaciones).
7. Cobros del cliente y panel de cobros/reembolsos del administrador.
8. Dashboard e ingresos.
9. Aduanas, mantenimiento y notificaciones.

---

## 12. Datos para pruebas

- URL base local del gateway: `http://localhost:8002/api/v1`. Documentación interactiva: `{gateway}/docs`. Estado de los servicios (administrador): `GET /estado`.
- Las cuentas de prueba las crea el administrador con `POST /usuarios`; nunca escribas contraseñas reales en el código ni en el repositorio.
- El script `_pruebas/casos.py` (con `GATEWAY_URL` apuntando al gateway) es un ejemplo ejecutable de cada flujo de este texto.
