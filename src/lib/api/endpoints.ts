/**
 * Las rutas públicas del API Gateway (contrato, secciones 5.7 y 9), agrupadas por microservicio.
 * Cada función corresponde a exactamente una ruta. Nada fuera de `/api/v1` excepto `/health`.
 * Las rutas internas que el gateway bloquea (POST /reservas, POST /reservas/liberar, POST /rutas,
 * POST /telemetria) no aparecen aquí a propósito.
 */
import type * as T from '@/lib/types/api';
import { http, seg } from './http';

type S = { signal?: AbortSignal };

// ---------- Gateway ----------
export const gateway = {
  /** GET /health (fuera de /api/v1) */
  health: (o?: S) => http.get<{ status: string; service: string }>('/health', { ...o, raiz: true }),
  /** GET /estado */
  estado: (o?: S) => http.get<T.EstadoSistema>('/estado', o),
};

// ---------- Autenticación (fase 2) ----------
export const auth = {
  /** POST /auth/login: la única ruta pública. Se reintenta si el backend está despertando. */
  login: (email: string, password: string) =>
    http.post<T.RespuestaLogin>('/auth/login', { email, password }, { publica: true, reintentarArranque: true, timeoutMs: 70000 }),
  /** GET /auth/me: usuario de la sesión (rol para el menú). */
  yo: (o?: S) => http.get<T.Usuario>('/auth/me', { ...o, timeoutMs: 70000 }),
};

// ---------- Shipment · Usuarios (solo administrador) ----------
export const usuarios = {
  listar: (q: { rol?: string; limite?: number } = {}, o?: S) => http.get<T.Usuario[]>('/usuarios', { ...o, query: q }),
  crear: (body: T.UsuarioCrear) => http.post<T.Usuario>('/usuarios', body),
  actualizar: (id: string, body: T.UsuarioActualizar) => http.patch<T.Usuario>(`/usuarios/${seg(id)}`, body),
  /** Registro autorizado por un administrador: usa SU token (de un solo uso) y no la sesión abierta. */
  crearConAutorizacion: (body: T.UsuarioCrear, tokenAdministrador: string) =>
    http.post<T.Usuario>('/usuarios', body, { publica: true, headers: { Authorization: `Bearer ${tokenAdministrador}` } }),
};

// ---------- Shipment · Clientes ----------
export const clientes = {
  listar: (q: { q?: string; activo?: boolean; limite?: number } = {}, o?: S) =>
    http.get<T.Cliente[]>('/clientes', { ...o, query: q }),
  crear: (body: T.ClienteCrear) => http.post<T.Cliente>('/clientes', body),
  porCodigo: (codigo: number, o?: S) => http.get<T.Cliente>(`/clientes/codigo/${seg(codigo)}`, o),
  obtener: (id: string, o?: S) => http.get<T.Cliente>(`/clientes/${seg(id)}`, o),
  actualizar: (id: string, body: T.ClienteActualizar) => http.patch<T.Cliente>(`/clientes/${seg(id)}`, body),
};

// ---------- Routing · Ubicaciones ----------
export const ubicaciones = {
  listar: (
    q: { q?: string; pais?: string; tipo?: string; incluir_inactivas?: boolean; limite?: number } = {},
    o?: S,
  ) => http.get<T.Ubicacion[]>('/ubicaciones', { ...o, query: q }),
  crear: (body: T.UbicacionCrear) => http.post<T.Ubicacion>('/ubicaciones', body),
  paises: (o?: S) => http.get<T.PaisResumen[]>('/ubicaciones/paises', o),
  porCodigo: (codigo: string, o?: S) => http.get<T.Ubicacion>(`/ubicaciones/codigo/${seg(codigo)}`, o),
  obtener: (id: string, o?: S) => http.get<T.Ubicacion>(`/ubicaciones/${seg(id)}`, o),
  actualizar: (id: string, body: T.UbicacionActualizar) =>
    http.patch<T.Ubicacion>(`/ubicaciones/${seg(id)}`, body),
};

// ---------- Fleet · Vehículos ----------
export const vehiculos = {
  listar: (o?: S) => http.get<T.Vehiculo[]>('/vehiculos', o),
  crear: (body: T.VehiculoCrear) => http.post<T.Vehiculo>('/vehiculos', body),
  porPlaca: (placa: string, o?: S) => http.get<T.Vehiculo>(`/vehiculos/placa/${seg(placa)}`, o),
  obtener: (id: string, o?: S) => http.get<T.Vehiculo>(`/vehiculos/${seg(id)}`, o),
  actualizar: (id: string, body: T.VehiculoActualizar) => http.patch<T.Vehiculo>(`/vehiculos/${seg(id)}`, body),
  cambiarEstado: (id: string, estado: T.EstadoVehiculo) =>
    http.patch<T.Vehiculo>(`/vehiculos/${seg(id)}/estado`, { estado }),
};

// ---------- Fleet · Conductores ----------
export const conductores = {
  listar: (o?: S) => http.get<T.Conductor[]>('/conductores', o),
  crear: (body: T.ConductorCrear) => http.post<T.Conductor>('/conductores', body),
  auditoriaVinculos: (o?: S) => http.get<T.AuditoriaVinculo[]>('/conductores/auditoria-vinculos', o),
  porCodigo: (codigo: number, o?: S) => http.get<T.Conductor>(`/conductores/codigo/${seg(codigo)}`, o),
  obtener: (id: string, o?: S) => http.get<T.Conductor>(`/conductores/${seg(id)}`, o),
  actualizar: (id: string, body: T.ConductorActualizar) =>
    http.patch<T.Conductor>(`/conductores/${seg(id)}`, body),
  vincularVehiculo: (id: string, vehiculo_id: string) =>
    http.put<T.Conductor>(`/conductores/${seg(id)}/vehiculo`, { vehiculo_id }),
};

// ---------- Fleet · Viabilidad y reservas ----------
export const flota = {
  viabilidad: (body: T.ViabilidadSolicitud, o?: S) => http.post<T.Viabilidad>('/viabilidad', body, o),
  reservaDeEnvio: (envioId: string, o?: S) => http.get<T.ReservaFlota>(`/reservas/envio/${seg(envioId)}`, o),
};

// ---------- Shipment · Envíos ----------
export const envios = {
  listar: (q: { estado?: string; cliente_id?: string; solo_pedidos?: boolean; envio_padre_id?: string } = {}, o?: S) =>
    http.get<T.Envio[]>('/envios', { ...o, query: q }),
  /** POST /envios/cotizar: mismo cuerpo que crear; no crea nada. Puede tardar si la ruta es nueva. */
  cotizar: (body: T.EnvioCrear, o?: S) => http.post<T.Cotizacion>('/envios/cotizar', body, { ...o, timeoutMs: 70000 }),
  /** `clave`: la misma en reintentos del mismo clic (si el backend la usa, nunca crea dos envíos con ella). */
  crear: (body: T.EnvioCrear, clave?: string) =>
    http.post<T.Envio>('/envios', body, { timeoutMs: 70000, ...(clave ? { headers: { 'Idempotency-Key': clave } } : {}) }),
  /** Partes de un pedido dividido, de la más pesada a la más liviana. */
  partes: (id: string, o?: S) => http.get<T.Envio[]>(`/envios/${seg(id)}/partes`, o),
  programados: (q: { desde?: string; hasta?: string; incluir_activados?: boolean; limite?: number } = {}, o?: S) =>
    http.get<T.Envio[]>('/envios/programados', { ...o, query: q }),
  cancelar: (id: string, motivo?: string | null) =>
    http.post<T.Envio>(`/envios/${seg(id)}/cancelar`, { motivo: motivo || null }),
  reprogramar: (id: string, body: T.EnvioReprogramar) => http.patch<T.Envio>(`/envios/${seg(id)}/reprogramar`, body),
  porCodigo: (codigo: string, o?: S) => http.get<T.Envio>(`/envios/codigo/${seg(codigo)}`, o),
  obtener: (id: string, o?: S) => http.get<T.Envio>(`/envios/${seg(id)}`, o),
  eventos: (id: string, o?: S) => http.get<T.EnvioEvento[]>(`/envios/${seg(id)}/eventos`, o),
  pruebaEntrega: (id: string, o?: S) => http.get<T.PruebaEntrega>(`/envios/${seg(id)}/prueba-entrega`, o),
  registrarPruebaEntrega: (id: string, body: T.PruebaEntregaCrear) =>
    http.post<T.PruebaEntrega>(`/envios/${seg(id)}/prueba-entrega`, body),
  reintentarAsignacion: (id: string) =>
    http.post<T.ReintentoAsignacion>(`/envios/${seg(id)}/reintentar-asignacion`),
  cambiarEstado: (id: string, estado: T.EstadoManualEnvio, notas?: string | null) =>
    http.patch<T.Envio>(`/envios/${seg(id)}/estado`, { estado, notas: notas || null }),
};

// ---------- Routing · Rutas maestras ----------
export const rutasMaestras = {
  calcular: (body: T.RutaMaestraCalcular) => http.post<T.RutaMaestra>('/rutas-maestras/calcular', body),
  listar: (q: { origen_codigo?: string; destino_codigo?: string; fuente?: string; limite?: number } = {}, o?: S) =>
    http.get<T.RutaMaestra[]>('/rutas-maestras', { ...o, query: q }),
  porCodigo: (codigo: string, o?: S) => http.get<T.RutaMaestra>(`/rutas-maestras/codigo/${seg(codigo)}`, o),
  obtener: (id: string, o?: S) => http.get<T.RutaMaestra>(`/rutas-maestras/${seg(id)}`, o),
  geometria: (id: string, o?: S) => http.get<T.GeometriaRuta>(`/rutas-maestras/${seg(id)}/geometria`, o),
  recalcular: (id: string) => http.post<T.RutaMaestra>(`/rutas-maestras/${seg(id)}/recalcular`),
};

// ---------- Routing · Rutas de envío ----------
export const rutas = {
  listar: (q: { envio_id?: string; estado?: string } = {}, o?: S) => http.get<T.Ruta[]>('/rutas', { ...o, query: q }),
  obtener: (id: string, o?: S) => http.get<T.Ruta>(`/rutas/${seg(id)}`, o),
  historial: (id: string, o?: S) => http.get<T.HistorialRuta[]>(`/rutas/${seg(id)}/historial`, o),
  recalcular: (id: string, body: T.RutaRecalcular) => http.patch<T.Ruta>(`/rutas/${seg(id)}/recalcular`, body),
};

// ---------- Routing · Asignaciones ----------
export const asignaciones = {
  reintentarTodas: () => http.post<T.ResumenBarrido>('/asignaciones/reintentar'),
  reintentarEnvio: (envioId: string) => http.post<T.Ruta>(`/asignaciones/envio/${seg(envioId)}/reintentar`),
};

// ---------- Tracking · Seguimiento ----------
export const seguimiento = {
  flota: (o?: S) => http.get<T.SeguimientoResumen[]>('/seguimiento/flota', o),
  porCodigo: (codigo: string, o?: S) => http.get<T.Seguimiento>(`/seguimiento/codigo/${seg(codigo)}`, o),
  porVehiculo: (vehiculoId: string, o?: S) => http.get<T.Seguimiento>(`/seguimiento/vehiculo/${seg(vehiculoId)}`, o),
  porEnvio: (envioId: string, o?: S) => http.get<T.Seguimiento>(`/seguimiento/envio/${seg(envioId)}`, o),
  trazado: (envioId: string, o?: S) => http.get<T.Trazado>(`/seguimiento/envio/${seg(envioId)}/trazado`, o),
  recorrido: (envioId: string, limite = 500, o?: S) =>
    http.get<T.RecorridoPunto[]>(`/seguimiento/envio/${seg(envioId)}/recorrido`, { ...o, query: { limite } }),
};

// ---------- Tracking · Simulaciones ----------
export const simulaciones = {
  listar: (q: { estado?: string; limite?: number } = {}, o?: S) =>
    http.get<T.Simulacion[]>('/simulaciones', { ...o, query: q }),
  deEnvio: (envioId: string, o?: S) => http.get<T.Simulacion>(`/simulaciones/envio/${seg(envioId)}`, o),
  eventos: (envioId: string, o?: S) =>
    http.get<T.SimulacionEvento[]>(`/simulaciones/envio/${seg(envioId)}/eventos`, o),
};

// ---------- Tracking · Telemetría ----------
export const telemetria = {
  lecturas: (vehiculoId: string, q: { desde?: string; hasta?: string; limite?: number } = {}, o?: S) =>
    http.get<T.LecturaTelemetria[]>(`/telemetria/${seg(vehiculoId)}`, { ...o, query: q }),
};

// ---------- Maintenance ----------
export const mantenimiento = {
  crearPrograma: (body: T.ProgramaCrear) => http.post<T.ProgramaMantenimiento>('/programas', body),
  programas: (vehiculoId: string, o?: S) => http.get<T.ProgramaMantenimiento[]>(`/programas/${seg(vehiculoId)}`, o),
  crearIntervencion: (body: T.IntervencionCrear) => http.post<T.Intervencion>('/intervenciones', body),
  intervenciones: (vehiculoId: string, o?: S) =>
    http.get<T.Intervencion[]>(`/intervenciones/${seg(vehiculoId)}`, o),
};

// ---------- Customs ----------
export const aduanas = {
  listar: (q: { estado?: string } = {}, o?: S) =>
    http.get<T.DeclaracionAduanera[]>('/declaraciones', { ...o, query: q }),
  deEnvio: (envioId: string, o?: S) => http.get<T.DeclaracionAduanera>(`/declaraciones/${seg(envioId)}`, o),
  cambiarEstado: (declaracionId: string, estado: T.EstadoDeclaracion, motivo_retencion?: string | null) =>
    http.patch<T.DeclaracionAduanera>(`/declaraciones/${seg(declaracionId)}/estado`, {
      estado,
      motivo_retencion: motivo_retencion || null,
    }),
};

// ---------- Notification ----------
export const notificaciones = {
  listar: (limite = 50, o?: S) => http.get<T.Notificacion[]>('/notificaciones', { ...o, query: { limite } }),
  preferencia: (clienteId: string, o?: S) =>
    http.get<T.PreferenciaNotificacion>(`/preferencias/${seg(clienteId)}`, o),
  guardarPreferencia: (clienteId: string, body: { idioma: T.Idioma; canal_preferido: T.Canal | null }) =>
    http.post<T.PreferenciaNotificacion>(`/preferencias/${seg(clienteId)}`, body),
};

// ---------- Billing ----------
export const facturacion = {
  definirTarifa: (body: T.TarifaCrear) => http.post<T.Tarifa>('/tarifas', body),
  tarifa: (clienteId: string, o?: S) => http.get<T.Tarifa>(`/tarifas/${seg(clienteId)}`, o),
  costosRuta: (q: { envio_id?: string } = {}, o?: S) => http.get<T.CostoRuta[]>('/costos-ruta', { ...o, query: q }),
  facturas: (q: { cliente_id?: string; periodo?: string; estado?: string } = {}, o?: S) =>
    http.get<T.Factura[]>('/facturas', { ...o, query: q }),
  factura: (id: string, o?: S) => http.get<T.Factura>(`/facturas/${seg(id)}`, o),
  cerrarPeriodo: () => http.post<T.Factura[]>('/facturas/cerrar-periodo'),
};

// ---------- Billing · Cobro por pedido (fase 2) ----------
type Pagina = { limite?: number; offset?: number };
export const cobros = {
  pagos: (q: { cliente_id?: string; estado?: string; envio_id?: string } & Pagina = {}, o?: S) =>
    http.get<T.Pago[]>('/pagos', { ...o, query: q }),
  porReembolsar: (q: Pagina = {}, o?: S) => http.get<T.PagoPorReembolsar[]>('/pagos/por-reembolsar', { ...o, query: q }),
  pagoDeEnvio: (envioId: string, o?: S) => http.get<T.Pago>(`/pagos/envio/${seg(envioId)}`, o),
  pago: (id: string, o?: S) => http.get<T.Pago>(`/pagos/${seg(id)}`, o),
  reembolsar: (id: string, nota?: string | null) =>
    http.post<T.Pago>(`/pagos/${seg(id)}/reembolsar`, nota ? { nota } : undefined),
  facturas: (q: { cliente_id?: string; desde?: string; hasta?: string; estado?: string } & Pagina = {}, o?: S) =>
    http.get<T.FacturaPedido[]>('/facturas-pedido', { ...o, query: q }),
  facturaDeEnvio: (envioId: string, o?: S) => http.get<T.FacturaPedido>(`/facturas-pedido/envio/${seg(envioId)}`, o),
  cotizaciones: (q: { cliente_id?: string; limite?: number } = {}, o?: S) =>
    http.get<T.CotizacionGuardada[]>('/cotizaciones', { ...o, query: q }),
};

// ---------- Analytics ----------
export const analitica = {
  resumen: (o?: S) => http.get<T.ResumenEjecutivo>('/dashboard/resumen', o),
  entregasDiarias: (dias = 30, o?: S) =>
    http.get<T.EntregasDiarias[]>('/dashboard/entregas-diarias', { ...o, query: { dias } }),
  utilizacionFlota: (o?: S) => http.get<T.UtilizacionFlota[]>('/dashboard/utilizacion-flota', o),
  costoPorKm: (o?: S) => http.get<T.CostoPorKm[]>('/dashboard/costo-por-km', o),
  eficienciaCombustible: (limite = 50, o?: S) =>
    http.get<T.EficienciaCombustible[]>('/dashboard/eficiencia-combustible', { ...o, query: { limite } }),
  proyeccionMantenimiento: (q: { dias?: number; todos?: boolean } = {}, o?: S) =>
    http.get<T.ProyeccionMantenimiento[]>('/dashboard/proyeccion-mantenimiento', { ...o, query: q }),
  actividadReciente: (limite = 20, o?: S) =>
    http.get<T.ActividadReciente[]>('/dashboard/actividad-reciente', { ...o, query: { limite } }),
  ejecutarEtl: () => http.post<T.ResultadoEtl>('/etl/ejecutar', undefined, { timeoutMs: 120000 }),
  ingresosMensual: (anio?: number, o?: S) =>
    http.get<T.IngresoPeriodo[]>('/dashboard/ingresos/mensual', { ...o, query: { anio } }),
  ingresosAnual: (o?: S) => http.get<T.IngresoPeriodo[]>('/dashboard/ingresos/anual', o),
  ingresosPedidos: (q: { mes?: string; estado?: string; cliente_id?: string } & Pagina = {}, o?: S) =>
    http.get<T.IngresoPedido[]>('/dashboard/ingresos/pedidos', { ...o, query: q }),
};
