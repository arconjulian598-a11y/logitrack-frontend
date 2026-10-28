/**
 * Une las tres fuentes reales de posición del backend en una sola vista por vehículo.
 *
 * 1. `GET /seguimiento/flota`: posición en vivo de los vehículos con viaje `en_curso` o `pausada`.
 * 2. `GET /vehiculos`: ubicación base registrada en Fleet (si es confiable) o, si es más reciente,
 *    `GET /telemetria/{vehiculo_id}?limite=1`: última lectura registrada (histórica).
 * 3. Sin ninguna: el vehículo se lista «sin coordenadas» y no se dibuja.
 *
 * Nunca se inventan posiciones. Estado operativo (color) y procedencia de la posición
 * (relleno sólido = en vivo, borde punteado = última conocida) son ejes independientes.
 */
import { sinUbicacion } from '@/lib/dominio';
import { num } from '@/lib/format';
import type { Conductor, LecturaTelemetria, SeguimientoResumen, Vehiculo } from '@/lib/types/api';

export type FuentePosicion = 'en_vivo' | 'registrada' | 'historica' | 'sin_datos' | 'cargando';

export type EstadoMapa =
  | 'en_ruta'
  | 'detenido_aduana'
  | 'asignado'
  | 'libre'
  | 'mantenimiento'
  | 'fuera_servicio';

export interface VehiculoMapa {
  vehiculo: Vehiculo;
  conductor: Conductor | null;
  fuente: FuentePosicion;
  latitud: number | null;
  longitud: number | null;
  /** Momento de la posición: lectura de telemetría (histórica) o null en vivo (ver ficha del viaje). */
  posicionEn: string | null;
  velocidadKmh: number | null;
  combustiblePct: number | null;
  viaje: SeguimientoResumen | null;
  estadoMapa: EstadoMapa;
}

export const ESTADOS_MAPA: Record<EstadoMapa, { etiqueta: string; color: string }> = {
  en_ruta: { etiqueta: 'En ruta', color: 'var(--primary)' },
  detenido_aduana: { etiqueta: 'Detenido por aduana', color: 'var(--danger)' },
  asignado: { etiqueta: 'Asignado, viaje por iniciar', color: '#7a5af8' },
  libre: { etiqueta: 'Disponible', color: 'var(--ok)' },
  mantenimiento: { etiqueta: 'En mantenimiento', color: 'var(--warn)' },
  fuera_servicio: { etiqueta: 'Fuera de servicio', color: '#6b7890' },
};

export function estadoMapa(v: Vehiculo, viaje: SeguimientoResumen | null): EstadoMapa {
  if (viaje) return viaje.estado === 'pausada' ? 'detenido_aduana' : 'en_ruta';
  if (v.estado === 'en_mantenimiento') return 'mantenimiento';
  if (v.estado === 'fuera_de_servicio') return 'fuera_servicio';
  if (v.estado === 'en_transito') return 'asignado';
  return 'libre';
}

export function construirVista(
  vehiculos: Vehiculo[],
  conductores: Conductor[],
  flota: SeguimientoResumen[],
  ultimas: Map<string, { lectura: LecturaTelemetria | null | undefined; cargando: boolean }>,
): VehiculoMapa[] {
  const conductorDe = new Map(conductores.filter((c) => c.vehiculo_id).map((c) => [c.vehiculo_id!, c]));
  const viajeDe = new Map(flota.map((f) => [f.vehiculo_id, f]));

  return vehiculos.map((v) => {
    const viaje = viajeDe.get(v.id) ?? null;
    const conductor = conductorDe.get(v.id) ?? null;
    const base = { vehiculo: v, conductor, viaje, estadoMapa: estadoMapa(v, viaje) };

    if (viaje && viaje.latitud !== null && viaje.longitud !== null) {
      return {
        ...base,
        fuente: 'en_vivo' as const,
        latitud: viaje.latitud,
        longitud: viaje.longitud,
        posicionEn: null,
        velocidadKmh: viaje.velocidad_actual_kmh,
        combustiblePct: viaje.combustible_pct,
      };
    }

    const u = ultimas.get(v.id);
    const lat = num(u?.lectura?.latitud);
    const lng = num(u?.lectura?.longitud);
    const conLectura = !!u?.lectura && lat !== null && lng !== null;

    // Ubicación base de Fleet (fijada por el gestor o al entregar): se usa salvo que la lectura sea más reciente
    const baseLat = num(v.latitud);
    const baseLng = num(v.longitud);
    if (!sinUbicacion(v) && baseLat !== null && baseLng !== null) {
      const tBase = v.ubicacion_actualizada_en ? Date.parse(v.ubicacion_actualizada_en) : 0;
      const tLectura = conLectura ? Date.parse(u!.lectura!.tiempo) : -Infinity;
      if (!(tLectura > tBase)) {
        return {
          ...base,
          fuente: 'registrada' as const,
          latitud: baseLat,
          longitud: baseLng,
          posicionEn: v.ubicacion_actualizada_en ?? null,
          velocidadKmh: null,
          combustiblePct: null,
        };
      }
    }

    if (u?.lectura && lat !== null && lng !== null) {
      return {
        ...base,
        fuente: 'historica' as const,
        latitud: lat,
        longitud: lng,
        posicionEn: u.lectura.tiempo,
        velocidadKmh: num(u.lectura.velocidad_kmh),
        combustiblePct: num(u.lectura.nivel_combustible_pct),
      };
    }

    return {
      ...base,
      fuente: u?.cargando ? ('cargando' as const) : ('sin_datos' as const),
      latitud: null,
      longitud: null,
      posicionEn: null,
      velocidadKmh: viaje?.velocidad_actual_kmh ?? null,
      combustiblePct: viaje?.combustible_pct ?? null,
    };
  });
}

export function tienePosicion(v: VehiculoMapa): v is VehiculoMapa & { latitud: number; longitud: number } {
  return v.latitud !== null && v.longitud !== null;
}
