import { useMemo } from 'react';
import { useConductores, useSeguimientoFlota, useUltimasLecturas, useVehiculos } from '@/hooks/queries';
import type { LecturaTelemetria } from '@/lib/types/api';
import { construirVista } from './posiciones';

/** Vista combinada de la flota para el mapa (vehículos + conductores + viajes + últimas lecturas). */
export function useVistaFlota() {
  const vehiculos = useVehiculos();
  const conductores = useConductores();
  const flota = useSeguimientoFlota();

  const enViaje = useMemo(() => new Set((flota.data ?? []).map((f) => f.vehiculo_id)), [flota.data]);
  // Solo se pide la última lectura de los vehículos que no están en un viaje con posición en vivo.
  const sinVivo = useMemo(
    () => (vehiculos.data ?? []).map((v) => v.id).filter((id) => !enViaje.has(id)),
    [vehiculos.data, enViaje],
  );
  const ultimas = useUltimasLecturas(sinVivo, !!flota.data || !!flota.error);

  // Cálculo barato (un elemento por vehículo): se hace en cada render, sin memo.
  const mapaUltimas = new Map<string, { lectura: LecturaTelemetria | null | undefined; cargando: boolean }>();
  sinVivo.forEach((id, i) => {
    const q = ultimas[i];
    mapaUltimas.set(id, { lectura: q?.data as LecturaTelemetria | null | undefined, cargando: !!q?.isLoading });
  });

  const vista = construirVista(vehiculos.data ?? [], conductores.data ?? [], flota.data ?? [], mapaUltimas);

  const erroresTelemetria = ultimas.filter((q) => q.error).length;

  return {
    vista,
    cargando: vehiculos.isLoading,
    errorVehiculos: vehiculos.error,
    errorFlota: flota.error,
    errorConductores: conductores.error,
    erroresTelemetria,
    actualizadoEn: flota.dataUpdatedAt,
    refrescando: flota.isFetching,
    refrescar: () => {
      void vehiculos.refetch();
      void flota.refetch();
      void conductores.refetch();
    },
  };
}
