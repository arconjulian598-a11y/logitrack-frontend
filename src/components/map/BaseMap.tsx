import type { LatLngBoundsExpression, LatLngExpression } from 'leaflet';
import { useEffect, type ReactNode } from 'react';
import { MapContainer, TileLayer, useMap, ZoomControl } from 'react-leaflet';
import { config } from '@/lib/config';
import { cn } from '@/lib/utils';

/** Centro por defecto: Colombia (el catálogo de ubicaciones es Colombia + Sudamérica). */
const CENTRO_COLOMBIA: LatLngExpression = [5.2, -74.3];

export function BaseMap({
  children,
  className,
  centro = CENTRO_COLOMBIA,
  zoom = 6,
  etiqueta,
}: {
  children?: ReactNode;
  className?: string;
  centro?: LatLngExpression;
  zoom?: number;
  etiqueta: string;
}) {
  return (
    <div className={cn('relative isolate overflow-hidden', className)} role="region" aria-label={etiqueta}>
      <MapContainer
        center={centro}
        zoom={zoom}
        minZoom={3}
        maxZoom={18}
        scrollWheelZoom
        className="size-full"
        attributionControl
        zoomControl={false}
      >
        <ZoomControl position="bottomright" />
        <PrefijoAtribucion />
        <TileLayer url={config.mapa.tileUrl} attribution={config.mapa.atribucion} maxZoom={19} />
        {children}
      </MapContainer>
    </div>
  );
}

/** Atribución sin la bandera por defecto de Leaflet (se mantiene el crédito a Leaflet y OSM). */
function PrefijoAtribucion() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noreferrer">Leaflet</a>');
  }, [map]);
  return null;
}

/** Ajusta la vista a unos límites cuando cambian (clave estable para no saltar en cada refresco). */
export function AjustarVista({
  limites,
  clave,
  padding = 40,
  maxZoom = 11,
}: {
  limites: LatLngBoundsExpression | null;
  clave: string;
  padding?: number;
  maxZoom?: number;
}) {
  const map = useMap();
  useEffect(() => {
    if (!limites) return;
    try {
      map.fitBounds(limites, { padding: [padding, padding], maxZoom });
    } catch {
      /* límites vacíos */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, map]);
  return null;
}

/** Recalcula el tamaño del mapa cuando cambia el contenedor (paneles plegables, móvil). */
export function InvalidarTamano({ dep }: { dep: unknown }) {
  const map = useMap();
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 220);
    return () => clearTimeout(t);
  }, [dep, map]);
  return null;
}
