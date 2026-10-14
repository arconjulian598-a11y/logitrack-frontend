/**
 * Consultas (lecturas) con TanStack Query. Cada hook envuelve una ruta pública del gateway.
 * La cancelación de peticiones obsoletas se hace pasando `signal` al cliente HTTP.
 */
import { keepPreviousData, useQueries, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import * as api from '@/lib/api/endpoints';
import { ApiError } from '@/lib/api/errors';
import { config } from '@/lib/config';
import type * as T from '@/lib/types/api';

export const qk = {
  estado: ['gateway', 'estado'] as const,
  clientes: (f: object = {}) => ['clientes', 'lista', f] as const,
  cliente: (id: string) => ['clientes', 'detalle', id] as const,
  ubicaciones: (f: object = {}) => ['ubicaciones', 'lista', f] as const,
  ubicacion: (id: string) => ['ubicaciones', 'detalle', id] as const,
  paises: ['ubicaciones', 'paises'] as const,
  vehiculos: ['vehiculos', 'lista'] as const,
  vehiculo: (id: string) => ['vehiculos', 'detalle', id] as const,
  conductores: ['conductores', 'lista'] as const,
  conductor: (id: string) => ['conductores', 'detalle', id] as const,
  auditoria: ['conductores', 'auditoria'] as const,
  viabilidad: (b: object) => ['flota', 'viabilidad', b] as const,
  reserva: (envioId: string) => ['flota', 'reserva', envioId] as const,
  envios: (f: object = {}) => ['envios', 'lista', f] as const,
  envio: (id: string) => ['envios', 'detalle', id] as const,
  enviosEventos: (id: string) => ['envios', 'eventos', id] as const,
  pod: (id: string) => ['envios', 'pod', id] as const,
  rutasMaestras: (f: object = {}) => ['rutasMaestras', 'lista', f] as const,
  rutaMaestra: (id: string) => ['rutasMaestras', 'detalle', id] as const,
  geometria: (id: string) => ['rutasMaestras', 'geometria', id] as const,
  rutas: (f: object = {}) => ['rutas', 'lista', f] as const,
  ruta: (id: string) => ['rutas', 'detalle', id] as const,
  rutaHistorial: (id: string) => ['rutas', 'historial', id] as const,
  seguimientoFlota: ['seguimiento', 'flota'] as const,
  seguimientoEnvio: (id: string) => ['seguimiento', 'envio', id] as const,
  seguimientoVehiculo: (id: string) => ['seguimiento', 'vehiculo', id] as const,
  trazado: (id: string) => ['seguimiento', 'trazado', id] as const,
  recorrido: (id: string) => ['seguimiento', 'recorrido', id] as const,
  simulaciones: (f: object = {}) => ['simulaciones', 'lista', f] as const,
  simulacion: (envioId: string) => ['simulaciones', 'envio', envioId] as const,
  simulacionEventos: (envioId: string) => ['simulaciones', 'eventos', envioId] as const,
  telemetria: (vehiculoId: string, f: object = {}) => ['telemetria', vehiculoId, f] as const,
  ultimaLectura: (vehiculoId: string) => ['telemetria', vehiculoId, 'ultima'] as const,
  programas: (vehiculoId: string) => ['mantenimiento', 'programas', vehiculoId] as const,
  intervenciones: (vehiculoId: string) => ['mantenimiento', 'intervenciones', vehiculoId] as const,
  declaraciones: (f: object = {}) => ['aduanas', 'lista', f] as const,
  declaracionEnvio: (envioId: string) => ['aduanas', 'envio', envioId] as const,
  notificaciones: (limite: number) => ['notificaciones', limite] as const,
  preferencia: (clienteId: string) => ['preferencias', clienteId] as const,
  tarifa: (clienteId: string) => ['tarifas', clienteId] as const,
  costosRuta: (f: object = {}) => ['costosRuta', f] as const,
  facturas: (f: object = {}) => ['facturas', 'lista', f] as const,
  factura: (id: string) => ['facturas', 'detalle', id] as const,
  resumen: ['analitica', 'resumen'] as const,
  entregasDiarias: (dias: number) => ['analitica', 'entregas', dias] as const,
  utilizacion: ['analitica', 'utilizacion'] as const,
  costoKm: ['analitica', 'costoKm'] as const,
  eficiencia: (limite: number) => ['analitica', 'eficiencia', limite] as const,
  proyeccion: (f: object) => ['analitica', 'proyeccion', f] as const,
  actividad: (limite: number) => ['analitica', 'actividad', limite] as const,
};

type Opc<TData> = Omit<UseQueryOptions<TData, Error, TData, readonly unknown[]>, 'queryKey' | 'queryFn'>;

/** 404 es una respuesta válida en algunas consultas (sin viaje, sin tarifa, sin prueba…). */
export function es404(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

// ---------- Gateway ----------
export const useEstadoSistema = (o?: Opc<T.EstadoSistema>) =>
  useQuery({ queryKey: qk.estado, queryFn: ({ signal }) => api.gateway.estado({ signal }), refetchInterval: 30000, ...o });

// ---------- Clientes ----------
export const useClientes = (f: { q?: string; activo?: boolean; limite?: number } = {}, o?: Opc<T.Cliente[]>) =>
  useQuery({
    queryKey: qk.clientes(f),
    queryFn: ({ signal }) => api.clientes.listar(f, { signal }),
    placeholderData: keepPreviousData,
    ...o,
  });
export const useCliente = (id?: string) =>
  useQuery({ queryKey: qk.cliente(id ?? ''), queryFn: ({ signal }) => api.clientes.obtener(id!, { signal }), enabled: !!id });

// ---------- Ubicaciones ----------
export const useUbicaciones = (
  f: { q?: string; pais?: string; tipo?: string; incluir_inactivas?: boolean; limite?: number } = {},
  o?: Opc<T.Ubicacion[]>,
) =>
  useQuery({
    queryKey: qk.ubicaciones(f),
    queryFn: ({ signal }) => api.ubicaciones.listar(f, { signal }),
    placeholderData: keepPreviousData,
    ...o,
  });
export const useUbicacion = (id?: string | null) =>
  useQuery({ queryKey: qk.ubicacion(id ?? ''), queryFn: ({ signal }) => api.ubicaciones.obtener(id!, { signal }), enabled: !!id });
export const usePaises = () =>
  useQuery({ queryKey: qk.paises, queryFn: ({ signal }) => api.ubicaciones.paises({ signal }), staleTime: 5 * 60_000 });

// ---------- Flota ----------
export const useVehiculos = (o?: Opc<T.Vehiculo[]>) =>
  useQuery({ queryKey: qk.vehiculos, queryFn: ({ signal }) => api.vehiculos.listar({ signal }), ...o });
export const useVehiculo = (id?: string) =>
  useQuery({ queryKey: qk.vehiculo(id ?? ''), queryFn: ({ signal }) => api.vehiculos.obtener(id!, { signal }), enabled: !!id });
export const useConductores = (o?: Opc<T.Conductor[]>) =>
  useQuery({ queryKey: qk.conductores, queryFn: ({ signal }) => api.conductores.listar({ signal }), ...o });
export const useConductor = (id?: string) =>
  useQuery({
    queryKey: qk.conductor(id ?? ''),
    queryFn: ({ signal }) => api.conductores.obtener(id!, { signal }),
    enabled: !!id,
  });
export const useAuditoriaVinculos = () =>
  useQuery({ queryKey: qk.auditoria, queryFn: ({ signal }) => api.conductores.auditoriaVinculos({ signal }) });
export const useViabilidad = (b: T.ViabilidadSolicitud | null) =>
  useQuery({
    queryKey: qk.viabilidad(b ?? {}),
    queryFn: ({ signal }) => api.flota.viabilidad(b!, { signal }),
    enabled: !!b && b.peso_kg > 0,
    staleTime: 10_000,
  });
export const useReserva = (envioId?: string, o?: Opc<T.ReservaFlota>) =>
  useQuery({
    queryKey: qk.reserva(envioId ?? ''),
    queryFn: ({ signal }) => api.flota.reservaDeEnvio(envioId!, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !es404(e) && n < 2,
    ...o,
  });

// ---------- Envíos ----------
export const useEnvios = (f: { estado?: string; cliente_id?: string } = {}, o?: Opc<T.Envio[]>) =>
  useQuery({
    queryKey: qk.envios(f),
    queryFn: ({ signal }) => api.envios.listar(f, { signal }),
    refetchInterval: config.poll.listasMs,
    placeholderData: keepPreviousData,
    ...o,
  });
export const useEnvio = (id?: string, o?: Opc<T.Envio>) =>
  useQuery({ queryKey: qk.envio(id ?? ''), queryFn: ({ signal }) => api.envios.obtener(id!, { signal }), enabled: !!id, ...o });
export const useEnvioEventos = (id?: string, o?: Opc<T.EnvioEvento[]>) =>
  useQuery({
    queryKey: qk.enviosEventos(id ?? ''),
    queryFn: ({ signal }) => api.envios.eventos(id!, { signal }),
    enabled: !!id,
    ...o,
  });
export const usePruebaEntrega = (id?: string, o?: Opc<T.PruebaEntrega>) =>
  useQuery({
    queryKey: qk.pod(id ?? ''),
    queryFn: ({ signal }) => api.envios.pruebaEntrega(id!, { signal }),
    enabled: !!id,
    retry: (n, e) => !es404(e) && n < 2,
    ...o,
  });

// ---------- Rutas ----------
export const useRutasMaestras = (
  f: { origen_codigo?: string; destino_codigo?: string; fuente?: string; limite?: number } = {},
) =>
  useQuery({
    queryKey: qk.rutasMaestras(f),
    queryFn: ({ signal }) => api.rutasMaestras.listar(f, { signal }),
    placeholderData: keepPreviousData,
  });
export const useRutaMaestra = (id?: string | null) =>
  useQuery({
    queryKey: qk.rutaMaestra(id ?? ''),
    queryFn: ({ signal }) => api.rutasMaestras.obtener(id!, { signal }),
    enabled: !!id,
    staleTime: 60_000,
  });
export const useGeometria = (id?: string | null) =>
  useQuery({
    queryKey: qk.geometria(id ?? ''),
    queryFn: ({ signal }) => api.rutasMaestras.geometria(id!, { signal }),
    enabled: !!id,
    staleTime: 5 * 60_000,
  });
export const useRutas = (f: { envio_id?: string; estado?: string } = {}, o?: Opc<T.Ruta[]>) =>
  useQuery({
    queryKey: qk.rutas(f),
    queryFn: ({ signal }) => api.rutas.listar(f, { signal }),
    placeholderData: keepPreviousData,
    ...o,
  });
export const useRuta = (id?: string | null) =>
  useQuery({ queryKey: qk.ruta(id ?? ''), queryFn: ({ signal }) => api.rutas.obtener(id!, { signal }), enabled: !!id });
export const useRutaHistorial = (id?: string | null) =>
  useQuery({
    queryKey: qk.rutaHistorial(id ?? ''),
    queryFn: ({ signal }) => api.rutas.historial(id!, { signal }),
    enabled: !!id,
  });

// ---------- Seguimiento ----------
export const useSeguimientoFlota = (o?: Opc<T.SeguimientoResumen[]>) =>
  useQuery({
    queryKey: qk.seguimientoFlota,
    queryFn: ({ signal }) => api.seguimiento.flota({ signal }),
    refetchInterval: config.poll.flotaMs,
    ...o,
  });

const FINALES_VIAJE = ['finalizada', 'cancelada'];

/** Ficha del viaje con polling; se detiene cuando el viaje termina (contrato 5.3). */
export const useSeguimientoEnvio = (envioId?: string | null, o?: Opc<T.Seguimiento>) =>
  useQuery({
    queryKey: qk.seguimientoEnvio(envioId ?? ''),
    queryFn: ({ signal }) => api.seguimiento.porEnvio(envioId!, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !(e instanceof ApiError && (e.status === 404 || e.status === 409)) && n < 2,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d && FINALES_VIAJE.includes(d.estado_viaje)) return false;
      return config.poll.seguimientoMs;
    },
    ...o,
  });
export const useSeguimientoVehiculo = (vehiculoId?: string | null) =>
  useQuery({
    queryKey: qk.seguimientoVehiculo(vehiculoId ?? ''),
    queryFn: ({ signal }) => api.seguimiento.porVehiculo(vehiculoId!, { signal }),
    enabled: !!vehiculoId,
    retry: (n, e) => !es404(e) && n < 2,
    refetchInterval: (q) => (q.state.error && es404(q.state.error) ? 15000 : config.poll.seguimientoMs),
  });
/** El trazado no cambia durante el viaje: se pide una vez. */
export const useTrazado = (envioId?: string | null) =>
  useQuery({
    queryKey: qk.trazado(envioId ?? ''),
    queryFn: ({ signal }) => api.seguimiento.trazado(envioId!, { signal }),
    enabled: !!envioId,
    staleTime: Infinity,
    retry: (n, e) => (e instanceof ApiError && e.status === 409 ? n < 6 : !es404(e) && n < 2),
    retryDelay: 3000,
  });
export const useRecorrido = (envioId?: string | null, activo = true) =>
  useQuery({
    queryKey: qk.recorrido(envioId ?? ''),
    queryFn: ({ signal }) => api.seguimiento.recorrido(envioId!, 500, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !es404(e) && n < 2,
    refetchInterval: activo ? config.poll.seguimientoMs * 3 : false,
  });

// ---------- Simulaciones ----------
export const useSimulaciones = (f: { estado?: string; limite?: number } = {}) =>
  useQuery({
    queryKey: qk.simulaciones(f),
    queryFn: ({ signal }) => api.simulaciones.listar(f, { signal }),
    refetchInterval: config.poll.listasMs,
    placeholderData: keepPreviousData,
  });
export const useSimulacion = (envioId?: string | null, o?: Opc<T.Simulacion>) =>
  useQuery({
    queryKey: qk.simulacion(envioId ?? ''),
    queryFn: ({ signal }) => api.simulaciones.deEnvio(envioId!, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !es404(e) && n < 2,
    ...o,
  });
export const useSimulacionEventos = (envioId?: string | null, o?: Opc<T.SimulacionEvento[]>) =>
  useQuery({
    queryKey: qk.simulacionEventos(envioId ?? ''),
    queryFn: ({ signal }) => api.simulaciones.eventos(envioId!, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !es404(e) && n < 2,
    ...o,
  });

// ---------- Telemetría ----------
export const useTelemetria = (
  vehiculoId?: string | null,
  f: { desde?: string; hasta?: string; limite?: number } = {},
  o?: Opc<T.LecturaTelemetria[]>,
) =>
  useQuery({
    queryKey: qk.telemetria(vehiculoId ?? '', f),
    queryFn: ({ signal }) => api.telemetria.lecturas(vehiculoId!, f, { signal }),
    enabled: !!vehiculoId,
    placeholderData: keepPreviousData,
    ...o,
  });

/**
 * Última lectura de telemetría de varios vehículos (limite=1). Es la única fuente de posición
 * para vehículos sin viaje activo: el backend no expone un endpoint de «posición actual».
 */
export function useUltimasLecturas(vehiculoIds: string[], habilitado = true) {
  return useQueries({
    queries: vehiculoIds.map((id) => ({
      queryKey: qk.ultimaLectura(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => api.telemetria.lecturas(id, { limite: 1 }, { signal }),
      enabled: habilitado,
      refetchInterval: config.poll.ultimaPosicionMs,
      staleTime: config.poll.ultimaPosicionMs / 2,
      select: (d: T.LecturaTelemetria[]) => d[0] ?? null,
    })),
  });
}

// ---------- Mantenimiento ----------
export const useProgramas = (vehiculoId?: string | null) =>
  useQuery({
    queryKey: qk.programas(vehiculoId ?? ''),
    queryFn: ({ signal }) => api.mantenimiento.programas(vehiculoId!, { signal }),
    enabled: !!vehiculoId,
  });
export const useIntervenciones = (vehiculoId?: string | null) =>
  useQuery({
    queryKey: qk.intervenciones(vehiculoId ?? ''),
    queryFn: ({ signal }) => api.mantenimiento.intervenciones(vehiculoId!, { signal }),
    enabled: !!vehiculoId,
  });

// ---------- Aduanas ----------
export const useDeclaraciones = (f: { estado?: string } = {}, o?: Opc<T.DeclaracionAduanera[]>) =>
  useQuery({
    queryKey: qk.declaraciones(f),
    queryFn: ({ signal }) => api.aduanas.listar(f, { signal }),
    refetchInterval: config.poll.listasMs * 2,
    placeholderData: keepPreviousData,
    ...o,
  });
export const useDeclaracionEnvio = (envioId?: string | null, o?: Opc<T.DeclaracionAduanera>) =>
  useQuery({
    queryKey: qk.declaracionEnvio(envioId ?? ''),
    queryFn: ({ signal }) => api.aduanas.deEnvio(envioId!, { signal }),
    enabled: !!envioId,
    retry: (n, e) => !es404(e) && n < 2,
    ...o,
  });

// ---------- Notificaciones ----------
export const useNotificaciones = (limite = 50, o?: Opc<T.Notificacion[]>) =>
  useQuery({
    queryKey: qk.notificaciones(limite),
    queryFn: ({ signal }) => api.notificaciones.listar(limite, { signal }),
    refetchInterval: 15000,
    placeholderData: keepPreviousData,
    ...o,
  });
export const usePreferencia = (clienteId?: string | null) =>
  useQuery({
    queryKey: qk.preferencia(clienteId ?? ''),
    queryFn: ({ signal }) => api.notificaciones.preferencia(clienteId!, { signal }),
    enabled: !!clienteId,
  });

// ---------- Facturación ----------
export const useTarifa = (clienteId?: string | null) =>
  useQuery({
    queryKey: qk.tarifa(clienteId ?? ''),
    queryFn: ({ signal }) => api.facturacion.tarifa(clienteId!, { signal }),
    enabled: !!clienteId,
    retry: (n, e) => !es404(e) && n < 2,
  });
export const useCostosRuta = (f: { envio_id?: string } = {}, o?: Opc<T.CostoRuta[]>) =>
  useQuery({ queryKey: qk.costosRuta(f), queryFn: ({ signal }) => api.facturacion.costosRuta(f, { signal }), ...o });
export const useFacturas = (f: { cliente_id?: string; periodo?: string; estado?: string } = {}) =>
  useQuery({
    queryKey: qk.facturas(f),
    queryFn: ({ signal }) => api.facturacion.facturas(f, { signal }),
    placeholderData: keepPreviousData,
  });
export const useFactura = (id?: string | null) =>
  useQuery({ queryKey: qk.factura(id ?? ''), queryFn: ({ signal }) => api.facturacion.factura(id!, { signal }), enabled: !!id });

// ---------- Analítica ----------
export const useResumen = (o?: Opc<T.ResumenEjecutivo>) =>
  useQuery({ queryKey: qk.resumen, queryFn: ({ signal }) => api.analitica.resumen({ signal }), refetchInterval: 60000, ...o });
export const useEntregasDiarias = (dias = 30) =>
  useQuery({
    queryKey: qk.entregasDiarias(dias),
    queryFn: ({ signal }) => api.analitica.entregasDiarias(dias, { signal }),
    placeholderData: keepPreviousData,
  });
export const useUtilizacionFlota = () =>
  useQuery({ queryKey: qk.utilizacion, queryFn: ({ signal }) => api.analitica.utilizacionFlota({ signal }) });
export const useCostoPorKm = () =>
  useQuery({ queryKey: qk.costoKm, queryFn: ({ signal }) => api.analitica.costoPorKm({ signal }) });
export const useEficienciaCombustible = (limite = 50) =>
  useQuery({
    queryKey: qk.eficiencia(limite),
    queryFn: ({ signal }) => api.analitica.eficienciaCombustible(limite, { signal }),
  });
export const useProyeccionMantenimiento = (f: { dias?: number; todos?: boolean } = {}) =>
  useQuery({
    queryKey: qk.proyeccion(f),
    queryFn: ({ signal }) => api.analitica.proyeccionMantenimiento(f, { signal }),
    placeholderData: keepPreviousData,
  });
export const useActividadReciente = (limite = 20, o?: Opc<T.ActividadReciente[]>) =>
  useQuery({
    queryKey: qk.actividad(limite),
    queryFn: ({ signal }) => api.analitica.actividadReciente(limite, { signal }),
    refetchInterval: 60000,
    ...o,
  });
