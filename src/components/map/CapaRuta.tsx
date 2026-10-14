import type { LatLngExpression } from 'leaflet';
import { CircleMarker, Marker, Polyline, Tooltip } from 'react-leaflet';
import type { ParadaSeguimiento, PuntoGeo } from '@/lib/types/api';
import { iconoExtremo } from './iconos';

const COLOR_PARADA: Record<string, string> = {
  pasada: '#6b7890',
  proxima: '#2a5cff',
  pendiente: '#ffffff',
};

/**
 * Trazado de una ruta con datos del backend: puntos `[lat, lon]`, paradas y extremos.
 * `estimada` = la ruta se calculó sin OSRM (línea recta corregida): se dibuja punteada.
 */
export function CapaRuta({
  puntos,
  paradas = [],
  origen,
  destino,
  recorrido,
  estimada,
}: {
  puntos: number[][];
  paradas?: ParadaSeguimiento[] | { nombre?: string | null; latitud?: number | null; longitud?: number | null; km_desde_origen?: number | null; estado?: string }[];
  origen?: PuntoGeo | null;
  destino?: PuntoGeo | null;
  recorrido?: [number, number][];
  estimada?: boolean;
}) {
  const linea = puntos.filter((p) => p.length >= 2).map((p) => [p[0]!, p[1]!] as LatLngExpression);
  return (
    <>
      {linea.length > 1 && (
        <>
          <Polyline positions={linea} pathOptions={{ color: '#0e1b33', weight: 7, opacity: 0.15 }} />
          <Polyline
            positions={linea}
            pathOptions={{ color: '#2a5cff', weight: 4, opacity: 0.85, dashArray: estimada ? '8 8' : undefined }}
          />
        </>
      )}
      {recorrido && recorrido.length > 1 && (
        <Polyline positions={recorrido} pathOptions={{ color: '#12805c', weight: 5, opacity: 0.9 }} />
      )}
      {paradas
        .filter((p) => typeof p.latitud === 'number' && typeof p.longitud === 'number')
        .map((p, i) => (
          <CircleMarker
            key={i}
            center={[p.latitud as number, p.longitud as number]}
            radius={5}
            pathOptions={{
              color: '#0e1b33',
              weight: 1.5,
              fillColor: COLOR_PARADA[p.estado ?? 'pendiente'] ?? '#fff',
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -4]}>
              {p.nombre ?? 'Parada'}
              {typeof p.km_desde_origen === 'number' ? `, km ${Math.round(p.km_desde_origen)}` : ''}
              {p.estado ? `, ${p.estado === 'pasada' ? 'pasada' : p.estado === 'proxima' ? 'próxima' : 'pendiente'}` : ''}
            </Tooltip>
          </CircleMarker>
        ))}
      {origen && (
        <Marker position={[origen.latitud, origen.longitud]} icon={iconoExtremo('origen')} title={`Origen: ${origen.nombre ?? ''}`}>
          <Tooltip direction="top" offset={[0, -10]}>Origen: {origen.nombre}</Tooltip>
        </Marker>
      )}
      {destino && (
        <Marker position={[destino.latitud, destino.longitud]} icon={iconoExtremo('destino')} title={`Destino: ${destino.nombre ?? ''}`}>
          <Tooltip direction="top" offset={[0, -10]}>Destino: {destino.nombre}</Tooltip>
        </Marker>
      )}
    </>
  );
}
