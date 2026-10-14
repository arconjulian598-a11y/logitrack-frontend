import { useCallback } from 'react';
import { useFiltrosUrl } from '@/hooks/useFiltrosUrl';
import { coincide } from '@/lib/utils';
import type { VehiculoMapa } from './posiciones';

export const CLAVES_FILTRO_MAPA = ['q', 'estado', 'fuente', 'tipo'] as const;

export function useFiltroMapa() {
  const { valores, set, limpiar } = useFiltrosUrl(CLAVES_FILTRO_MAPA);
  const aplica = useCallback(
    (v: VehiculoMapa) =>
      coincide(valores.q, v.vehiculo.placa, v.conductor?.nombre, v.conductor?.codigo_conductor, v.viaje?.codigo_envio) &&
      (!valores.estado || v.estadoMapa === valores.estado) &&
      (!valores.tipo || v.vehiculo.tipo === valores.tipo) &&
      (!valores.fuente ||
        (valores.fuente === 'con_posicion' ? v.fuente === 'en_vivo' || v.fuente === 'historica' : v.fuente === valores.fuente)),
    [valores.q, valores.estado, valores.tipo, valores.fuente],
  );
  return { valores, set, limpiar, aplica };
}
