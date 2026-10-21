/**
 * Tipos de las respuestas y cuerpos del API Gateway de LogiTrack.
 * Fuente: Claude outputs/CONTRATO_API.md (sección 7) verificada contra los esquemas Pydantic
 * de cada microservicio. Los decimales de Fleet, Shipment, Routing, Billing y Maintenance
 * llegan como texto (`"800.00"`); se representan como `Decimal` y se convierten al mostrarlos.
 */

/** Decimal serializado como texto por Pydantic (a veces número). */
export type Decimal = string | number;
export type UUID = string;
/** Fecha-hora ISO 8601 (UTC). */
export type ISODateTime = string;
/** Fecha ISO `YYYY-MM-DD`. */
export type ISODate = string;

// ---------- Gateway ----------

export type EstadoServicio = 'ok' | 'con_error' | 'sin_respuesta' | 'sin_configurar';
export type NombreServicio =
  | 'fleet'
  | 'shipment'
  | 'routing'
  | 'tracking'
  | 'maintenance'
  | 'customs'
  | 'notification'
  | 'billing'
  | 'analytics';

export interface EstadoSistema {
  estado_general: 'ok' | 'degradado';
  servicios: Partial<Record<NombreServicio, { estado: EstadoServicio; ms?: number }>>;
}

// ---------- Clientes (Shipment) ----------

export type TipoDocumento = 'CC' | 'CE' | 'NIT' | 'PAS';

export interface Cliente {
  id: UUID;
  codigo_cliente: number;
  nombre: string;
  tipo_documento: string | null;
  numero_documento: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  es_historico: boolean;
  creado_en: ISODateTime;
}

export interface ClienteCrear {
  nombre: string;
  tipo_documento: TipoDocumento;
  numero_documento: string;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
}

export type ClienteActualizar = Partial<ClienteCrear> & { activo?: boolean | null };

// ---------- Ubicaciones (Routing) ----------

export type TipoUbicacion = 'ciudad' | 'capital' | 'puerto';

export interface Ubicacion {
  id: UUID;
  codigo: string;
  nombre: string;
  departamento: string;
  pais: string;
  codigo_pais: string;
  latitud: number;
  longitud: number;
  tipo: string;
  activo: boolean;
  etiqueta: string;
}

export interface UbicacionCrear {
  nombre: string;
  departamento: string;
  pais: string;
  codigo_pais: string;
  latitud: number;
  longitud: number;
  tipo?: TipoUbicacion;
  codigo?: string | null;
}

export interface UbicacionActualizar {
  departamento?: string | null;
  tipo?: TipoUbicacion | null;
  activo?: boolean | null;
}

export interface PaisResumen {
  codigo_pais: string;
  pais: string;
  total: number;
}

// ---------- Flota (Fleet) ----------

export type TipoVehiculo = 'furgoneta' | 'camion' | 'tractocamion';
export type EstadoVehiculo = 'active' | 'en_transito' | 'en_mantenimiento' | 'fuera_de_servicio';
export type TipoCombustible = 'diesel' | 'gasolina' | 'gnv';
export type EstadoConductor = 'available' | 'en_ruta';
export type CategoriaLicencia = 'B1' | 'B2' | 'B3' | 'C1' | 'C2' | 'C3';

export interface Vehiculo {
  id: UUID;
  placa: string;
  tipo: string;
  capacidad_kg: Decimal;
  capacidad_m3: Decimal | null;
  anio: number | null;
  vencimiento_seguro: ISODate | null;
  estado: string;
  capacidad_refrigeracion: boolean;
  certificado_hazmat: boolean;
  capacidad_tanque_l: Decimal | null;
  consumo_km_por_litro: Decimal | null;
  tipo_combustible: string | null;
}

export interface VehiculoCrear {
  placa: string;
  tipo: TipoVehiculo;
  capacidad_kg: number;
  capacidad_m3?: number | null;
  anio?: number | null;
  vencimiento_seguro?: ISODate | null;
  estado?: EstadoVehiculo;
  capacidad_refrigeracion?: boolean;
  certificado_hazmat?: boolean;
  capacidad_tanque_l?: number | null;
  consumo_km_por_litro?: number | null;
  tipo_combustible?: TipoCombustible | null;
}

export type VehiculoActualizar = Partial<Omit<VehiculoCrear, 'placa' | 'estado'>>;

export interface Conductor {
  id: UUID;
  codigo_conductor: number;
  nombre: string;
  licencia_numero: string;
  categorias_licencia: string | null;
  certificacion_hazmat: boolean;
  anios_experiencia: number;
  vehiculo_id: UUID | null;
  horas_semanales: Decimal;
  estado: string;
}

export interface ConductorCrear {
  nombre: string;
  licencia_numero: string;
  categorias_licencia?: string | null;
  certificacion_hazmat?: boolean;
  anios_experiencia?: number;
  vehiculo_id?: UUID | null;
  horas_semanales?: number;
}

export interface ConductorActualizar {
  nombre?: string | null;
  categorias_licencia?: string | null;
  certificacion_hazmat?: boolean | null;
  anios_experiencia?: number | null;
  horas_semanales?: number | null;
}

export interface AuditoriaVinculo {
  codigo_conductor: number;
  nombre: string;
  placa: string;
  tipo: string;
  valido: boolean;
  errores: string[];
}

export type TipoCarga = 'general' | 'refrigerada';

export interface ViabilidadSolicitud {
  peso_kg: number;
  volumen_m3?: number | null;
  tipo_carga?: TipoCarga;
  es_hazmat?: boolean;
  es_divisible?: boolean;
}

export type CausaInviabilidad =
  | 'SIN_FLOTA_OPERATIVA'
  | 'CAPACIDAD_EXCEDIDA'
  | 'VOLUMEN_EXCEDIDO'
  | 'SIN_REFRIGERACION'
  | 'SIN_HABILITACION_HAZMAT';

export interface Viabilidad {
  viable: boolean;
  causa: CausaInviabilidad | null;
  mensaje: string | null;
  compatibles: number;
  disponibles_ahora: number;
}

export interface ReservaFlota {
  reserva_id: UUID;
  envio_id: UUID;
  estado: 'reservada' | 'liberada' | string;
  ya_existia?: boolean;
  vehiculo: { id: UUID; placa: string; tipo: string; capacidad_kg: number };
  conductor: { id: UUID; codigo_conductor: number; nombre: string };
  creado_en: ISODateTime | null;
  liberado_en: ISODateTime | null;
}

// ---------- Envíos (Shipment) ----------

export type EstadoEnvio =
  | 'programado'
  | 'pendiente'
  | 'sin_asignacion'
  | 'asignado'
  | 'en_transito'
  | 'con_incidencia'
  | 'retenido_aduana'
  | 'entregado'
  | 'devuelto'
  | 'cancelado';

export interface Envio {
  id: UUID;
  codigo_envio: string;
  cliente_id: UUID;
  codigo_cliente: number | null;
  origen: string;
  destino: string;
  origen_id: UUID | null;
  destino_id: UUID | null;
  codigo_pais_origen: string | null;
  codigo_pais_destino: string | null;
  estado: string;
  fecha_limite_sla: ISODateTime | null;
  es_internacional: boolean;
  tipo_carga: string;
  es_hazmat: boolean;
  peso_kg: Decimal;
  volumen_m3: Decimal | null;
  ruta_maestra_id: UUID | null;
  codigo_ruta: string | null;
  distancia_km: Decimal | null;
  duracion_horas: Decimal | null;
  vehiculo_id: UUID | null;
  ruta_id: UUID | null;
  placa_vehiculo: string | null;
  tipo_vehiculo: string | null;
  conductor_id: UUID | null;
  conductor_nombre: string | null;
  codigo_conductor: number | null;
  hora_estimada_llegada: ISODateTime | null;
  motivo_sin_asignacion: string | null;
  /** En una parte de un pedido dividido: el id del pedido (padre). */
  envio_padre_id?: UUID | null;
  /** Número de la parte (1 = la más pesada). */
  parte_numero?: number | null;
  /** En el pedido (padre): cuántas partes tiene. `null` en un envío normal. */
  partes_total?: number | null;
  partes_entregadas?: number | null;
  es_divisible?: boolean;
  fecha_programada?: ISODateTime | null;
  /** Precio del pedido en COP (solo el padre o un envío sin dividir; las partes lo traen null). */
  monto_cop?: Decimal | null;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

export interface EnvioCrear {
  cliente_id?: UUID | null;
  codigo_cliente?: number | null;
  origen_id?: UUID | null;
  origen_codigo?: string | null;
  destino_id?: UUID | null;
  destino_codigo?: string | null;
  fecha_limite_sla?: ISODateTime | null;
  peso_kg: number;
  volumen_m3?: number | null;
  tipo_carga?: TipoCarga;
  es_hazmat?: boolean;
  es_divisible?: boolean;
  /** Futura; sin zona horaria se interpreta como hora de Colombia. El envío queda `programado`. */
  fecha_programada?: string | null;
  /** El `monto_cop` de POST /envios/cotizar (se exige cuando el cobro está activo). */
  monto_aceptado_cop?: number | null;
}

/** Una parte del plan de división (el backend puede mandar solo el peso o un objeto). */
export type PartePlan = number | string | { peso_kg?: Decimal; peso?: Decimal; parte_numero?: number; capacidad_kg?: Decimal; capacidad_vehiculo_kg?: Decimal; [k: string]: unknown };

export interface ViabilidadCotizacion {
  viable: boolean;
  causa: string | null;
  mensaje: string | null;
  requiere_division?: boolean;
  division_posible?: boolean;
  capacidad_maxima_kg?: Decimal | null;
  partes?: PartePlan[] | null;
  desperdicio_kg?: Decimal | null;
}

export interface DesgloseCotizacion {
  base_cop?: Decimal;
  toneladas?: Decimal;
  distancia_km?: Decimal;
  cop_por_ton_km?: Decimal;
  variable_cop?: Decimal;
  minimo_cop?: Decimal;
  aplico_minimo?: boolean;
}

/** Respuesta de POST /envios/cotizar (contrato 9.4). No crea nada. */
export interface Cotizacion {
  origen: string | null;
  destino: string | null;
  codigo_ruta: string | null;
  distancia_km: Decimal | null;
  duracion_horas: Decimal | null;
  es_internacional: boolean | null;
  peso_kg: Decimal;
  es_divisible: boolean;
  fecha_programada: ISODateTime | null;
  monto_cop: Decimal | null;
  moneda: 'COP' | string;
  cotizacion: { cotizacion_id: UUID; monto_cop: Decimal; moneda: string; desglose?: DesgloseCotizacion | null } | null;
  viabilidad: ViabilidadCotizacion | null;
  puede_crear: boolean;
  aviso: string | null;
  facturacion_activa: boolean;
}

export interface EnvioCancelar {
  motivo?: string | null;
}

export interface EnvioReprogramar {
  fecha_programada: string;
  motivo?: string | null;
}

export type EstadoManualEnvio = 'en_transito' | 'con_incidencia' | 'devuelto';

export interface EnvioEvento {
  id: UUID;
  tipo_evento: string;
  notas: string | null;
  fecha_hora: ISODateTime;
}

export interface PruebaEntrega {
  id: UUID;
  envio_id: UUID;
  url_firma: string | null;
  url_foto: string | null;
  nombre_receptor: string;
  entregado_en: ISODateTime;
  simulada: boolean;
}

export interface PruebaEntregaCrear {
  nombre_receptor: string;
  url_firma?: string | null;
  url_foto?: string | null;
}

export interface ReintentoAsignacion {
  envio_id: UUID;
  codigo_envio: string;
  estado_asignacion: string | null;
  detalle: string | null;
  nota: string;
}

// ---------- Rutas (Routing) ----------

export interface ParadaMaestra {
  nombre?: string | null;
  codigo?: string | null;
  km_desde_origen?: number | null;
  latitud?: number | null;
  longitud?: number | null;
  [k: string]: unknown;
}

export interface RutaMaestra {
  id: UUID;
  codigo_ruta: string;
  origen: Ubicacion;
  destino: Ubicacion;
  distancia_km: number;
  duracion_horas: number;
  fuente: 'osrm' | 'estimada' | string;
  estimada: boolean;
  paradas: ParadaMaestra[] | null;
  calculada_en: ISODateTime;
  actualizado_en: ISODateTime;
}

export interface GeometriaRuta {
  codigo_ruta: string;
  fuente: string;
  num_puntos: number;
  polyline: string;
  puntos: [number, number][];
}

export interface RutaMaestraCalcular {
  origen_id?: UUID | null;
  origen_codigo?: string | null;
  destino_id?: UUID | null;
  destino_codigo?: string | null;
}

export type EstadoRuta =
  | 'sin_asignacion'
  | 'asignada'
  | 'en_curso'
  | 'finalizada'
  | 'por_liberar'
  | 'cancelada'
  | 'historica'
  | 'manual';

export interface ParadaRuta {
  tipo?: 'origen' | 'parada' | 'destino' | string;
  lugar?: string | null;
  km_desde_origen?: number | null;
  latitud?: number | null;
  longitud?: number | null;
  [k: string]: unknown;
}

export interface Ruta {
  id: UUID;
  envio_id: UUID;
  estado: string;
  vehiculo_id: UUID | null;
  conductor_id: UUID | null;
  detalle_asignacion: Record<string, unknown> | null;
  ruta_maestra_id: UUID | null;
  codigo_ruta: string | null;
  paradas: ParadaRuta[] | null;
  distancia_km: Decimal | null;
  distancia_planificada_km: Decimal | null;
  hora_estimada_llegada: ISODateTime | null;
  veces_recalculada: number;
  intentos: number;
  ultimo_error: string | null;
  proximo_reintento_en: ISODateTime | null;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

export interface HistorialRuta {
  id: UUID;
  ruta_id: UUID;
  paradas_anteriores: unknown;
  distancia_km_anterior: Decimal | null;
  hora_estimada_llegada_anterior: ISODateTime | null;
  motivo_recalculo: string | null;
  recalculado_en: ISODateTime;
}

export interface RutaRecalcular {
  paradas?: ParadaRuta[] | null;
  distancia_km?: number | null;
  hora_estimada_llegada?: ISODateTime | null;
  motivo_recalculo: string;
}

/** Respuesta libre del barrido general de asignaciones (resumen con conteos). */
export type ResumenBarrido = Record<string, unknown>;

// ---------- Seguimiento y simulación (Tracking) ----------

export type EstadoViaje = 'preparando' | 'en_curso' | 'pausada' | 'finalizada' | 'cancelada';

export interface SeguimientoResumen {
  envio_id: UUID;
  codigo_envio: string | null;
  vehiculo_id: UUID;
  placa: string | null;
  estado: string;
  origen: string | null;
  destino: string | null;
  latitud: number | null;
  longitud: number | null;
  velocidad_actual_kmh: number | null;
  progreso_pct: number;
  combustible_pct: number | null;
  hora_estimada_llegada: ISODateTime | null;
}

export interface PuntoGeo {
  nombre: string | null;
  latitud: number;
  longitud: number;
}

export interface ParadaSeguimiento {
  nombre: string | null;
  km_desde_origen: number;
  latitud: number | null;
  longitud: number | null;
  estado: 'pasada' | 'proxima' | 'pendiente' | string;
}

export interface Seguimiento {
  envio_id: UUID;
  codigo_envio: string | null;
  codigo_ruta: string | null;
  estado_viaje: string;
  mensaje: string;
  factor_tiempo: number;
  vehiculo: { id: UUID; placa: string | null; conductor_id: UUID | null; conductor_nombre: string | null };
  origen: PuntoGeo | null;
  destino: PuntoGeo | null;
  posicion: {
    latitud: number | null;
    longitud: number | null;
    velocidad_kmh: number | null;
    actualizada_en: ISODateTime | null;
  };
  progreso: { porcentaje: number; km_recorridos: number; km_totales: number | null; km_restantes: number | null };
  tiempos: {
    iniciado_en: ISODateTime | null;
    hora_estimada_llegada: ISODateTime | null;
    llegada_en: ISODateTime | null;
    segundos_restantes: number | null;
  };
  combustible: {
    nivel_pct: number | null;
    litros: number | null;
    capacidad_l: number | null;
    autonomia_km: number | null;
    recargas: number;
    litros_recargados: number;
    estimado: boolean;
  };
  parada_actual: { en_parada: boolean; motivo: string | null; hasta: ISODateTime | null };
  siguiente_parada: { nombre?: string | null; km_desde_origen?: number | null } | null;
  paradas: ParadaSeguimiento[];
}

export interface Trazado {
  envio_id: UUID;
  codigo_envio: string | null;
  codigo_ruta: string | null;
  distancia_km: number | null;
  origen: PuntoGeo;
  destino: PuntoGeo;
  puntos: number[][];
  paradas: ParadaSeguimiento[];
}

export interface RecorridoPunto {
  tiempo: ISODateTime;
  latitud: number;
  longitud: number;
  velocidad_kmh: number | null;
  nivel_combustible_pct: number | null;
  kilometraje_acumulado_km: number | null;
}

export interface Simulacion {
  id: UUID;
  envio_id: UUID;
  codigo_envio: string | null;
  ruta_id: UUID;
  vehiculo_id: UUID;
  conductor_id: UUID | null;
  placa: string | null;
  conductor_nombre: string | null;
  origen: string | null;
  destino: string | null;
  tipo_carga: string | null;
  codigo_ruta: string | null;
  estado: string;
  progreso_pct: number;
  km_recorridos: number;
  distancia_total_km: number | null;
  duracion_horas: number | null;
  velocidad_actual_kmh: number | null;
  velocidad_promedio_kmh: number | null;
  latitud: number | null;
  longitud: number | null;
  combustible_l: number | null;
  combustible_pct: number | null;
  capacidad_tanque_l: number | null;
  consumo_km_por_litro: number | null;
  autonomia_km: number | null;
  combustible_estimado: boolean;
  litros_recargados: number;
  recargas: number;
  siguiente_parada: Record<string, unknown> | null;
  paradas: Record<string, unknown>[] | null;
  en_parada_hasta: ISODateTime | null;
  motivo_parada: string | null;
  iniciado_en: ISODateTime | null;
  hora_estimada_llegada: ISODateTime | null;
  llegada_en: ISODateTime | null;
  ultima_actualizacion: ISODateTime | null;
  intentos: number;
  ultimo_error: string | null;
}

export interface SimulacionEvento {
  tipo: string;
  descripcion: string | null;
  km: number | null;
  combustible_pct: number | null;
  latitud: number | null;
  longitud: number | null;
  tiempo: ISODateTime;
}

export interface LecturaTelemetria {
  id: number;
  tiempo: ISODateTime;
  vehiculo_id: UUID;
  latitud: Decimal;
  longitud: Decimal;
  velocidad_kmh: Decimal | null;
  nivel_combustible_pct: Decimal | null;
  temperatura_carga_c: Decimal | null;
  kilometraje_acumulado_km: Decimal | null;
  horas_motor: Decimal | null;
  codigo_obd2: string | null;
  temperatura_motor_c: Decimal | null;
}

// ---------- Mantenimiento ----------

export interface ProgramaMantenimiento {
  id: UUID;
  vehiculo_id: UUID;
  tipo: string;
  fecha_vencimiento: ISODateTime | null;
  kilometraje_vencimiento: Decimal | null;
  prioridad: string;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

export interface ProgramaCrear {
  vehiculo_id: UUID;
  tipo: string;
  fecha_vencimiento?: ISODateTime | null;
  kilometraje_vencimiento?: number | null;
  prioridad?: string;
}

export interface Intervencion {
  id: UUID;
  vehiculo_id: UUID;
  tipo: string;
  realizado_en: ISODateTime;
  costo: Decimal | null;
  taller: string | null;
  kilometraje_en_servicio: Decimal | null;
}

export interface IntervencionCrear {
  vehiculo_id: UUID;
  tipo: string;
  costo?: number | null;
  taller?: string | null;
  kilometraje_en_servicio?: number | null;
}

// ---------- Aduanas ----------

export type EstadoDeclaracion = 'pendiente' | 'retenido' | 'aprobado';

/** El servicio genera `{tipo, url}`; el contrato muestra cadenas. Se aceptan ambas formas. */
export type DocumentoAduanero = string | { tipo?: string; url?: string; [k: string]: unknown };

export interface DeclaracionAduanera {
  id: UUID;
  envio_id: UUID;
  pais_origen: string;
  pais_destino: string;
  documentos: DocumentoAduanero[];
  estado: string;
  motivo_retencion: string | null;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

// ---------- Notificaciones ----------

export interface Notificacion {
  id: string;
  destinatario_tipo: string;
  canal: string;
  mensaje: string;
  evento_origen: string;
  referencia: Record<string, unknown>;
  enviado_en: string;
}

export type Idioma = 'es' | 'en';
export type Canal = 'sms' | 'email' | 'push';

export interface PreferenciaNotificacion {
  idioma: Idioma | string;
  canal_preferido: Canal | string | null;
}

// ---------- Facturación ----------

export type ModeloTarifa = 'por_km' | 'por_envio' | 'tarifa_plana';

export interface Tarifa {
  cliente_id: UUID;
  modelo: string;
  valor: Decimal;
}

export interface TarifaCrear {
  cliente_id: UUID;
  modelo: ModeloTarifa;
  valor: number;
}

export interface CostoRuta {
  id: UUID;
  ruta_id: UUID;
  envio_id: UUID;
  distancia_km: Decimal;
  costo_combustible: Decimal;
  costo_peajes: Decimal;
  horas_conductor: Decimal;
  costo_total: Decimal;
  creado_en: ISODateTime;
}

export interface Factura {
  id: UUID;
  cliente_id: UUID;
  periodo: string;
  monto_total: Decimal;
  estado: string;
  creado_en: ISODateTime;
  actualizado_en: ISODateTime;
}

// ---------- Analítica ----------

export interface ResumenEjecutivo {
  total_vehiculos: number;
  vehiculos_en_uso: number;
  flota_disponible: number;
  total_conductores: number;
  total_envios_historico: number;
  envios_en_transito: number;
  envios_entregados_historico: number;
  envios_con_incidencia_historico: number;
  envios_internacionales_retenidos: number;
  tasa_cumplimiento_sla_global_pct: Decimal | null;
  facturacion_periodo_actual: Decimal | null;
  programas_mantenimiento_vencidos: number;
  ultima_actualizacion_etl: ISODateTime | null;
  /** Ingresos netos (cobrado − reembolsos) del mes y del año en curso (fase 2). */
  ingresos_mes_actual_cop?: Decimal | null;
  ingresos_anio_actual_cop?: Decimal | null;
}

export interface EntregasDiarias {
  fecha: ISODate;
  total_creados: number;
  total_entregados: number;
  entregados_a_tiempo: number;
  entregados_tarde: number;
  con_incidencia: number;
  devueltos: number;
  tasa_cumplimiento_sla_pct: Decimal | null;
}

export interface UtilizacionFlota {
  vehiculo_id: UUID;
  placa: string;
  tipo: string;
  en_uso: boolean;
  envio_id_actual: UUID | null;
  estado_envio_actual: string | null;
  actualizado_en: ISODateTime;
}

export interface CostoPorKm {
  tipo_vehiculo: string;
  num_rutas_con_costo: number;
  distancia_total_km: Decimal;
  costo_total: Decimal;
  costo_promedio_por_km: Decimal | null;
  actualizado_en: ISODateTime;
}

export interface EficienciaCombustible {
  conductor_id: UUID;
  nombre_conductor: string;
  vehiculo_id: UUID | null;
  placa_vehiculo: string | null;
  km_recorridos: Decimal | null;
  combustible_consumido_pct: Decimal | null;
  km_por_pct_combustible: Decimal | null;
  clasificacion: string;
  lecturas_analizadas: number;
  actualizado_en: ISODateTime;
}

export interface ProyeccionMantenimiento {
  vehiculo_id: UUID;
  placa_vehiculo: string | null;
  tipo_mantenimiento: string;
  fecha_vencimiento: ISODateTime | null;
  dias_restantes: number | null;
  kilometraje_vencimiento: Decimal | null;
  kilometraje_actual: Decimal | null;
  km_restantes: Decimal | null;
  prioridad_configurada: string;
  urgencia: string;
  actualizado_en: ISODateTime;
}

export interface ActividadReciente {
  tipo_evento: string;
  envio_id: UUID | null;
  vehiculo_id: UUID | null;
  mensaje: string;
  ocurrido_en: ISODateTime;
}

/** Resultado libre del ciclo ETL (registros procesados por tabla). */
export type ResultadoEtl = Record<string, unknown>;

// ---------- Usuarios (Shipment, solo administrador) ----------

export type { Rol } from '@/lib/auth/permisos';
export type { Usuario } from '@/lib/auth/sesion';

export interface UsuarioCrear {
  email: string;
  nombre: string;
  password: string;
  rol: import('@/lib/auth/permisos').Rol;
  cliente_id?: UUID | null;
  codigo_cliente?: number | null;
}

export interface UsuarioActualizar {
  nombre?: string | null;
  password?: string | null;
  activo?: boolean | null;
}

/** POST /auth/registro (público). El administrador no se registra: lo crea otro administrador. */
export type RegistroCuenta =
  | {
      rol: 'cliente';
      nombre: string;
      email: string;
      password: string;
      tipo_documento: TipoDocumento;
      numero_documento: string;
      telefono?: string;
      direccion?: string;
    }
  | {
      rol: 'operador' | 'gestor_flota';
      nombre: string;
      email: string;
      password: string;
      codigo_acceso: string;
    };

export interface RespuestaLogin {
  access_token: string;
  token_type: string;
  expires_in: number;
  usuario: import('@/lib/auth/sesion').Usuario;
}

// ---------- Cobro por pedido (Billing, fase 2) ----------

export type EstadoPago = 'pendiente' | 'confirmado' | 'reembolsado';

export interface Pago {
  id: UUID;
  envio_id: UUID;
  codigo_envio: string | null;
  cliente_id: UUID;
  monto_cop: Decimal;
  moneda: string;
  estado: EstadoPago | string;
  metodo: string;
  referencia: string;
  creado_en: ISODateTime;
  confirmado_en: ISODateTime | null;
  reembolsado_en: ISODateTime | null;
}

export interface PagoPorReembolsar extends Pago {
  motivo: 'cancelado' | 'devuelto' | string | null;
  detalle: string | null;
  solicitado_en: ISODateTime | null;
}

export interface FacturaPedido {
  id: UUID;
  numero: string;
  pago_id: UUID;
  envio_id: UUID;
  codigo_envio: string | null;
  cliente_id: UUID;
  concepto: string;
  monto_cop: Decimal;
  moneda: string;
  estado: 'emitida' | 'anulada' | string;
  emitida_en: ISODateTime;
  anulada_en: ISODateTime | null;
}

/** Cotización registrada (GET /cotizaciones). Los campos exactos dependen del backend. */
export interface CotizacionGuardada {
  id?: UUID;
  cotizacion_id?: UUID;
  cliente_id?: UUID | null;
  envio_id?: UUID | null;
  origen?: string | null;
  destino?: string | null;
  codigo_ruta?: string | null;
  distancia_km?: Decimal | null;
  peso_kg?: Decimal | null;
  monto_cop: Decimal;
  moneda?: string;
  creado_en?: ISODateTime;
  [k: string]: unknown;
}

// ---------- Ingresos (Analytics, solo administrador) ----------

export interface IngresoPeriodo {
  periodo: string;
  pedidos_cobrados: number;
  bruto_cop: Decimal;
  pedidos_reembolsados: number;
  reembolsos_cop: Decimal;
  neto_cop: Decimal;
  ticket_promedio_cop: Decimal | null;
}

export interface IngresoPedido {
  pago_id: UUID;
  envio_id: UUID;
  codigo_envio: string | null;
  cliente_id: UUID;
  monto_cop: Decimal;
  estado_pago: EstadoPago | string;
  factura_numero: string | null;
  factura_estado: string | null;
  confirmado_en: ISODateTime | null;
  reembolsado_en: ISODateTime | null;
}
