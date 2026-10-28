import type { LatLngBoundsExpression } from 'leaflet';
import { Marker } from 'react-leaflet';
import type { ParadaSeguimiento, PuntoGeo } from '@/lib/types/api';
import { AjustarVista, BaseMap } from './BaseMap';
import { CapaRuta } from './CapaRuta';
import { iconoVehiculo } from './iconos';

type Parada = ParadaSeguimiento | { nombre?: string | null; latitud?: number | null; longitud?: number | null; km_desde_origen?: number | null; estado?: string };

/**
 * Mapa de UN viaje: ruta planificada, paradas, origen/destino, estela recorrida y el vehículo.
 * Lo usan el mapa del envío del personal y el seguimiento del cliente. El vehículo se dibuja
 * SOLO en la posición que devolvió el backend; sin posición, no hay marcador.
 * `placa` es solo para el personal: el cliente no la ve.
 */
export function MapaViaje({
  etiqueta,
  clave,
  puntos,
  paradas = [],
  origen,
  destino,
  recorrido,
  estimada,
  posicion,
  placa,
  pausado,
  desactualizada,
  className = 'relative h-[360px]',
}: {
  etiqueta: string;
  /** Clave estable para encuadrar la ruta una sola vez (no en cada refresco). */
  clave: string;
  puntos: number[][];
  paradas?: Parada[];
  origen?: PuntoGeo | null;
  destino?: PuntoGeo | null;
  recorrido?: [number, number][];
  estimada?: boolean;
  posicion?: { latitud: number | null; longitud: number | null } | null;
  placa?: string;
  pausado?: boolean;
  /** Última posición conocida pero vieja: el marcador se ve atenuado (no se mueve ni se estima). */
  desactualizada?: boolean;
  className?: string;
}) {
  const hayPos = posicion?.latitud != null && posicion.longitud != null;
  const extremos = [origen, destino].filter((p): p is PuntoGeo => !!p).map((p) => [p.latitud, p.longitud] as [number, number]);
  const encuadre: [number, number][] =
    puntos.length > 1 ? (puntos.map((p) => [p[0]!, p[1]!]) as [number, number][]) : extremos.length ? extremos : hayPos ? [[posicion!.latitud!, posicion!.longitud!]] : [];
  const limites: LatLngBoundsExpression | null = encuadre.length ? encuadre : null;
  return (
    <div className={className}>
      <BaseMap className="size-full" etiqueta={etiqueta}>
        <AjustarVista limites={limites} clave={`${clave}-${puntos.length > 1 ? 'ruta' : encuadre.length ? 'puntos' : 'nada'}`} maxZoom={10} />
        {(puntos.length > 1 || origen || destino || (recorrido?.length ?? 0) > 1) && (
          <CapaRuta puntos={puntos} paradas={paradas} origen={origen} destino={destino} estimada={estimada} recorrido={recorrido} />
        )}
        {hayPos && (
          <Marker
            position={[posicion!.latitud!, posicion!.longitud!]}
            icon={iconoVehiculo({
              color: pausado ? 'var(--danger)' : 'var(--primary)',
              placa: placa ?? '',
              historica: !!desactualizada,
              seleccionado: true,
              pausado,
            })}
            title={placa ? `Vehículo ${placa}` : desactualizada ? 'Última posición conocida del vehículo' : 'Posición del vehículo'}
          />
        )}
      </BaseMap>
    </div>
  );
}
