import { humanizar as humanizarTexto } from './format';

/**
 * Vocabulario del dominio: etiquetas legibles y tono visual de cada estado que devuelve el backend.
 * Los valores provienen del contrato (sección 3) y del código de cada servicio.
 */

export type Tono = 'neutral' | 'info' | 'primary' | 'ok' | 'warn' | 'danger' | 'muted';

interface Def {
  etiqueta: string;
  tono: Tono;
  ayuda?: string;
}

function buscar(tabla: Record<string, Def>, valor: string | null | undefined): Def {
  if (!valor) return { etiqueta: '—', tono: 'muted' };
  return (
    tabla[valor] ?? {
      etiqueta: valor.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
      tono: 'neutral',
    }
  );
}

export const ESTADOS_ENVIO: Record<string, Def> = {
  programado: { etiqueta: 'Programado', tono: 'info', ayuda: 'Creado para una fecha futura; aún no tiene vehículo.' },
  pendiente: { etiqueta: 'Pendiente', tono: 'neutral', ayuda: 'Recién creado; el sistema busca vehículo.' },
  sin_asignacion: { etiqueta: 'Sin asignación', tono: 'warn', ayuda: 'No había vehículo libre compatible; se reintenta solo.' },
  asignado: { etiqueta: 'Asignado', tono: 'info', ayuda: 'Tiene vehículo, conductor y ETA; el viaje está por empezar.' },
  en_transito: { etiqueta: 'En tránsito', tono: 'primary', ayuda: 'El vehículo está en camino.' },
  con_incidencia: { etiqueta: 'Con incidencia', tono: 'danger', ayuda: 'Marcado manualmente con una incidencia.' },
  retenido_aduana: { etiqueta: 'Retenido en aduana', tono: 'danger', ayuda: 'El viaje está en pausa hasta que Aduanas lo libere.' },
  entregado: { etiqueta: 'Entregado', tono: 'ok', ayuda: 'Terminado, con prueba de entrega.' },
  devuelto: { etiqueta: 'Devuelto', tono: 'muted', ayuda: 'Devuelto; liberó el vehículo.' },
  cancelado: { etiqueta: 'Cancelado', tono: 'muted', ayuda: 'Cancelado antes de que saliera un vehículo.' },
};
export const estadoEnvio = (v?: string | null) => buscar(ESTADOS_ENVIO, v);
export const ESTADOS_ENVIO_LISTA = Object.keys(ESTADOS_ENVIO);

/** Transiciones manuales permitidas (contrato 3.1). */
export const TRANSICIONES_MANUALES: Record<'en_transito' | 'con_incidencia' | 'devuelto', string[]> = {
  en_transito: ['asignado', 'con_incidencia'],
  con_incidencia: ['asignado', 'en_transito'],
  devuelto: ['pendiente', 'sin_asignacion', 'asignado', 'en_transito', 'con_incidencia', 'retenido_aduana'],
};
export const ESTADOS_ENTREGABLES = ['asignado', 'en_transito', 'con_incidencia'];
export const ESTADOS_EN_ESPERA = ['pendiente', 'sin_asignacion'];
export const ESTADOS_FINALES_ENVIO = ['entregado', 'devuelto', 'cancelado'];
/** Se cancela (POST /envios/{id}/cancelar) solo mientras no tenga vehículo en camino. */
export const ESTADOS_CANCELABLES = ['programado', 'pendiente', 'sin_asignacion'];

/** ¿Es el pedido (padre) de una carga dividida? */
export const esPedidoDividido = (e: { partes_total?: number | null }) => (e.partes_total ?? 0) > 0;
/** ¿Es una parte de un pedido dividido? */
export const esParte = (e: { envio_padre_id?: string | null }) => !!e.envio_padre_id;

export const ESTADOS_PAGO: Record<string, Def> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'warn' },
  confirmado: { etiqueta: 'Pagado', tono: 'ok', ayuda: 'Pago simulado confirmado.' },
  reembolsado: { etiqueta: 'Reembolsado', tono: 'muted' },
};
export const estadoPago = (v?: string | null) => buscar(ESTADOS_PAGO, v);

export const ESTADOS_FACTURA_PEDIDO: Record<string, Def> = {
  emitida: { etiqueta: 'Emitida', tono: 'ok' },
  anulada: { etiqueta: 'Anulada', tono: 'muted' },
};
export const estadoFacturaPedido = (v?: string | null) => buscar(ESTADOS_FACTURA_PEDIDO, v);

export const MOTIVOS_REEMBOLSO: Record<string, string> = { cancelado: 'Pedido cancelado', devuelto: 'Pedido devuelto' };

export const ESTADOS_VEHICULO: Record<string, Def> = {
  active: { etiqueta: 'Disponible', tono: 'ok' },
  en_transito: { etiqueta: 'En tránsito', tono: 'primary' },
  en_mantenimiento: { etiqueta: 'En mantenimiento', tono: 'warn' },
  fuera_de_servicio: { etiqueta: 'Fuera de servicio', tono: 'muted' },
};
export const estadoVehiculo = (v?: string | null) => buscar(ESTADOS_VEHICULO, v);
/**
 * Un vehículo sin ubicación base (o con una que Fleet ya no considera confiable) no sale en el mapa
 * y solo se asigna como último recurso: hay que fijarle una desde la lista de ubicaciones.
 */
export function sinUbicacion(v: { latitud?: number | string | null; ubicacion_confiable?: boolean | null }): boolean {
  return v.latitud == null || v.ubicacion_confiable === false;
}

export const FUENTES_UBICACION: Record<string, string> = {
  registro_gestor: 'Fijada por el gestor',
  entrega: 'Al entregar un envío',
  interrupcion: 'Al interrumpirse un viaje',
  telemetria: 'Telemetría',
};

export const ESTADOS_VEHICULO_LISTA = ['active', 'en_transito', 'en_mantenimiento', 'fuera_de_servicio'] as const;

export const ESTADOS_CONDUCTOR: Record<string, Def> = {
  available: { etiqueta: 'Libre', tono: 'ok' },
  en_ruta: { etiqueta: 'En ruta', tono: 'primary' },
};
export const estadoConductor = (v?: string | null) => buscar(ESTADOS_CONDUCTOR, v);

export const TIPOS_VEHICULO: Record<string, string> = {
  furgoneta: 'Furgoneta',
  camion: 'Camión',
  tractocamion: 'Tractocamión',
};
export const tipoVehiculo = (v?: string | null) => (v ? (TIPOS_VEHICULO[v] ?? v) : '—');

export const COMBUSTIBLES: Record<string, string> = { diesel: 'Diésel', gasolina: 'Gasolina', gnv: 'GNV' };
export const CATEGORIAS_LICENCIA = ['B1', 'B2', 'B3', 'C1', 'C2', 'C3'] as const;

/** Reglas de elegibilidad conductor↔vehículo (contrato 5.5; fleet-service/app/elegibilidad.py). */
export const REGLAS_ELEGIBILIDAD: Record<string, { categorias: string[]; anios: number }> = {
  furgoneta: { categorias: ['B1', 'C1', 'B2', 'C2', 'B3', 'C3'], anios: 1 },
  camion: { categorias: ['B2', 'C2', 'B3', 'C3'], anios: 2 },
  tractocamion: { categorias: ['B3', 'C3'], anios: 3 },
};
export const HAZMAT_ANIOS_MINIMOS = 3;

export function erroresElegibilidad(
  vehiculo: { tipo: string; certificado_hazmat: boolean; placa: string },
  conductor: { categorias_licencia: string | null; anios_experiencia: number; certificacion_hazmat: boolean },
): string[] {
  const regla = REGLAS_ELEGIBILIDAD[vehiculo.tipo];
  if (!regla) return [`El tipo «${vehiculo.tipo}» del vehículo ${vehiculo.placa} no es válido.`];
  const errores: string[] = [];
  const cats = new Set(
    (conductor.categorias_licencia ?? '')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean),
  );
  if (!regla.categorias.some((c) => cats.has(c))) {
    errores.push(`Requiere licencia ${regla.categorias.join(', ')}.`);
  }
  if (conductor.anios_experiencia < regla.anios) {
    errores.push(`Requiere al menos ${regla.anios} año(s) de experiencia.`);
  }
  if (vehiculo.certificado_hazmat) {
    if (!conductor.certificacion_hazmat) errores.push('El vehículo es HAZMAT y el conductor no tiene certificación.');
    if (conductor.anios_experiencia < HAZMAT_ANIOS_MINIMOS)
      errores.push(`Un vehículo HAZMAT requiere ${HAZMAT_ANIOS_MINIMOS} años de experiencia.`);
  }
  return errores;
}

export const ESTADOS_RUTA: Record<string, Def> = {
  sin_asignacion: { etiqueta: 'Sin asignación', tono: 'warn' },
  asignada: { etiqueta: 'Asignada', tono: 'info' },
  en_curso: { etiqueta: 'En curso', tono: 'primary' },
  finalizada: { etiqueta: 'Finalizada', tono: 'ok' },
  por_liberar: { etiqueta: 'Por liberar', tono: 'warn' },
  cancelada: { etiqueta: 'Cancelada', tono: 'muted' },
  historica: { etiqueta: 'Histórica', tono: 'muted' },
  manual: { etiqueta: 'Manual', tono: 'neutral' },
};
export const estadoRuta = (v?: string | null) => buscar(ESTADOS_RUTA, v);

export const ESTADOS_VIAJE: Record<string, Def> = {
  sin_viaje: { etiqueta: 'Sin viaje todavía', tono: 'neutral' },
  preparando: { etiqueta: 'Preparando', tono: 'neutral' },
  en_curso: { etiqueta: 'En curso', tono: 'primary' },
  pausada: { etiqueta: 'Pausado por aduana', tono: 'danger' },
  finalizada: { etiqueta: 'Finalizado', tono: 'ok' },
  cancelada: { etiqueta: 'Cancelado', tono: 'muted' },
};
export const estadoViaje = (v?: string | null) => buscar(ESTADOS_VIAJE, v);

export const ESTADOS_DECLARACION: Record<string, Def> = {
  pendiente: { etiqueta: 'Pendiente', tono: 'warn' },
  retenido: { etiqueta: 'Retenido', tono: 'danger' },
  aprobado: { etiqueta: 'Aprobado', tono: 'ok' },
};
export const estadoDeclaracion = (v?: string | null) => buscar(ESTADOS_DECLARACION, v);

export const ESTADOS_FACTURA: Record<string, Def> = {
  abierta: { etiqueta: 'Abierta', tono: 'info' },
  cerrada: { etiqueta: 'Cerrada', tono: 'ok' },
};
export const estadoFactura = (v?: string | null) => buscar(ESTADOS_FACTURA, v);

export const MODELOS_TARIFA: Record<string, { etiqueta: string; unidad: string; ayuda: string }> = {
  por_km: { etiqueta: 'Por kilómetro', unidad: 'COP por km', ayuda: 'Se cobra la distancia de cada envío entregado.' },
  por_envio: { etiqueta: 'Por envío', unidad: 'COP por envío', ayuda: 'Valor fijo por cada envío entregado (modelo por defecto).' },
  tarifa_plana: { etiqueta: 'Tarifa plana', unidad: 'COP por periodo', ayuda: 'Valor fijo que se factura al cerrar el periodo.' },
};

export const PRIORIDADES: Record<string, Def> = {
  baja: { etiqueta: 'Baja', tono: 'neutral' },
  media: { etiqueta: 'Media', tono: 'info' },
  alta: { etiqueta: 'Alta', tono: 'warn' },
  critica: { etiqueta: 'Crítica', tono: 'danger' },
};
export const prioridad = (v?: string | null) => buscar(PRIORIDADES, v);

export const URGENCIAS: Record<string, Def> = {
  vencido: { etiqueta: 'Vencido', tono: 'danger' },
  critico: { etiqueta: 'Crítico', tono: 'danger' },
  proximo: { etiqueta: 'Próximo', tono: 'warn' },
  programado: { etiqueta: 'Programado', tono: 'info' },
  sin_datos_suficientes: { etiqueta: 'Sin datos suficientes', tono: 'muted' },
};
export const urgencia = (v?: string | null) => buscar(URGENCIAS, v);

export const CLASIFICACION_COMBUSTIBLE: Record<string, Def> = {
  eficiente: { etiqueta: 'Eficiente', tono: 'ok' },
  normal: { etiqueta: 'Normal', tono: 'info' },
  ineficiente: { etiqueta: 'Ineficiente', tono: 'danger' },
  sin_datos: { etiqueta: 'Sin datos', tono: 'muted' },
};
export const clasificacionCombustible = (v?: string | null) => buscar(CLASIFICACION_COMBUSTIBLE, v);

export const CANALES: Record<string, string> = { sms: 'SMS', email: 'Correo', push: 'Push' };
export const DESTINATARIOS: Record<string, string> = { cliente: 'Cliente', gestor_flota: 'Gestor de flota' };

export const SERVICIOS: Record<string, { nombre: string; modulo: string }> = {
  fleet: { nombre: 'Flota', modulo: 'Vehículos, conductores, viabilidad y reservas' },
  shipment: { nombre: 'Envíos', modulo: 'Envíos, clientes, usuarios y pruebas de entrega' },
  routing: { nombre: 'Rutas', modulo: 'Ubicaciones, rutas maestras, rutas y asignaciones' },
  tracking: { nombre: 'Seguimiento', modulo: 'Mapa, simulación y telemetría' },
  maintenance: { nombre: 'Mantenimiento', modulo: 'Programas e intervenciones' },
  customs: { nombre: 'Aduanas', modulo: 'Declaraciones aduaneras' },
  notification: { nombre: 'Notificaciones', modulo: 'Bandeja y preferencias' },
  billing: { nombre: 'Facturación', modulo: 'Precios, pagos, facturas, reembolsos, tarifas y costos' },
  analytics: { nombre: 'Analítica', modulo: 'Indicadores, ingresos y ETL' },
};

export const CAUSAS_VIABILIDAD: Record<string, string> = {
  SIN_FLOTA_OPERATIVA: 'No hay vehículos operativos con conductor.',
  CAPACIDAD_EXCEDIDA: 'Ningún vehículo soporta ese peso.',
  VOLUMEN_EXCEDIDO: 'Ningún vehículo soporta ese volumen.',
  SIN_REFRIGERACION: 'No hay vehículos refrigerados con conductor.',
  SIN_HABILITACION_HAZMAT: 'No hay pareja vehículo+conductor habilitada para HAZMAT.',
  CARGA_INDIVISIBLE_EXCEDE_CAPACIDAD: 'Ningún vehículo puede llevar ese peso y la carga no es divisible.',
  DEMASIADAS_PARTES: 'Dividir la carga necesitaría más de 10 vehículos.',
};

/**
 * Nombres legibles de los eventos y tipos que emite el backend (tomados del código de cada servicio).
 * Lo que no esté aquí se muestra con `humanizar` del texto original.
 */
export const ETIQUETAS: Record<string, string> = {
  // Bitácora del envío (shipment-service)
  creado: 'Creado',
  asignado: 'Asignado',
  sin_asignacion: 'Sin asignación',
  en_transito: 'En tránsito',
  retenido_aduana: 'Retenido en aduana',
  liberado_aduana: 'Liberado por aduana',
  con_incidencia: 'Con incidencia',
  llegada_destino: 'Llegó al destino',
  entregado: 'Entregado',
  devuelto: 'Devuelto',
  programado: 'Programado',
  cancelado: 'Cancelado',
  reprogramado: 'Reprogramado',
  activado: 'Salió de la programación',
  pago_confirmado: 'Pago confirmado',
  dividido: 'Carga dividida en partes',
  // Bitácora del viaje (tracking-ingestion-service)
  creada: 'Viaje programado',
  inicio: 'Inicio del viaje',
  parada_alcanzada: 'Parada alcanzada',
  recarga: 'Recarga de combustible',
  reanuda_marcha: 'Reanuda la marcha',
  pausa_aduana: 'Pausa por aduana',
  reanudacion_aduana: 'Reanudación tras aduana',
  llegada: 'Llegada',
  entrega_manual: 'Entrega manual',
  cancelada: 'Viaje cancelado',
  // Eventos entre servicios (analítica y notificaciones)
  'shipment.created': 'Envío creado',
  'route.assigned': 'Ruta asignada',
  'tracking.trip_started': 'Viaje iniciado',
  'shipment.delivered': 'Envío entregado',
  'shipment.incident': 'Incidencia en el envío',
  'shipment.returned': 'Envío devuelto',
  'shipment.cancelled': 'Envío cancelado',
  'customs.cleared': 'Aduana liberó el envío',
  'customs.held': 'Aduana retuvo el envío',
  'maintenance.alert': 'Alerta de mantenimiento',
  // Tipos de mantenimiento (los automáticos los crea maintenance-service)
  cambio_aceite: 'Cambio de aceite',
  revision_frenos: 'Revisión de frenos',
  cambio_llantas: 'Cambio de llantas',
  alineacion_balanceo: 'Alineación y balanceo',
  revision_tecnomecanica: 'Revisión técnico-mecánica',
  revision_motor: 'Revisión del motor',
  cambio_filtros: 'Cambio de filtros',
  revision_temperatura_motor: 'Revisión por temperatura del motor',
  diagnostico_obd2: 'Diagnóstico OBD-II',
  preventivo_kilometraje: 'Preventivo por kilometraje',
  // Documentos aduaneros
  factura_comercial: 'Factura comercial',
  certificado_origen: 'Certificado de origen',
  declaracion_aduanera: 'Declaración aduanera',
};

/** Etiqueta legible de un valor del backend (evento, tipo de mantenimiento, documento…). */
export function humanizar(v: string | null | undefined): string {
  if (!v) return '—';
  return ETIQUETAS[v] ?? humanizarTexto(v);
}

/** Texto de días restantes: negativo = vencido. */
export function diasRestantes(d: number | null | undefined): string {
  if (d === null || d === undefined) return 'sin fecha';
  if (d < 0) return `venció hace ${Math.abs(d)} día${Math.abs(d) === 1 ? '' : 's'}`;
  if (d === 0) return 'vence hoy';
  return `en ${d} día${d === 1 ? '' : 's'}`;
}
